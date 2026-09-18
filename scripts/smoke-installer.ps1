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
$stageFile = Join-Path $smokeRoot "NexoAI-Smoke-Stages-$runId.log"
$process = $null

function Stop-ProcessTree([int]$processId) {
  try {
    $killer = Start-Process -FilePath (Join-Path $env:SystemRoot "System32/taskkill.exe") -ArgumentList @("/PID", [string]$processId, "/T", "/F") -PassThru -WindowStyle Hidden -Wait
    $killer.Dispose()
  } catch { }
}

try {
  $install = Start-Process -FilePath $installer -ArgumentList @("/S", "/D=$installDir") -PassThru -WindowStyle Hidden
  if (-not $install.WaitForExit(120000)) {
    Stop-ProcessTree $install.Id
    throw "Instalador não concluiu em 120 segundos. Verifique se a máquina exige elevação ou possui outra instância de instalação ativa."
  }
  if ($install.ExitCode -ne 0) { throw "Instalador terminou com código $($install.ExitCode)." }
  $executable = Join-Path $installDir "NexoAI.exe"
  if (-not (Test-Path -LiteralPath $executable)) { throw "Executável instalado não encontrado em $installDir." }

  New-Item -ItemType Directory -Force -Path $dataDir, $appDataDir | Out-Null
  $start = [System.Diagnostics.ProcessStartInfo]::new()
  $start.FileName = $executable
  $start.WorkingDirectory = $installDir
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  # ProcessStartInfo.ArgumentList is unavailable in Windows PowerShell 5.1,
  # which is the shell used by the Windows CI runners.
  $start.Arguments = "--enable-logging=stderr"
  $start.Environment["NEXO_DATA_DIR"] = $dataDir
  $start.Environment["NEXO_CORE_PORT"] = "0"
  $start.Environment["NEXO_SMOKE_READY_FILE"] = $readyFile
  $start.Environment["NEXO_SMOKE_STAGE_FILE"] = $stageFile
  $start.Environment["NODE_DEBUG"] = "module"
  $start.Environment["APPDATA"] = $appDataDir
  $process = [System.Diagnostics.Process]::Start($start)
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()

  $startupTimeoutSeconds = if ($env:NEXO_SMOKE_TIMEOUT_SECONDS) { [Math]::Max(45, [int]$env:NEXO_SMOKE_TIMEOUT_SECONDS) } else { 45 }
  $deadline = [DateTime]::UtcNow.AddSeconds($startupTimeoutSeconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    $process.Refresh()
    if ($process.HasExited) { break }
    if (Test-Path -LiteralPath $readyFile) { break }
    Start-Sleep -Milliseconds 250
  }

  if (-not (Test-Path -LiteralPath $readyFile)) {
    $startupLog = Join-Path $dataDir "logs/startup-errors.log"
    $diagnostic = if (Test-Path -LiteralPath $startupLog) { Get-Content -Raw -LiteralPath $startupLog } else { "Nenhum startup-errors.log foi criado." }
    $stdout = if ($stdoutTask.IsCompleted) { $stdoutTask.Result } else { "stdout ainda aberto" }
    $stderr = if ($stderrTask.IsCompleted) { $stderrTask.Result } else { "stderr ainda aberto" }
    $diagnostic = "$diagnostic`nstdout: $stdout`nstderr: $stderr"
    $stages = if (Test-Path -LiteralPath $stageFile) { Get-Content -Raw -LiteralPath $stageFile } else { "Nenhum marco de inicialização foi registrado." }
    $diagnostic = "$diagnostic`nstartup stages: $stages"
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
    if (-not $process.HasExited) {
      Stop-ProcessTree $process.Id
      $process.Refresh()
      if (-not $process.HasExited) { try { $process.Kill() } catch { }; $process.WaitForExit(5000) | Out-Null }
    }
    $process.Dispose()
  }
}
