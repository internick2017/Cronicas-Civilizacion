# 📊 Configuración de Base de Datos para Crónicas de Civilización

## 🎯 Objetivo
Guía completa para configurar PostgreSQL (recomendado) o MySQL en WSL para el proyecto Crónicas de Civilización.

## 🛠️ Requisitos Previos
- WSL2 instalado
- Docker instalado
- Node.js 18+

## 1. 🐘 Configuración de PostgreSQL (Recomendado)

### Instalación con Docker
```bash
docker run -d \
  --name cronicas-postgres \
  -p 5432:5432 \
  -e POSTGRES_DB=cronicas_civilizacion \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  postgres:13
```

### Configuración en `.env`
```
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=cronicas_civilizacion
DB_USER=postgres
DB_PASSWORD=password
```

### Instalar Dependencias
```bash
cd backend
npm install pg
```

### Verificar Conexión
```bash
# Instalar cliente PostgreSQL
sudo apt-get install -y postgresql-client

# Conectar
psql -h 127.0.0.1 -p 5432 -U postgres -d cronicas_civilizacion
```

## 2. 🔴 Configuración de Redis

### Instalación con Docker
```bash
docker run -d \
  --name cronicas-redis \
  -p 6379:6379 \
  redis:alpine
```

### Configuración en `.env`
```
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=  # Opcional
```

### Instalar Dependencia
```bash
cd backend
npm install redis
```

### Verificar Conexión
```bash
# Instalar redis-cli
sudo apt-get install -y redis-tools

# Conectar
redis-cli -h 127.0.0.1 -p 6379
```

## 3. 🐳 MySQL como Alternativa

### Instalación con Docker
```bash
docker run -d \
  --name cronicas-mysql \
  -p 3380:3306 \
  -e MYSQL_ROOT_PASSWORD=d165218l \        
  -e MYSQL_DATABASE=cronicas_civilizacion \
  -e MYSQL_ROOT_HOST='%' \
  mysql:8.0
```

### Configuración en `.env` (si usas MySQL)
```
DB_HOST=127.0.0.1
DB_PORT=3380
DB_NAME=cronicas_civilizacion
DB_USER=root
DB_PASSWORD=d165218l
```

## 4. 🚀 Configuración Completa

### Iniciar Todos los Servicios
```bash
# PostgreSQL
docker run -d --name cronicas-postgres -p 5432:5432 -e POSTGRES_DB=cronicas_civilizacion -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=password postgres:13

# Redis
docker run -d --name cronicas-redis -p 6379:6379 redis:alpine
```

### Archivo `.env` Final
```
# Server Configuration
PORT=3000
NODE_ENV=development

# Database Configuration
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=cronicas_civilizacion
DB_USER=postgres
DB_PASSWORD=password

# Redis Configuration
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4

# JWT Configuration
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=7d

# Game Configuration
MAX_PLAYERS=8
MAP_SIZE=20
TURN_TIMEOUT=300000
```

### Ejecutar Backend
```bash
cd backend
npm run dev
```

## 5. 🛡️ Gestión de Contenedores

### Comandos Útiles
```bash
# Ver contenedores activos
docker ps

# Detener todos los servicios
docker stop cronicas-postgres cronicas-redis

# Eliminar contenedores
docker rm cronicas-postgres cronicas-redis

# Reiniciar servicios
docker restart cronicas-postgres cronicas-redis
```

## 6. 🔍 Solución de Problemas

### Errores Comunes
- Verificar que los puertos estén libres
- Comprobar conexión de red
- Revisar logs de Docker: `docker logs <nombre-contenedor>`

## 7. 📝 Referencias
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Redis Documentation](https://redis.io/documentation)
- [Docker Hub](https://hub.docker.com/) 