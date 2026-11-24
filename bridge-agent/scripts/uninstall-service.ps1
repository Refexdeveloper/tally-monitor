#Requires -RunAsAdministrator
param(
  [string]$NssmPath = "",
  [string]$ServiceName = "TallyMonitorBridge"
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $NssmPath) {
  $cmd = Get-Command nssm.exe -ErrorAction SilentlyContinue
  $NssmPath = if ($cmd) { $cmd.Source } else { "$root\tools\nssm.exe" }
}
if (-not (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)) { Write-Host "Service $ServiceName is not installed."; exit 0 }
& $NssmPath stop $ServiceName
& $NssmPath remove $ServiceName confirm
$pending = "$root\state\outbox.json"
if ((Test-Path $pending) -and ((Get-Content $pending -Raw) -notmatch '^\s*\[\s*\]\s*$')) {
  Write-Warning "state\outbox.json still holds undelivered results. Start the agent once more (run.cmd) so they reach Tally Monitor."
}
Write-Host "Removed $ServiceName. Configuration, logs and state were left in $root."
