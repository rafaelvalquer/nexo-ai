$ErrorActionPreference = "Stop"
$installer = (Resolve-Path "release/NexoAI-Setup-0.5.2.exe").Path
$smokeRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [System.IO.Path]::GetTempPath() }
$installDir = Join-Path $smokeRoot "NexoAI-Smoke-0.5.2"
if (Test-Path -LiteralPath $installDir) { Remove-Item -LiteralPath $installDir -Recurse -Force }
$install = Start-Process -FilePath $installer -ArgumentList "/S", "/D=$installDir" -Wait -PassThru -WindowStyle Hidden
if ($install.ExitCode -ne 0) { throw "Instalador terminou com código $($install.ExitCode)." }
$executable = Join-Path $installDir "NexoAI.exe"
if (-not (Test-Path -LiteralPath $executable)) { throw "Executável instalado não encontrado." }
$dataDir = Join-Path $smokeRoot "NexoAI-Smoke-Data"
$env:NEXO_DATA_DIR = $dataDir
$process = Start-Process -FilePath $executable -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 12
$running = Get-Process -Id $process.Id -ErrorAction SilentlyContinue
if (-not $running) { throw "O Nexo AI não permaneceu em execução após a instalação." }
Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
Write-Host "Smoke do instalador concluído: processo iniciado com sucesso."
