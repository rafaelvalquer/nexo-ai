$ErrorActionPreference = "Stop"
$manifest = Get-Content -Raw "apps/desktop/package.json" | ConvertFrom-Json
$version = [string]$manifest.version
$installer = (Resolve-Path "release/NexoAI-Setup-$version.exe").Path
$smokeRoot = if ($env:RUNNER_TEMP) { [System.IO.Path]::GetFullPath($env:RUNNER_TEMP) } else { [System.IO.Path]::GetTempPath() }
$runId = [Guid]::NewGuid().ToString("N")
$installDir = Join-Path $smokeRoot "NexoAI-Smoke-$version-$runId"
$dataDir = Join-Path $smokeRoot "NexoAI-Smoke-Data-$runId"
$appDataDir = Join-Path $smokeRoot "NexoAI-Smoke-AppData-$runId"
$readyFile = Join-Path $smokeRoot "NexoAI-Smoke-Ready-$runId.json"
$process = $null

try {
  $install = Start-Process -FilePath $installer -ArgumentList @("/S", "/D=$installDir") -Wait -PassThru -WindowStyle Hidden
  if ($install.ExitCode -ne 0) { throw "Instalador terminou com código $($install.ExitCode)." }
  $executable = Join-Path $installDir "NexoAI.exe"
  if (-not (Test-Path -LiteralPath $executable)) { throw "Executável instalado não encontrado em $installDir." }

  New-Item -ItemType Directory -Force -Path $dataDir, $appDataDir | Out-Null
  $start = [System.Diagnostics.ProcessStartInfo]::new()
  $start.FileName = $executable
  $start.WorkingDirectory = $installDir
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.Environment["NEXO_DATA_DIR"] = $dataDir
  $start.Environment["NEXO_CORE_PORT"] = "0"
  $start.Environment["NEXO_SMOKE_READY_FILE"] = $readyFile
  $start.Environment["APPDATA"] = $appDataDir
  $process = [System.Diagnostics.Process]::Start($start)

  $deadline = [DateTime]::UtcNow.AddSeconds(45)
  while ([DateTime]::UtcNow -lt $deadline) {
    $process.Refresh()
    if ($process.HasExited) { break }
    if (Test-Path -LiteralPath $readyFile) { break }
    Start-Sleep -Milliseconds 250
  }

  if (-not (Test-Path -LiteralPath $readyFile)) {
    $startupLog = Join-Path $dataDir "logs/startup-errors.log"
    $diagnostic = if (Test-Path -LiteralPath $startupLog) { Get-Content -Raw -LiteralPath $startupLog } else { "Nenhum startup-errors.log foi criado." }
    $exit = if ($process.HasExited) { $process.ExitCode } else { "ainda em execução" }
    throw "O Nexo não sinalizou a janela pronta (processo: $exit). Diagnóstico: $diagnostic"
  }

  $ready = Get-Content -Raw -LiteralPath $readyFile | ConvertFrom-Json
  if (-not $ready.windowLoaded) { throw "A janela do Nexo não terminou de carregar." }
  if ([System.IO.Path]::GetFullPath($ready.dataDir) -ne [System.IO.Path]::GetFullPath($dataDir)) { throw "O app não usou o diretório de dados isolado do smoke." }
  if (-not (Test-Path -LiteralPath $ready.database) -or (Get-Item -LiteralPath $ready.database).Length -eq 0) { throw "SQLite não foi inicializado no diretório isolado." }

  Write-Host "Smoke do instalador Nexo AI $version concluído: janela carregada e SQLite inicializado."
}
finally {
  if ($process) {
    $process.Refresh()
    if (-not $process.HasExited) { $process.Kill($true); $process.WaitForExit(5000) | Out-Null }
    $process.Dispose()
  }
}
