@echo off
setlocal
echo 🌠 Starlight Protocol: CBA Orchestration Launcher
echo --------------------------------------------------

:: 1. Force kill any previous Hub process on port 8080
echo [Launcher] Cleaning environment (Port 8080)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8080') do (
    if NOT "%%a"=="" taskkill /f /pid %%a >nul 2>&1
)

:: 2. Launch the Hub (Node.js)
echo [Launcher] Launching CBA Hub...
start "CBA Hub" cmd /c "node src/hub.js"
timeout /t 3 /nobreak >nul

:: 3. Launch the Janitor Sentinel (Python)
echo [Launcher] Launching Janitor Sentinel...
start "CBA Janitor" cmd /c "python sentinels/janitor.py"
timeout /t 3 /nobreak >nul

:: 4. Launch the Intent Layer (The Mission)
echo [Launcher] Executing Mission Intent...
node src/intent.js

echo --------------------------------------------------
echo [Launcher] Mission Complete. Check Hub window for Hero Story generation.
pause
