# DeckOS Link - the one-click app for Windows.
#
# Double-click "Start DeckOS Link" (or the DeckOS Link shortcut) and this:
#   - checks for Node.js and offers to install it if it's missing,
#   - runs the Link server in the background (no console window),
#   - puts a DeckOS icon in the tray next to the clock,
#   - opens the dashboard, where the iPad connects by QR code.
# If Link is already running (say from link\start.cmd) the tray just uses it
# and never stops it. Only a server this app started is stopped on Quit.

param([switch]$Quiet) # -Quiet: started with Windows, don't open the dashboard

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Data = Join-Path $Root 'link\data'
$Server = Join-Path $Root 'link\server.js'
$Log = Join-Path $Data 'link.log'
$IconFile = Join-Path $PSScriptRoot 'deckos.ico'
$Port = if ($env:PORT) { [int]$env:PORT } else { 7777 }
$Base = "http://127.0.0.1:$Port"
$Dashboard = "$Base/dashboard/"
$Title = 'DeckOS Link'

# One tray per user. A second click just opens the dashboard.
$first = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\DeckOSLinkTray', [ref]$first)
if (-not $first) { Start-Process $Dashboard; return }

function Show-Message($text, $icon = 'Information', $buttons = 'OK') {
  [System.Windows.Forms.MessageBox]::Show($text, $Title, $buttons, $icon)
}

# ------------------------------------------------------------ Node.js

function Find-Node {
  $candidates = @()
  $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($cmd) { $candidates += $cmd.Source }
  $candidates += @(
    (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe')
  )
  foreach ($c in $candidates) {
    if ($c -and (Test-Path $c)) {
      try {
        $v = (& $c -v) -replace '^v', ''
        if ([int]($v.Split('.')[0]) -ge 18) { return $c }
      } catch {}
    }
  }
  return $null
}

function Install-Node {
  $answer = Show-Message ("DeckOS Link needs Node.js, a free program from nodejs.org.`n`n" +
    "Install it now? It takes about a minute. Windows may ask for permission.") 'Question' 'YesNo'
  if ($answer -ne 'Yes') { return $null }
  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if ($winget) {
    try {
      $p = Start-Process $winget.Source -ArgumentList 'install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements' -Wait -PassThru
      $node = Find-Node
      if ($node) { return $node }
    } catch {}
  }
  Start-Process 'https://nodejs.org/en/download'
  Show-Message "Download the LTS version from the page that just opened, install it, then click DeckOS Link again."
  return $null
}

# -------------------------------------------------------------- server

$script:proc = $null      # the server this app started (if any)
$script:restarts = 0

function Test-Link {
  try {
    $r = Invoke-RestMethod -Uri "$Base/api/link/info" -TimeoutSec 2 -UseBasicParsing
    return [bool]$r.link
  } catch { return $false }
}

function Get-LogTail {
  if (Test-Path $Log) { return ((Get-Content $Log -Tail 6) -join "`n") }
  return ''
}

function Start-Server {
  if (Test-Link) { return $true } # already running elsewhere: use it as is
  New-Item -ItemType Directory -Force -Path $Data | Out-Null
  if ((Test-Path $Log) -and (Get-Item $Log).Length -gt 1MB) {
    Move-Item $Log (Join-Path $Data 'link.old.log') -Force
  }
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $env:ComSpec
  $psi.Arguments = "/d /s /c `"`"$script:node`" `"$Server`" >> `"$Log`" 2>&1`""
  $psi.WorkingDirectory = $Root
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  if ($env:PORT) { $psi.EnvironmentVariables['PORT'] = "$Port" }
  $script:proc = [System.Diagnostics.Process]::Start($psi)
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-Link) { return $true }
    if ($script:proc.HasExited) { break }
  }
  return $false
}

function Stop-Server {
  if ($script:proc -and -not $script:proc.HasExited) {
    # /T also ends the screen helper that the server started.
    Start-Process taskkill.exe -ArgumentList "/PID $($script:proc.Id) /T /F" -WindowStyle Hidden -Wait
  }
  $script:proc = $null
}

# ----------------------------------------------------------- shortcuts

function New-Shortcut($path, $arguments = '') {
  $shell = New-Object -ComObject WScript.Shell
  $s = $shell.CreateShortcut($path)
  $s.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $s.Arguments = "-NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSCommandPath`" $arguments".Trim()
  $s.WorkingDirectory = $Root
  $s.IconLocation = "$IconFile,0"
  $s.Description = 'Run DeckOS Link and connect your iPad'
  $s.Save()
}

$StartupLink = Join-Path ([Environment]::GetFolderPath('Startup')) 'DeckOS Link.lnk'

function Install-Once {
  $marker = Join-Path $Data 'app-installed'
  if (Test-Path $marker) { return $false }
  New-Item -ItemType Directory -Force -Path $Data | Out-Null
  # Files from a downloaded ZIP are marked "from the internet"; clear that so
  # Windows doesn't block the screen helper.
  Get-ChildItem $Root -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notlike '*\.git\*' } |
    Unblock-File -ErrorAction SilentlyContinue
  try {
    New-Shortcut (Join-Path ([Environment]::GetFolderPath('Desktop')) 'DeckOS Link.lnk')
    New-Shortcut (Join-Path ([Environment]::GetFolderPath('Programs')) 'DeckOS Link.lnk')
  } catch {}
  Set-Content -Path $marker -Value (Get-Date -Format o)
  return $true
}

# ---------------------------------------------------------------- start

$script:node = Find-Node
if (-not $script:node -and -not (Test-Link)) { $script:node = Install-Node }
if (-not $script:node -and -not (Test-Link)) { $mutex.ReleaseMutex(); return }

$firstRun = Install-Once

if (-not (Start-Server)) {
  Show-Message ("DeckOS Link could not start.`n`n" + (Get-LogTail) +
    "`n`nIf the port is busy, another program is using $Port.") 'Error'
  Stop-Server
  $mutex.ReleaseMutex()
  return
}

# ----------------------------------------------------------------- tray

$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = New-Object System.Drawing.Icon($IconFile)
$tray.Text = 'DeckOS Link - running'
$menu = New-Object System.Windows.Forms.ContextMenuStrip

$open = $menu.Items.Add('Open dashboard (connect iPad)')
$open.Font = New-Object System.Drawing.Font($open.Font, [System.Drawing.FontStyle]::Bold)
$open.Add_Click({ Start-Process $Dashboard })
$menu.Items.Add('-') | Out-Null

$auto = $menu.Items.Add('Start with Windows')
$auto.Checked = Test-Path $StartupLink
$auto.Add_Click({
  if (Test-Path $StartupLink) { Remove-Item $StartupLink -Force } else { New-Shortcut $StartupLink '-Quiet' }
  $auto.Checked = Test-Path $StartupLink
})

$logItem = $menu.Items.Add('Show log')
$logItem.Add_Click({ if (Test-Path $Log) { Start-Process notepad.exe -ArgumentList "`"$Log`"" } })
$menu.Items.Add('-') | Out-Null

$quit = $menu.Items.Add('Quit DeckOS Link')
$quit.Add_Click({
  $timer.Stop()
  Stop-Server
  $tray.Visible = $false
  $tray.Dispose()
  [System.Windows.Forms.Application]::Exit()
})

$tray.ContextMenuStrip = $menu
$tray.Add_MouseClick({ param($s, $e) if ($e.Button -eq 'Left') { Start-Process $Dashboard } })
$tray.Visible = $true

# Keep the server alive: restart ours if it crashes, or take over if the
# window it was running in got closed.
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 5000
$timer.Add_Tick({
  if (Test-Link) { $script:restarts = 0; return }
  if ($script:restarts -ge 3) { $tray.Text = 'DeckOS Link - stopped (see log)'; return }
  $script:restarts++
  if (-not $script:node) { $script:node = Find-Node }
  if ($script:node -and (Start-Server)) {
    $tray.ShowBalloonTip(3000, $Title, 'DeckOS Link restarted.', 'Info')
  }
})
$timer.Start()

if ($firstRun) {
  $tray.ShowBalloonTip(8000, $Title,
    "Running in the tray. If Windows asks about the firewall, allow Private networks so your iPad can connect.", 'Info')
} else {
  $tray.ShowBalloonTip(3000, $Title, 'Running. Click this icon to open the dashboard.', 'Info')
}
if (-not $Quiet) { Start-Process $Dashboard }

[System.Windows.Forms.Application]::Run()
$mutex.ReleaseMutex()
