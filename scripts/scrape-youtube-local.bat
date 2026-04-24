@echo off
REM Local YouTube transcript scraper. Runs from the user's residential IP.
REM Necessary because youtube-transcript-api blocks cloud-provider IPs (Azure/AWS/GCP)
REM so this step cannot live in GitHub Actions. See memory-bank/techContext.md
REM section "Data Pipeline" and memory-bank/errors.md.

cd /d "%~dp0.." || exit /b 0

if not exist "scripts\logs" mkdir "scripts\logs"

for /f "usebackq delims=" %%i in (`powershell -nop -c "Get-Date -Format 'yyyy-MM-dd'"`) do set "TS=%%i"
set "LOG=scripts\logs\youtube-%TS%.log"

echo. >> "%LOG%"
echo === Run started %date% %time% === >> "%LOG%"

python scraper_youtube.py >> "%LOG%" 2>&1

git add data/transcripts >> "%LOG%" 2>&1

git diff --cached --quiet
if errorlevel 1 (
  git commit -m "refresh: local youtube scrape" >> "%LOG%" 2>&1
  git pull --rebase --autostash origin main >> "%LOG%" 2>&1
  git push >> "%LOG%" 2>&1
) else (
  echo No new transcripts staged. >> "%LOG%"
)

echo === Run finished %date% %time% === >> "%LOG%"
exit /b 0
