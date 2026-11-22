<#
.SYNOPSIS
  Build a distributable zip of ashcode (no node_modules, no secrets).

.PARAMETER OutDir
  Output directory for the archive. Default: <repo>\dist.
#>
[CmdletBinding()]
param(
  [string]$OutDir
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($OutDir)) { $OutDir = Join-Path $root 'dist' }
$pkg = Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$version = $pkg.version
$name = "ashcode-$version-win-x64"
$stage = Join-Path ([System.IO.Path]::GetTempPath()) $name

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null

$include = @('src', 'bin', 'scripts', 'docs', 'package.json', 'README.md', 'README.zh.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'LICENSE', 'THIRD-PARTY-NOTICES.md', 'tsconfig.json', '.gitignore', 'install.cmd', 'uninstall.cmd')
foreach ($item in $include) {
  $source = Join-Path $root $item
  if (-not (Test-Path $source)) { continue }
  Copy-Item $source (Join-Path $stage $item) -Recurse -Force
}

# Never ship local state or secrets.
$junk = @(
  '.env.local', 'node_modules', '.dsh-home', 'dist', '.install-test', '.git',
  'docs\OPEN-SOURCE-ASSESSMENT.md', 'docs\EXTENSIONS-ASSESSMENT.md', 'docs\MIMOCODE-COMPARISON.md'
)
foreach ($item in $junk) {
  $target = Join-Path $stage $item
  if (Test-Path $target) { Remove-Item $target -Recurse -Force }
}
Get-ChildItem $stage -Recurse -Include '*.log', '.tui-debug.log' -ErrorAction SilentlyContinue | Remove-Item -Force

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$zip = Join-Path $OutDir "$name.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip
Remove-Item $stage -Recurse -Force

Write-Host "packed: $zip"
Write-Host "install with:"
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts/install.ps1 -Source `"$zip`""
