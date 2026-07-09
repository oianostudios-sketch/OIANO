@echo off
cd /d C:\projects\oiano
echo Running migration with pg...
node run-migration-pg.js
echo.
echo Done. Press any key to close.
pause
