@echo off
cd /d C:\projects\oiano\apps\api
echo.
echo Installing / repairing apps/api node_modules...
echo This may take a few minutes.
echo.
npm install
echo.
echo Exit code: %ERRORLEVEL%
echo.
if %ERRORLEVEL% EQU 0 (
  echo SUCCESS — dependencies repaired.
) else (
  echo FAILED — check output above.
)
echo.
echo Press any key to close.
pause
