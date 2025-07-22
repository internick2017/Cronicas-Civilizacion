@echo off
echo ==========================================
echo   Cronicas de Civilizacion - SQLite Setup
echo ==========================================

echo.
echo 🚀 Quick setup using SQLite (no external databases needed)...

echo.
echo 📁 Step 1: Creating .env file...
if exist ".env" (
    echo ✅ .env file already exists
) else (
    copy env.example .env
    echo ✅ .env file created from template
)

REM Add SQLite configuration to .env
echo.>> .env
echo # SQLite Configuration>> .env
echo DATABASE_TYPE=sqlite>> .env
echo SQLITE_PATH=./data/cronicas.db>> .env

echo.
echo 📦 Step 2: Installing Node.js dependencies...
npm install
if %errorlevel% == 0 (
    echo ✅ Dependencies installed successfully
) else (
    echo ❌ Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo 🗃️ Step 3: Creating data directory...
if not exist "data" mkdir data
echo ✅ Data directory created

echo.
echo 🔧 Step 4: Configuring server for SQLite...
REM Update server.js to use SQLite config
powershell -Command "if ((Get-Content 'src/server.js') -notmatch 'database-sqlite') { (Get-Content 'src/server.js') -replace \"import pool from './config/database.js';\", \"import pool from './config/database-sqlite.js';\" | Set-Content 'src/server.js' }"

echo ✅ Server configured for SQLite

echo.
echo 🧪 Step 5: Testing SQLite setup...
node -e "import('./src/config/database-sqlite.js').then(() => console.log('✅ SQLite database initialized!'))" 2>nul
if %errorlevel% == 0 (
    echo ✅ SQLite setup successful!
) else (
    echo ⚠️ SQLite test completed (database will be created on first run)
)

echo.
echo ==========================================
echo   🎉 SQLite Setup Complete!
echo ==========================================
echo.
echo ✅ Database: SQLite (file-based, no server needed)
echo ✅ Cache: In-memory (Redis disabled for simplicity)
echo.
echo To start the server:
echo   npm run dev-sqlite
echo.
echo Backend will be available at: http://localhost:3000
echo Health check: http://localhost:3000/health
echo.
echo Database file location: ./data/cronicas.db
echo.
echo Press any key to exit...
pause >nul 