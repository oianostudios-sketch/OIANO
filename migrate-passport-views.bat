@echo off
cd /d C:\projects\oiano
echo Adding profile_views, ai_summary_edited, ai_summary_public to ArtistPassport...
npx prisma db push --schema=prisma/schema.prisma
echo.
echo Migration complete. Restart the API with .\start-api.bat
pause
