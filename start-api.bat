@echo off
cd /d C:\projects\oiano
echo.
echo Starting OIANO API (port 4000)...
echo.

REM ── Kill any existing process on port 4000 ────────────────────────────────────
echo Clearing port 4000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :4000 ^| findstr LISTENING') do (
  echo Killing PID %%a
  taskkill /PID %%a /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

REM ── Patch corrupted semver (nested in tsconfig-paths or similar) ─────────────
REM Create directory structure if missing
if not exist "apps\api\node_modules\semver\internal" (
  mkdir "apps\api\node_modules\semver\internal" >nul 2>&1
)
set SEMVER_FIX=apps\api\node_modules\semver\internal\re.js
set SEMVER_SRC=node_modules\semver\internal\re.js
if not exist "%SEMVER_FIX%" (
  if exist "%SEMVER_SRC%" (
    echo Patching semver/internal/re.js...
    copy /Y "%SEMVER_SRC%" "%SEMVER_FIX%" >nul
  )
)

npm run dev --workspace=apps/api
