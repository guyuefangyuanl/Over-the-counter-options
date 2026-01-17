$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

$LogDir = if ($env:LOG_DIR) { $env:LOG_DIR } else { Join-Path $ProjectRoot 'logs' }
$PidDir = if ($env:PID_DIR) { $env:PID_DIR } else { Join-Path $LogDir 'pids' }
$StartupLog = if ($env:STARTUP_LOG) { $env:STARTUP_LOG } else { Join-Path $LogDir 'startup.log' }

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
New-Item -ItemType Directory -Path $PidDir -Force | Out-Null

function NowString { (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') }
function Write-Log([string]$Message) {
  $line = "$(NowString) $Message"
  Add-Content -Path $StartupLog -Value $line -Encoding UTF8
}

function Notify-BestEffort([string]$Message) {
  try {
    if ($env:STARTUP_NOTIFY -eq '0') { return }
    try { msg * $Message | Out-Null } catch { }
  } catch { }
}

function Invoke-Retry {
  param(
    [Parameter(Mandatory = $true)][scriptblock]$ScriptBlock,
    [int]$MaxRetries = 3,
    [int]$DelaySeconds = 3,
    [string]$Name = 'operation'
  )

  for ($i = 1; $i -le $MaxRetries; $i++) {
    try {
      & $ScriptBlock
      return
    } catch {
      if ($i -ge $MaxRetries) { throw }
      Write-Log "Retry($i/$MaxRetries) failed: $Name; retry in ${DelaySeconds}s"
      Start-Sleep -Seconds $DelaySeconds
    }
  }
}

function Test-HttpOk([string]$Url) {
  try {
    $req = [System.Net.WebRequest]::Create($Url)
    $req.Timeout = 2000
    $resp = $req.GetResponse()
    $resp.Close()
    return $true
  } catch {
    return $false
  }
}

function Test-NetworkOk {
  try {
    if (Get-Command Test-Connection -ErrorAction SilentlyContinue) {
      return (Test-Connection -ComputerName 'gitee.com' -Count 1 -Quiet -ErrorAction SilentlyContinue)
    }
  } catch { }
  return $true
}

function Start-NodeIfNeeded {
  $startNode = if ($env:START_NODE) { $env:START_NODE } else { '1' }
  if ($startNode -ne '1') {
    Write-Log 'START_NODE != 1, skip Node'
    return
  }

  $nodePort = if ($env:NODE_PORT) { [int]$env:NODE_PORT } elseif ($env:NODE_API_PORT) { [int]$env:NODE_API_PORT } else { 5002 }
  $healthUrl = "http://127.0.0.1:$nodePort/api/v1/health"
  if (Test-HttpOk $healthUrl) {
    Write-Log "Node already running: $healthUrl"
    return
  }

  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'node not found; cannot start Node backend'
  }

  $nodeLog = Join-Path $LogDir 'node.log'
  $nodeErr = Join-Path $LogDir 'node.err.log'

  Write-Log "Starting Node backend: PORT=$nodePort node app.js"
  $oldPort = $env:PORT
  try {
    $env:PORT = "$nodePort"
    $p = Start-Process -FilePath 'node' -ArgumentList "`"$ProjectRoot\app.js`"" -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $nodeLog -RedirectStandardError $nodeErr
    Set-Content -Path (Join-Path $PidDir 'node.pid') -Value $p.Id -Encoding ASCII
  } finally {
    $env:PORT = $oldPort
  }

  Invoke-Retry -Name 'Node healthcheck' -MaxRetries (if ($env:MAX_RETRIES) { [int]$env:MAX_RETRIES } else { 3 }) -DelaySeconds (if ($env:RETRY_DELAY_SECONDS) { [int]$env:RETRY_DELAY_SECONDS } else { 3 }) -ScriptBlock {
    if (-not (Test-HttpOk $healthUrl)) { throw "Node not ready" }
  }
}

function Start-FlaskIfNeeded {
  $startFlask = if ($env:START_FLASK) { $env:START_FLASK } else { '1' }
  if ($startFlask -ne '1') {
    Write-Log 'START_FLASK != 1, skip Flask'
    return
  }

  $flaskPort = if ($env:FLASK_PORT) { [int]$env:FLASK_PORT } elseif ($env:PORT) { [int]$env:PORT } else { 5000 }
  $healthUrl = "http://127.0.0.1:$flaskPort/api/v1/health"
  if (Test-HttpOk $healthUrl) {
    Write-Log "Flask already running: $healthUrl"
    return
  }

  $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
  if (-not $pythonCmd) { $pythonCmd = Get-Command python3 -ErrorAction SilentlyContinue }
  if (-not $pythonCmd) {
    throw 'python/python3 not found; cannot start Flask backend'
  }

  $flaskLog = Join-Path $LogDir 'flask.log'
  $flaskErr = Join-Path $LogDir 'flask.err.log'

  Write-Log "Starting Flask backend: PORT=$flaskPort python app.py"
  $oldPort = $env:PORT
  try {
    $env:PORT = "$flaskPort"
    $p = Start-Process -FilePath $pythonCmd.Source -ArgumentList "`"$ProjectRoot\app.py`"" -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $flaskLog -RedirectStandardError $flaskErr
    Set-Content -Path (Join-Path $PidDir 'flask.pid') -Value $p.Id -Encoding ASCII
  } finally {
    $env:PORT = $oldPort
  }

  Invoke-Retry -Name 'Flask healthcheck' -MaxRetries (if ($env:MAX_RETRIES) { [int]$env:MAX_RETRIES } else { 3 }) -DelaySeconds (if ($env:RETRY_DELAY_SECONDS) { [int]$env:RETRY_DELAY_SECONDS } else { 3 }) -ScriptBlock {
    if (-not (Test-HttpOk $healthUrl)) { throw "Flask not ready" }
  }
}

function Git-AutoPush {
  $gitAutoPush = if ($env:GIT_AUTO_PUSH) { $env:GIT_AUTO_PUSH } else { '1' }
  if ($gitAutoPush -ne '1') {
    Write-Log 'GIT_AUTO_PUSH != 1, skip auto push'
    return
  }

  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Log 'git not found; skip auto push'
    return
  }

  $isRepo = $false
  try { git rev-parse --is-inside-work-tree | Out-Null; $isRepo = $true } catch { }
  if (-not $isRepo) {
    Write-Log 'Not a Git repository; skip auto push'
    return
  }

  $remote = if ($env:GIT_REMOTE) { $env:GIT_REMOTE } else { 'origin' }
  try { git remote get-url $remote | Out-Null } catch { Write-Log "Remote not found: $remote; skip auto push"; return }

  $status = (git status --porcelain)
  if (-not $status) {
    Write-Log 'No changes; skip commit/push'
    return
  }

  Invoke-Retry -Name 'network check' -MaxRetries (if ($env:MAX_RETRIES) { [int]$env:MAX_RETRIES } else { 3 }) -DelaySeconds (if ($env:RETRY_DELAY_SECONDS) { [int]$env:RETRY_DELAY_SECONDS } else { 3 }) -ScriptBlock {
    if (-not (Test-NetworkOk)) { throw 'network not ready' }
  }

  $commitPrefix = if ($env:GIT_COMMIT_PREFIX) { $env:GIT_COMMIT_PREFIX } else { 'Auto commit: ' }
  $msg = "$commitPrefix$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))"

  Write-Log 'Running git add/commit/push'
  git add -A | Out-Null
  try {
    git commit -m $msg | Out-Null
  } catch {
    Write-Log 'git commit failed (maybe nothing to commit); skip push'
    return
  }

  $pushRef = if ($env:GIT_PUSH_REF) { $env:GIT_PUSH_REF } else { 'HEAD' }

  Invoke-Retry -Name 'git push' -MaxRetries (if ($env:MAX_RETRIES) { [int]$env:MAX_RETRIES } else { 3 }) -DelaySeconds (if ($env:RETRY_DELAY_SECONDS) { [int]$env:RETRY_DELAY_SECONDS } else { 3 }) -ScriptBlock {
    git push $remote $pushRef | Out-Null
  }
}

Write-Log '========== startup.ps1 start =========='
Write-Log "Working dir: $ProjectRoot"

$allOk = $true

try {
  Start-NodeIfNeeded
  Write-Log 'Node start/check done'
} catch {
  $allOk = $false
  Write-Log "Node start failed: $($_.Exception.Message)"
  Notify-BestEffort 'Node start failed. Check logs/node.log'
}

try {
  Start-FlaskIfNeeded
  Write-Log 'Flask start/check done'
} catch {
  $allOk = $false
  Write-Log "Flask start failed: $($_.Exception.Message)"
  Notify-BestEffort 'Flask start failed. Check logs/flask.log'
}

try {
  Git-AutoPush
  Write-Log 'Git auto push done/skipped'
} catch {
  $allOk = $false
  Write-Log "Git auto push failed: $($_.Exception.Message)"
  Notify-BestEffort 'Git auto push failed. Check logs/startup.log'
}

Write-Log '========== startup.ps1 end =========='
if (-not $allOk) { exit 1 }
