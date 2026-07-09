@echo off
cd /d C:\projects\oiano
echo.
echo Running prisma seed...
echo.
npx ts-node --compiler-options "{\"module\":\"CommonJS\"}" prisma/seed.ts
echo.
echo Exit code: %ERRORLEVEL%
echo.
echo Done. Press any key to close.
pause
