@echo off
setlocal
cd /d "%~dp0"
where pnpm >nul 2>nul
if errorlevel 1 (
  corepack enable
  corepack prepare pnpm@10.15.1 --activate
)
pnpm install || exit /b 1
pnpm typecheck || exit /b 1
pnpm test || exit /b 1
pnpm package:win
