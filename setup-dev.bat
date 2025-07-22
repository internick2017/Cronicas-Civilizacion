@echo off
echo 🏛️  Configurando Crónicas de Civilización - Entorno de Desarrollo
echo ================================================================

REM Check if Docker is installed
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker no está instalado. Por favor instala Docker primero.
    pause
    exit /b 1
)

docker-compose --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker Compose no está instalado. Por favor instala Docker Compose primero.
    pause
    exit /b 1
)

REM Create .env file for backend if it doesn't exist
if not exist "backend\.env" (
    echo 📝 Creando archivo .env para el backend...
    copy "backend\env.example" "backend\.env"
    echo ✅ Archivo .env creado. Puedes editarlo con tus configuraciones.
)

REM Install dependencies
echo 📦 Instalando dependencias del backend...
cd backend
call npm install
cd ..

echo 📦 Instalando dependencias del frontend...
cd frontend
call npm install
cd ..

REM Start services
echo 🚀 Iniciando servicios con Docker Compose...
docker-compose up -d postgres redis

REM Wait for database to be ready
echo ⏳ Esperando a que la base de datos esté lista...
timeout /t 10 /nobreak >nul

echo 🎮 Aplicación lista para desarrollar!
echo.
echo Backend: http://localhost:3000
echo Frontend: http://localhost:5173
echo pgAdmin: http://localhost:5050 (usuario: admin@cronicas.com, contraseña: admin)
echo.
echo Para parar los servicios: docker-compose down
echo Para ver logs: docker-compose logs -f
echo.
echo 🎉 ¡Configuración completada! Puedes empezar a desarrollar.
pause 