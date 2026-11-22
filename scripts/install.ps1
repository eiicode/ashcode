<#
.SYNOPSIS
  Install ashcode — from this checkout or from a release zip (local path or URL).

.DESCRIPTION
  Works like a one-line bootstrapper: when piped (`irm ... | iex`), pass -Source
  with a zip URL. From a checkout it installs the current directory.

  Installs into <InstallDir>\app, ensures Bun (installing it via npm when
  missing), installs npm dependencies, writes a `ashcode` launcher and adds it
  to the user PATH.

.PARAMETER Source
  Release zip path or https URL. Omit when running from the repository.

.PARAMETER InstallDir
  Default: %LOCALAPPDATA%\ashcode.

.PARAMETER Force
  Replace an existing install.

.PARAMETER NoPath
  Do not modify the user PATH (testing).
#>
[CmdletBinding()]
param(
  [string]$Source,
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'ashcode'),
  [switch]$Force,
  [switch]$NoPath
)

$ErrorActionPreference = 'Stop'
# Absolute paths: the launcher must work from any working directory.
$InstallDir = [System.IO.Path]::GetFullPath($InstallDir)
$appDir = Join-Path $InstallDir 'app'
$binDir = Join-Path $InstallDir 'bin'
$shim = Join-Path $binDir 'ashcode.cmd'
$manifest = Join-Path $InstallDir 'install.json'

Write-Host 'ashcode installer' -ForegroundColor Cyan
Write-Host "  target: $InstallDir"

# ---------------------------------------------------------------- source
$localRoot = $null
if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
  $candidate = Split-Path -Parent $PSScriptRoot
  if (Test-Path (Join-Path $candidate 'package.json')) { $localRoot = $candidate }
}

$tempZip = $null
# Piped install (`irm .../install.ps1 | iex`) has no $PSScriptRoot, so fall back
# to the package published with the latest release.
$latestZipUrl = 'https://github.com/eiicode/ashcode/releases/latest/download/ashcode-latest-win-x64.zip'
if ([string]::IsNullOrWhiteSpace($Source) -and $null -ne $localRoot) {
  Write-Host "  source: $localRoot (checkout)"
} else {
  if ([string]::IsNullOrWhiteSpace($Source)) {
    $Source = $latestZipUrl
    Write-Host "  source: latest release"
  }
  if (Test-Path $Source) {
    $item = Get-Item $Source
    if ($item.PSIsContainer) { $localRoot = $item.FullName; Write-Host "  source: $($item.FullName)" }
    else { $tempZip = $item.FullName; Write-Host "  source: zip $($item.FullName)" }
  } else {
    $tempZip = Join-Path ([System.IO.Path]::GetTempPath()) "ashcode-$([guid]::NewGuid().ToString('N')).zip"
    Write-Host "  source: $Source (downloading...)"
    Invoke-WebRequest -Uri $Source -OutFile $tempZip -UseBasicParsing
  }
}

# ---------------------------------------------------------------- copy
# Versioned app directories: a running TUI locks native modules, so each
# version installs beside the old one and the launcher points at the new one.
$appsRoot = Join-Path $InstallDir 'apps'
New-Item -ItemType Directory -Force -Path $appsRoot | Out-Null
$staging = Join-Path $appsRoot ('.staging-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $staging | Out-Null

if ($null -ne $tempZip) {
  Expand-Archive -Path $tempZip -DestinationPath $staging -Force
  $entries = Get-ChildItem $staging
  if ($entries.Count -eq 1 -and $entries[0].PSIsContainer -and -not (Test-Path (Join-Path $staging 'package.json'))) {
    Get-ChildItem $entries[0].FullName | Move-Item -Destination $staging -Force
    Remove-Item $entries[0].FullName -Recurse -Force
  }
} else {
  foreach ($item in @('src', 'bin', 'scripts', 'docs', 'package.json', 'README.md', 'tsconfig.json', '.gitignore', 'install.cmd', 'uninstall.cmd')) {
    $from = Join-Path $localRoot $item
    if (Test-Path $from) { Copy-Item $from (Join-Path $staging $item) -Recurse -Force }
  }
}
$entry = Join-Path $staging 'bin\ashcode.mjs'
if (-not (Test-Path $entry)) { throw "invalid package: $entry missing" }
$version = (Get-Content (Join-Path $staging 'package.json') -Raw | ConvertFrom-Json).version
$targetApp = Join-Path $appsRoot "app-$version"

# Keep the previous credential file when replacing an install.
$previousApp = $null
if (Test-Path $manifest) { $previousApp = (Get-Content $manifest -Raw | ConvertFrom-Json).appDir }
if ($null -eq $previousApp -and (Test-Path (Join-Path $InstallDir 'app'))) { $previousApp = Join-Path $InstallDir 'app' }
if ($null -ne $previousApp -and (Test-Path (Join-Path $previousApp '.env.local'))) {
  Copy-Item (Join-Path $previousApp '.env.local') (Join-Path $staging '.env.local') -Force
}

function Remove-WithRetry([string]$dir) {
  $ErrorActionPreference = 'SilentlyContinue'
  for ($attempt = 1; $attempt -le 2; $attempt += 1) {
    try { Remove-Item $dir -Recurse -Force -ErrorAction Stop; return }
    catch {
      & cmd /c "rd /s /q `"$dir`"" 2>$null | Out-Null
      Start-Sleep -Milliseconds 300
    }
  }
}

if (Test-Path $targetApp) { Remove-WithRetry $targetApp }
if (Test-Path $targetApp) { throw "cannot replace $targetApp — close any running ashcode window and re-run" }
Move-Item $staging $targetApp
$appDir = $targetApp
$entry = Join-Path $appDir 'bin\ashcode.mjs'
if (-not (Test-Path $entry)) { throw "invalid package: $entry missing" }
Write-Host "  version: $version"

# A checkout install can carry the local credential file; release zips never do.
if ($null -ne $localRoot) {
  $sourceEnv = Join-Path $localRoot '.env.local'
  $targetEnv = Join-Path $appDir '.env.local'
  if ((Test-Path $sourceEnv) -and -not (Test-Path $targetEnv)) {
    Copy-Item $sourceEnv $targetEnv -Force
    Write-Host '  credentials: copied .env.local from the checkout'
  }
}

# ---------------------------------------------------------------- runtimes
$node = Get-Command node -ErrorAction SilentlyContinue
if ($null -eq $node) {
  throw 'Node.js >=24.9 is required (the DSH runtime ships native addons). Install it (winget install OpenJS.NodeJS) and re-run.'
}
$nodeVersion = (& node --version).TrimStart('v')
$nodeParts = $nodeVersion.Split('.')
$nodeMajor = [int]$nodeParts[0]
$nodeMinor = if ($nodeParts.Count -gt 1) { [int]$nodeParts[1] } else { 0 }
if ($nodeMajor -lt 24 -or ($nodeMajor -eq 24 -and $nodeMinor -lt 9)) {
  throw "Node.js >=24.9 required (found $nodeVersion). Install: winget install OpenJS.NodeJS"
}
Write-Host "  node: $nodeVersion"

function Resolve-BunExe {
  $cmd = Get-Command bun -ErrorAction SilentlyContinue
  if ($null -ne $cmd -and $cmd.Source -like '*.exe') { return $cmd.Source }
  $candidates = @(
    (Join-Path $env:APPDATA 'npm\node_modules\bun\bin\bun.exe'),
    (Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\bun.exe')
  )
  foreach ($candidate in $candidates) { if (Test-Path $candidate) { return $candidate } }
  $where = (& where.exe bun 2>$null | Where-Object { $_ -like '*.exe' } | Select-Object -First 1)
  if ($null -ne $where) { return $where.Trim() }
  return $null
}

$bunExe = Resolve-BunExe
if ($null -eq $bunExe) {
  Write-Host '  bun: missing, installing via npm...' -ForegroundColor Yellow
  & npm install -g bun | Out-Null
  $bunExe = Resolve-BunExe
  if ($null -eq $bunExe) { throw 'bun install failed; install manually: npm install -g bun' }
}
$bunVersion = (& $bunExe --version).Trim()
$bunParts = $bunVersion.Split('.')
$bunMajor = [int]$bunParts[0]
$bunMinor = if ($bunParts.Count -gt 1) { [int]$bunParts[1] } else { 0 }
$bunPatch = 0
if ($bunParts.Count -gt 2) {
  $patchText = ($bunParts[2] -replace '[^0-9].*$', '')
  if ($patchText -ne '') { $bunPatch = [int]$patchText }
}
if ($bunMajor -lt 1 -or ($bunMajor -eq 1 -and ($bunMinor -lt 3 -or ($bunMinor -eq 3 -and $bunPatch -lt 14)))) {
  throw "Bun >=1.3.14 required (found $bunVersion). Upgrade: bun upgrade"
}
Write-Host "  bun: $bunVersion ($bunExe)"

# ---------------------------------------------------------------- deps
$dshModule = Join-Path $appDir 'node_modules\@deepseek-ai\dsh'
if (-not (Test-Path $dshModule)) {
  Write-Host '  dependencies: installing (first run, takes a few minutes)...' -ForegroundColor Yellow
  Push-Location $appDir
  # npm writes warnings (e.g. EBADENGINE) to stderr. With ErrorActionPreference=Stop
  # any caller that merges streams — `2>&1`, CI logs, a wrapper — would turn those
  # into a terminating error and leave a half-installed app directory behind.
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & npm install --no-audit --no-fund | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Write-Host '  retrying with legacy peer resolution...' -ForegroundColor Yellow
      & npm install --legacy-peer-deps --no-audit --no-fund | Out-Null
    }
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
    & npm approve-scripts --all | Out-Null
    & npm rebuild | Out-Null
  } finally {
    $ErrorActionPreference = $previousPreference
    Pop-Location
  }
}
foreach ($required in @('@deepseek-ai\dsh', '@deepseek-ai\cordis-plugin-group')) {
  if (-not (Test-Path (Join-Path $appDir "node_modules\$required"))) {
    throw "dependency check failed: $required is missing (re-run with -Force, or install manually in $appDir)"
  }
}
Write-Host '  dependencies: ok'

# ---------------------------------------------------------------- launcher
New-Item -ItemType Directory -Force -Path $binDir | Out-Null
$content = "@echo off`r`n`"$bunExe`" `"$entry`" %*`r`n"
Set-Content -Path $shim -Value $content -Encoding ascii
Write-Host "  launcher: $shim"

@{
  version = $version
  appDir = $appDir
  bun = $bunExe
  installedAt = (Get-Date).ToString('o')
} | ConvertTo-Json | Set-Content -Path $manifest -Encoding utf8

if (-not $NoPath) {
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if ($null -eq $userPath) { $userPath = '' }
  $segments = @($userPath.Split(';', [StringSplitOptions]::RemoveEmptyEntries))

  # Keep the first occurrence of this launcher's directory and drop later copies.
  # Duplicates are harmless by themselves, but after an install moved the app a
  # stale copy earlier in the list would keep winning over the current one.
  $binKey = $binDir.TrimEnd('\')
  $final = @()
  $seen = $false
  foreach ($segment in $segments) {
    if ($segment.TrimEnd('\') -eq $binKey) {
      if ($seen) { continue }
      $seen = $true
    }
    $final += $segment
  }
  if ($seen) {
    Write-Host "  PATH: already contains $binDir"
  } else {
    $final += $binDir
    Write-Host "  PATH: added $binDir (open a new terminal)" -ForegroundColor Green
  }
  $newPath = $final -join ';'
  if ($newPath -ne $userPath) { [Environment]::SetEnvironmentVariable('Path', $newPath, 'User') }
}

if ($null -ne $tempZip -and -not (Test-Path $Source)) { Remove-Item $tempZip -Force -ErrorAction SilentlyContinue }

Write-Host ''
Write-Host "Installed $version. In a new terminal:" -ForegroundColor Green
Write-Host '  ashcode --help'
Write-Host '  ashcode'
Write-Host ''
Write-Host "Put DEEPSEEK_API_KEY in $appDir\.env.local (or set it in the environment)."

Copy-Item $shim (Join-Path $binDir 'ashcode.cmd') -Force -ErrorAction SilentlyContinue

# ---------------------------------------------------------------- cleanup
# Only after the launcher points at the new version, and never for a directory
# a running process still uses.
$ErrorActionPreference = 'SilentlyContinue'
foreach ($old in Get-ChildItem $appsRoot -Directory) {
  if ($old.FullName -eq $appDir) { continue }
  $inUse = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($old.FullName) }
  if ($null -eq $inUse) { Remove-WithRetry $old.FullName }
}
if (Test-Path (Join-Path $InstallDir 'app')) { Remove-WithRetry (Join-Path $InstallDir 'app') }
# `return` rather than `exit`: this script is also run through `irm | iex`, where
# `exit` would close the caller's PowerShell session.
return
