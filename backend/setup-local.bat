@echo off
setlocal enabledelayedexpansion

echo ==========================================
echo   Cronicas de Civilizacion - Auto Setup
echo ==========================================

echo.
echo 🚀 Starting automated setup for Windows...

REM Check if running as administrator
net session >nul 2>&1
if %errorlevel% == 0 (
    echo ✅ Running as Administrator
) else (
    echo ❌ This script needs to run as Administrator
    echo Please right-click and select "Run as administrator"
    pause
    exit /b 1
)

echo.
echo 📦 Step 1: Installing Chocolatey (Package Manager)...
where choco >nul 2>&1
if %errorlevel% == 0 (
    echo ✅ Chocolatey already installed
) else (
    powershell -Command "Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))"
    if !errorlevel! == 0 (
        echo ✅ Chocolatey installed successfully
    ) else (
        echo ❌ Failed to install Chocolatey
        goto SQLITE_OPTION
    )
)

echo.
echo 🐘 Step 2: Installing PostgreSQL...
where psql >nul 2>&1
if %errorlevel% == 0 (
    echo ✅ PostgreSQL already installed
) else (
    choco install postgresql --params "/Password:password" -y
    if !errorlevel! == 0 (
        echo ✅ PostgreSQL installed successfully
        echo Default password set to: password
    ) else (
        echo ❌ Failed to install PostgreSQL
        goto SQLITE_OPTION
    )
)

echo.
echo 🔴 Step 3: Installing Memurai (Redis for Windows)...
where memurai-cli >nul 2>&1
if %errorlevel% == 0 (
    echo ✅ Memurai already installed
) else (
    echo Downloading Memurai...
    powershell -Command "Invoke-WebRequest -Uri 'https://download.memurai.com/memurai-developer/Memurai-Developer-v3.0.4.msi' -OutFile 'memurai-installer.msi'"
    if exist "memurai-installer.msi" (
        echo Installing Memurai...
        msiexec /i "memurai-installer.msi" /quiet /norestart
        del "memurai-installer.msi"
        echo ✅ Memurai installed successfully
    ) else (
        echo ❌ Failed to download Memurai
        goto SQLITE_OPTION
    )
)

echo.
echo 📁 Step 4: Creating .env file...
if exist ".env" (
    echo ✅ .env file already exists
) else (
    copy env.example .env
    echo ✅ .env file created from template
)

echo.
echo 📦 Step 5: Installing Node.js dependencies...
npm install
if %errorlevel% == 0 (
    echo ✅ Dependencies installed successfully
) else (
    echo ❌ Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo 🗃️ Step 6: Setting up PostgreSQL database...
REM Wait for PostgreSQL service to start
timeout /t 10 /nobreak >nul

REM Create database using psql
psql -U postgres -c "CREATE DATABASE cronicas_civilizacion;" 2>nul
if %errorlevel% == 0 (
    echo ✅ Database created successfully
    psql -U postgres -d cronicas_civilizacion -f setup-local-db.sql
    if !errorlevel! == 0 (
        echo ✅ Database tables created successfully
    ) else (
        echo ⚠️ Warning: Failed to create tables
    )
) else (
    echo ⚠️ Warning: Database might already exist or PostgreSQL not ready
)

echo.
echo 🚀 Step 7: Starting services...
echo Starting Memurai...
net start memurai >nul 2>&1

echo.
echo 🧪 Step 8: Testing connections...
node test-connections.js

echo.
echo ==========================================
echo   🎉 Setup Complete!
echo ==========================================
echo.
echo To start the server: npm run dev
echo To test connections: npm run test-connections
echo.
echo Backend will be available at: http://localhost:3000
echo Health check: http://localhost:3000/health
echo.
goto END

:SQLITE_OPTION
echo.
echo ==========================================
echo   🔄 Falling back to SQLite setup
echo ==========================================
echo.
echo Installing SQLite package...
npm install better-sqlite3
if %errorlevel% == 0 (
    echo ✅ SQLite package installed
    
    REM Update database import to use SQLite
    powershell -Command "(Get-Content 'src/server.js') -replace 'from './config/database.js', 'from './config/database-sqlite.js' | Set-Content 'src/server.js'"
    
    REM Update .env for SQLite
    echo DATABASE_TYPE=sqlite >> .env
    echo SQLITE_PATH=./data/cronicas.db >> .env
    
    echo ✅ Configured to use SQLite database
    echo Database file will be created at: ./data/cronicas.db
    
    echo.
    echo 🧪 Testing SQLite setup...
    node -e "import('./src/config/database-sqlite.js').then(() => console.log('✅ SQLite setup successful!'))"
) else (
    echo ❌ Failed to install SQLite package
)

:END
echo.
echo Press any key to exit...
pause >nul 