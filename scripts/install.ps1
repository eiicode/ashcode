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

if (Test-Path $targetApp) {
  # Deleting a previous install means removing a full node_modules tree, which
  # can take a while and would otherwise be a silent pause.
  Write-Host '  replacing the previous install (removing old files, this can take a minute)...'
  Remove-WithRetry $targetApp
}
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
  # Get-Command -All lists every match: an npm `.cmd` shim can shadow the real
  # bun.exe, and only an `.exe` can be embedded in the launcher's command line.
  # No `where.exe` here: under $ErrorActionPreference='Stop', Windows PowerShell
  # 5.1 turns a native command's "not found" stderr into a terminating error, so
  # a missing Bun would abort the install before it could be installed.
  foreach ($cmd in @(Get-Command bun -All -ErrorAction SilentlyContinue)) {
    if ($cmd.Source -like '*.exe' -and (Test-Path $cmd.Source)) { return $cmd.Source }
  }
  $candidates = @(
    (Join-Path $env:APPDATA 'npm\node_modules\bun\bin\bun.exe'),
    (Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\bun.exe')
  )
  # A portable Node (or npm >= 11, whose global prefix defaults to the install
  # directory) puts npm globals beside node.exe instead of in %APPDATA%\npm.
  $nodeExe = Get-Command node -ErrorAction SilentlyContinue
  if ($null -ne $nodeExe -and $nodeExe.Source -like '*.exe') {
    $candidates += (Join-Path (Split-Path -Parent $nodeExe.Source) 'node_modules\bun\bin\bun.exe')
  }
  foreach ($candidate in $candidates) { if (Test-Path $candidate) { return $candidate } }
  return $null
}

$bunExe = Resolve-BunExe
if ($null -eq $bunExe) {
  Write-Host '  bun: missing, installing via npm...' -ForegroundColor Yellow
  # npm reports progress on stderr; the same Stop preference would turn that
  # into a terminating error, so relax it for the duration of the call.
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    # npm >= 11.19 blocks lifecycle scripts by default and Bun's binary comes
    # from its postinstall; older npm rejects the flag, so fall back to a plain
    # install that runs the script anyway.
    & npm install -g bun --allow-scripts=bun | Out-Null
    $bunInstallExit = $LASTEXITCODE
    if ($bunInstallExit -ne 0) {
      & npm install -g bun | Out-Null
      $bunInstallExit = $LASTEXITCODE
    }
  } finally {
    $ErrorActionPreference = $previousPreference
  }
  if ($bunInstallExit -ne 0) { throw "bun install failed (npm exit $bunInstallExit); install manually: npm install -g bun" }
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
# npm stays silent for minutes while it resolves the tree and downloads, so a
# double-clicked install looks hung. Run it as a child process and show elapsed
# time, then surface npm's own output when it fails.
#
# Running it out-of-process also keeps npm's stderr out of this script's error
# stream: with $ErrorActionPreference='Stop' a native command's warning would
# otherwise terminate the install and leave a half-written app directory.
function Invoke-Npm {
  param([string[]]$NpmArguments, [string]$Activity)
  $npmCommand = Get-Command npm -All -ErrorAction SilentlyContinue |
    Where-Object { $_.Source -like '*.cmd' } | Select-Object -First 1
  if ($null -eq $npmCommand) { $npmCommand = Get-Command npm -ErrorAction SilentlyContinue | Select-Object -First 1 }
  if ($null -eq $npmCommand) { throw 'npm not found on PATH' }

  $stamp = [guid]::NewGuid().ToString('N')
  $outLog = Join-Path ([System.IO.Path]::GetTempPath()) "ashcode-npm-$stamp.out.log"
  $errLog = Join-Path ([System.IO.Path]::GetTempPath()) "ashcode-npm-$stamp.err.log"
  $runner = Join-Path ([System.IO.Path]::GetTempPath()) "ashcode-npm-$stamp.cmd"
  $animate = -not [Console]::IsOutputRedirected

  # Let cmd.exe do the redirection: a captured pipe would deadlock once npm
  # fills the buffer, and this keeps npm's output inspectable when it fails.
  Set-Content -Path $runner -Encoding ascii -Value @(
    '@echo off',
    "cd /d `"$appDir`"",
    ('"{0}" {1} > "{2}" 2> "{3}"' -f $npmCommand.Source, ($NpmArguments -join ' '), $outLog, $errLog)
  )
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $env:ComSpec
  $psi.Arguments = "/c `"$runner`""
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.WorkingDirectory = $appDir
  $process = [System.Diagnostics.Process]::Start($psi)

  $startedAt = Get-Date
  $frames = '|', '/', '-', '\'
  $frame = 0
  while (-not $process.HasExited) {
    if ($animate) {
      $elapsed = [int]((Get-Date) - $startedAt).TotalSeconds
      Write-Host ("`r  {0} {1}... {2}s (Ctrl+C to abort) " -f $frames[$frame % 4], $Activity, $elapsed) -NoNewline
      $frame += 1
    }
    Start-Sleep -Milliseconds 500
  }
  $seconds = [int]((Get-Date) - $startedAt).TotalSeconds
  $exitCode = $process.ExitCode
  # Erase the spinner line so the result replaces it instead of stacking under it.
  if ($animate) { Write-Host ("`r" + (' ' * 76) + "`r") -NoNewline }
  if ($exitCode -eq 0) {
    Write-Host ("  {0}: ok ({1}s)" -f $Activity, $seconds) -ForegroundColor DarkGray
  } else {
    Write-Host ("  {0}: failed ({1}s)" -f $Activity, $seconds) -ForegroundColor Red
    Write-Host '  npm said:' -ForegroundColor Yellow
    foreach ($line in @(Get-Content $errLog -Tail 12 -ErrorAction SilentlyContinue)) { Write-Host "    $line" }
    foreach ($line in @(Get-Content $outLog -Tail 6 -ErrorAction SilentlyContinue)) { Write-Host "    $line" }
  }
  Remove-Item $outLog, $errLog, $runner -Force -ErrorAction SilentlyContinue
  return $exitCode
}

$dshModule = Join-Path $appDir 'node_modules\@deepseek-ai\dsh'
if (-not (Test-Path $dshModule)) {
  Write-Host '  dependencies: installing (first run, takes a few minutes)...' -ForegroundColor Yellow
  $code = Invoke-Npm @('install', '--no-audit', '--no-fund') 'npm install'
  if ($code -ne 0) {
    Write-Host '  retrying with legacy peer resolution...' -ForegroundColor Yellow
    $code = Invoke-Npm @('install', '--legacy-peer-deps', '--no-audit', '--no-fund') 'npm install (legacy peer deps)'
  }
  if ($code -ne 0) { throw 'npm install failed (see the npm output above)' }
  # npm >= 11.19 blocks lifecycle scripts by default; approving them and
  # rebuilding is what leaves the native addons (node-pty, koffi) usable.
  $null = Invoke-Npm @('approve-scripts', '--all') 'npm approve-scripts'
  $code = Invoke-Npm @('rebuild') 'npm rebuild (native addons)'
  if ($code -ne 0) { Write-Host '  warning: npm rebuild reported an error; prebuilt addons may still load' -ForegroundColor Yellow }
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
