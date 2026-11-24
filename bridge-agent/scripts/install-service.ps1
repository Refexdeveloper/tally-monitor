#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Installs the Tally Monitor Bridge Agent as a Windows service using NSSM.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\install-service.ps1
  powershell -ExecutionPolicy Bypass -File .\scripts\install-service.ps1 -NssmPath C:\tools\nssm.exe -ServiceAccount ".\tallybridge" -ServicePassword "..."
#>
param(
  [string]$NssmPath = "",
  [string]$ServiceName = "TallyMonitorBridge",
  # Leave empty to run as LocalSystem. A dedicated low-privilege local account is recommended.
  [string]$ServiceAccount = "",
  [string]$ServicePassword = "",
  [switch]$SkipDiagnose
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) { throw "Node.js not found. Install Node.js 20 LTS or newer (x64) from https://nodejs.org and re-open PowerShell." }
$major = [int]((& $node -p "process.versions.node").Split('.')[0])
if ($major -lt 20) { throw "Node.js 20 or newer is required." }

if (-not (Test-Path "$root\.env")) { throw "$root\.env not found. Copy .env.example to .env and fill it in first." }

if (-not (Test-Path "$root\node_modules\fast-xml-parser")) {
  Write-Host "Installing dependencies..."
  Push-Location $root
  try { npm install --omit=dev --no-audit --no-fund } finally { Pop-Location }
}

if (-not $NssmPath) {
  $cmd = Get-Command nssm.exe -ErrorAction SilentlyContinue
  if ($cmd) { $NssmPath = $cmd.Source }
  elseif (Test-Path "$root\tools\nssm.exe") { $NssmPath = "$root\tools\nssm.exe" }
  else { throw "nssm.exe not found. Download NSSM (https://nssm.cc/download), copy win64\nssm.exe to $root\tools\nssm.exe or pass -NssmPath." }
}

if (-not $SkipDiagnose) {
  Write-Host "`nRunning diagnostics..." -ForegroundColor Cyan
  & $node "$root\src\cli.js" diagnose
  if ($LASTEXITCODE -ne 0) {
    $answer = Read-Host "Diagnostics reported problems. Install the service anyway? (y/N)"
    if ($answer -ne 'y') { exit 1 }
  }
}

New-Item -ItemType Directory -Force "$root\logs", "$root\state" | Out-Null

if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
  Write-Host "Replacing existing service $ServiceName"
  & $NssmPath stop $ServiceName | Out-Null
  & $NssmPath remove $ServiceName confirm | Out-Null
}

& $NssmPath install $ServiceName $node "`"$root\src\index.js`"" | Out-Null
& $NssmPath set $ServiceName AppDirectory $root | Out-Null
& $NssmPath set $ServiceName DisplayName "Tally Monitor Bridge Agent" | Out-Null
& $NssmPath set $ServiceName Description "Outbound-only link between Tally Monitor and TallyPrime. Posts only Finance-approved vouchers." | Out-Null
& $NssmPath set $ServiceName Start SERVICE_DELAYED_AUTO_START | Out-Null
& $NssmPath set $ServiceName AppStdout "$root\logs\service-stdout.log" | Out-Null
& $NssmPath set $ServiceName AppStderr "$root\logs\service-stderr.log" | Out-Null
& $NssmPath set $ServiceName AppRotateFiles 1 | Out-Null
& $NssmPath set $ServiceName AppRotateOnline 1 | Out-Null
& $NssmPath set $ServiceName AppRotateBytes 10485760 | Out-Null
& $NssmPath set $ServiceName AppExit Default Restart | Out-Null
& $NssmPath set $ServiceName AppRestartDelay 15000 | Out-Null
# Ctrl+C first so an in-flight Tally import can finish and its result is saved (Tally timeout is 60 s).
& $NssmPath set $ServiceName AppStopMethodConsole 75000 | Out-Null
if ($ServiceAccount) { & $NssmPath set $ServiceName ObjectName $ServiceAccount $ServicePassword | Out-Null }

# Lock down the credentials file: SYSTEM + Administrators (+ service account) only.
& icacls "$root\.env" /inheritance:r /grant:r "*S-1-5-18:(R)" "*S-1-5-32-544:(F)" | Out-Null
if ($ServiceAccount) {
  & icacls "$root\.env" /grant "${ServiceAccount}:(R)" | Out-Null
  & icacls "$root\logs" /grant "${ServiceAccount}:(OI)(CI)M" | Out-Null
  & icacls "$root\state" /grant "${ServiceAccount}:(OI)(CI)M" | Out-Null
}

& $NssmPath start $ServiceName | Out-Null
Start-Sleep -Seconds 3
Get-Service -Name $ServiceName | Format-Table -AutoSize Status, Name, DisplayName
Write-Host "Logs: $root\logs   (agent-YYYY-MM-DD.log)" -ForegroundColor Green
