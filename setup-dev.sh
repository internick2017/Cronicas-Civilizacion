#!/bin/bash

echo "🏛️  Configurando Crónicas de Civilización - Entorno de Desarrollo"
echo "================================================================"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker no está instalado. Por favor instala Docker primero."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose no está instalado. Por favor instala Docker Compose primero."
    exit 1
fi

# Create .env file for backend if it doesn't exist
if [ ! -f backend/.env ]; then
    echo "📝 Creando archivo .env para el backend..."
    cp backend/env.example backend/.env
    echo "✅ Archivo .env creado. Puedes editarlo con tus configuraciones."
fi

# Install dependencies
echo "📦 Instalando dependencias del backend..."
cd backend && npm install
cd ..

echo "📦 Instalando dependencias del frontend..."
cd frontend && npm install
cd ..

# Start services
echo "🚀 Iniciando servicios con Docker Compose..."
docker-compose up -d postgres redis

# Wait for database to be ready
echo "⏳ Esperando a que la base de datos esté lista..."
sleep 10

# Start the application
echo "🎮 Iniciando la aplicación..."
echo "Backend: http://localhost:3000"
echo "Frontend: http://localhost:5173"
echo "pgAdmin: http://localhost:5050 (usuario: admin@cronicas.com, contraseña: admin)"
echo ""
echo "Para parar los servicios: docker-compose down"
echo "Para ver logs: docker-compose logs -f"
echo ""
echo "🎉 ¡Configuración completada! Puedes empezar a desarrollar." 