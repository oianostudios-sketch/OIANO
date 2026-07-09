@echo off
cd /d C:\projects\oiano
echo.
echo ========================================
echo  OIANO StudioOS - Starting Dev Servers
echo ========================================
echo.

REM ── Kill anything on port 4000 ───────────────────────────────────────────────
echo [1/2] Clearing port 4000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :4000 ^| findstr LISTENING') do (
  echo   Killing PID %%a
  taskkill /PID %%a /F >nul 2>&1
)

REM ── Kill anything on port 5173 ───────────────────────────────────────────────
echo [2/2] Clearing port 5173...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do (
  echo   Killing PID %%a
  taskkill /PID %%a /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

REM ── Patch semver if needed ───────────────────────────────────────────────────
if not exist "apps\api\node_modules\semver\internal" (
  mkdir "apps\api\node_modules\semver\internal" >nul 2>&1
)
set SEMVER_FIX=apps\api\node_modules\semver\internal\re.js
set SEMVER_SRC=node_modules\semver\internal\re.js
if not exist "%SEMVER_FIX%" (
  if exist "%SEMVER_SRC%" (
    echo Patching semver...
    copy /Y "%SEMVER_SRC%" "%SEMVER_FIX%" >nul
  )
)

echo.
echo Starting API  (http://localhost:4000) ...
start "OIANO API" cmd /k "cd /d C:\projects\oiano && npm run dev --workspace=apps/api"

timeout /t 3 /nobreak >nul

echo Starting Web  (http://localhost:5173) ...
start "OIANO Web" cmd /k "cd /d C:\projects\oiano && npm run dev --workspace=apps/web"

echo.
echo Both servers starting. Check the two windows that just opened.
echo Your team member can connect on the network URL shown by Vite.
echo.
pause
