@echo off
echo.
echo ========================================
echo   🚀 Setup Neon Database - Cronicas
echo ========================================
echo.

REM Check if .env exists
if exist .env (
    echo ⚠️  .env file already exists
    set /p OVERWRITE="Do you want to overwrite it? (y/N): "
    if /i not "%OVERWRITE%"=="y" (
        echo Setup cancelled.
        pause
        exit /b 1
    )
)

echo.
echo 📝 Creating .env file for Neon database...
echo.

REM Create .env file
(
echo # Server Configuration
echo PORT=3000
echo NODE_ENV=development
echo.
echo # Neon Database Configuration
echo # Replace with your actual Neon connection string
echo DATABASE_URL=postgresql://[user]:[password]@[host]/[dbname]?sslmode=require
echo.
echo # Database Type
echo DATABASE_TYPE=postgresql
echo.
echo # Redis Configuration ^(Optional^)
echo REDIS_HOST=localhost
echo REDIS_PORT=6379
echo REDIS_PASSWORD=
echo.
echo # OpenAI Configuration ^(Optional^)
echo OPENAI_API_KEY=your_openai_api_key_here
echo OPENAI_MODEL=gpt-4
echo.
echo # JWT Configuration
echo JWT_SECRET=cronicas_jwt_secret_2024_neon
echo JWT_EXPIRES_IN=7d
echo.
echo # Game Configuration
echo MAX_PLAYERS=8
echo MAP_SIZE=20
echo TURN_TIMEOUT=300000
) > .env

echo ✅ .env file created successfully!
echo.
echo 🔧 Next steps:
echo 1. Edit .env and replace DATABASE_URL with your Neon connection string
echo 2. Run: npm install
echo 3. Run: npm run dev-postgres
echo.
echo 📖 For help setting up Neon:
echo https://neon.tech/docs/get-started-with-neon/setting-up-a-project
echo.
pause 