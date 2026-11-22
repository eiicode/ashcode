<#
.SYNOPSIS
  Remove a ashcode installation created by install.ps1.
#>
[CmdletBinding()]
param(
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'ashcode'),
  [switch]$NoPath
)

$ErrorActionPreference = 'Stop'
$InstallDir = [System.IO.Path]::GetFullPath($InstallDir)
$binDir = Join-Path $InstallDir 'bin'
$shim = Join-Path $binDir 'ashcode.cmd'
$manifest = Join-Path $InstallDir 'install.json'

if (Test-Path $manifest) {
  $info = Get-Content $manifest -Raw | ConvertFrom-Json
  $appDir = $info.appDir
  if ((Test-Path $appDir) -and ($appDir -like "$InstallDir*")) {
    Remove-Item $appDir -Recurse -Force
    Write-Host "removed $appDir"
  }
}

if (Test-Path $shim) { Remove-Item $shim -Force; Write-Host "removed $shim" }

if (-not $NoPath) {
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if ($null -ne $userPath) {
    $segments = $userPath.Split(';', [StringSplitOptions]::RemoveEmptyEntries) | Where-Object { $_ -ne $binDir }
    [Environment]::SetEnvironmentVariable('Path', ($segments -join ';'), 'User')
    Write-Host "PATH: removed $binDir"
  }
}

Remove-Item $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
Write-Host 'Uninstalled.'
