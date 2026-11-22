<#
.SYNOPSIS
  Create or update a GitHub release and upload the ashcode package.

.DESCRIPTION
  Needs a GitHub token with contents:write (classic PAT: `repo`) scope:
  GitHub → Settings → Developer settings → Personal access tokens.
  Pass -Token, or set GITHUB_TOKEN in the environment.

  Re-running is safe: an existing release for the tag is updated so its notes
  match the matching CHANGELOG section, and an already-uploaded asset is kept.

.PARAMETER Token
  Personal access token. Default: $env:GITHUB_TOKEN.

.PARAMETER Repo
  owner/repo. Default: eiicode/ashcode.

.PARAMETER TargetCommitish
  Branch or commit the tag is created on. Default: master.

.EXAMPLE
  powershell -File scripts/release.ps1 -Token <token>

.EXAMPLE
  powershell -File scripts/release.ps1 -Token <token> -DryRun
#>
[CmdletBinding()]
param(
  [string]$Token = $env:GITHUB_TOKEN,
  [string]$Tag,
  [string]$Repo = 'eiicode/ashcode',
  [string]$Zip,
  [string]$Name,
  [string]$TargetCommitish = 'master',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$pkg = Get-Content (Join-Path $root 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($Tag)) { $Tag = "v$($pkg.version)" }
if ([string]::IsNullOrWhiteSpace($Name)) { $Name = "ashcode $($pkg.version)" }
if ([string]::IsNullOrWhiteSpace($Zip)) { $Zip = Join-Path $root "dist\ashcode-$($pkg.version)-win-x64.zip" }
if (-not (Test-Path $Zip)) { throw "release asset not found: $Zip (run scripts/pack.ps1 first)" }

# Release body = the matching CHANGELOG section, plus its English mirror.
function Get-ChangelogSection {
  param([string]$Path, [string]$Version)
  if (-not (Test-Path $Path)) { return $null }
  $lines = Get-Content $Path -Encoding UTF8
  $start = -1
  $end = $lines.Count
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^## $([regex]::Escape($Version))\b") { $start = $i; continue }
    if ($start -ge 0 -and $i -gt $start -and $lines[$i] -match '^## ') { $end = $i; break }
  }
  if ($start -lt 0) { return $null }
  return ($lines[($start + 1)..($end - 1)] -join "`n").Trim()
}

$body = Get-ChangelogSection -Path (Join-Path $root 'CHANGELOG.md') -Version $pkg.version
if ([string]::IsNullOrWhiteSpace($body)) { throw "no CHANGELOG section for $($pkg.version)" }
$englishBody = Get-ChangelogSection -Path (Join-Path $root 'CHANGELOG.en.md') -Version $pkg.version
if (-not [string]::IsNullOrWhiteSpace($englishBody)) {
  $body = "$body`n`n---`n`n## English`n`n$englishBody"
}
"tag:     $Tag"
"name:    $Name"
"repo:    $Repo"
"asset:   $Zip"
"body:    $($body.Length) chars"
if ($DryRun) { $body; return }

if ([string]::IsNullOrWhiteSpace($Token)) {
  throw 'A GitHub token is required: -Token <token> or $env:GITHUB_TOKEN'
}

$headers = @{
  Authorization          = "Bearer $Token"
  Accept                 = 'application/vnd.github+json'
  'X-GitHub-Api-Version' = '2022-11-28'
  'User-Agent'           = 'ashcode-release'
}
$api = "https://api.github.com/repos/$Repo"

# The body carries CJK text: send UTF-8 bytes explicitly. Passing a string
# straight to -Body lets PowerShell pick a lossy encoding and mangles it.
function Send-Json {
  param([string]$Method, [string]$Uri, [hashtable]$Payload, [int]$TimeoutSec = 60)
  $json = $Payload | ConvertTo-Json -Depth 4 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers `
    -ContentType 'application/json; charset=utf-8' -Body $bytes -TimeoutSec $TimeoutSec
}

$release = $null
try {
  $release = Send-Json -Method Post -Uri "$api/releases" -Payload @{
    tag_name         = $Tag
    name             = $Name
    body             = $body
    target_commitish = $TargetCommitish
    draft            = $false
    prerelease       = $false
  }
  Write-Host "created release id=$($release.id)"
} catch {
  Write-Host "create failed, updating the existing release..."
  $release = Invoke-RestMethod -Uri "$api/releases/tags/$Tag" -Headers $headers -Method Get -TimeoutSec 60
  $release = Send-Json -Method Patch -Uri "$api/releases/$($release.id)" -Payload @{
    name = $Name
    body = $body
  }
  Write-Host "updated release id=$($release.id)"
}

# Re-read the release: the update response does not reliably carry `assets`,
# and a duplicate upload is rejected by the API.
$release = Invoke-RestMethod -Uri "$api/releases/tags/$Tag" -Headers $headers -Method Get -TimeoutSec 60

# Three assets per release: the versioned zip, a stable-name alias the one-line
# installer can point at, and the installer itself.
$installScript = Join-Path $root 'scripts\install.ps1'
$uploads = @(
  @{ Path = $Zip; Name = (Split-Path $Zip -Leaf); Type = 'application/zip' },
  @{ Path = $Zip; Name = 'ashcode-latest-win-x64.zip'; Type = 'application/zip' },
  @{ Path = $installScript; Name = 'install.ps1'; Type = 'text/plain' }
)
foreach ($item in $uploads) {
  if (-not (Test-Path $item.Path)) { Write-Host "skip (missing): $($item.Path)"; continue }
  $attached = @($release.assets | Where-Object { $_.name -eq $item.Name })
  if ($attached.Count -gt 0) {
    Write-Host "asset already attached: $($item.Name)"
    continue
  }
  $asset = Invoke-RestMethod -Method Post `
    -Uri "https://uploads.github.com/repos/$Repo/releases/$($release.id)/assets?name=$($item.Name)" `
    -Headers $headers -ContentType $item.Type -InFile $item.Path -TimeoutSec 300
  if ($null -eq $asset.browser_download_url) { throw "upload failed: $($asset | ConvertTo-Json -Depth 3)" }
  Write-Host "uploaded: $($item.Name)"
}

Write-Host "release page: $($release.html_url)"
