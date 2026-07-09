@echo off
cd /d C:\projects\oiano
echo Running schema migration for WalletTopUp + payment_intent_id...
npx prisma db push --schema=prisma/schema.prisma
echo.
echo Migration complete. Restart the API with .\start-api.bat
pause
