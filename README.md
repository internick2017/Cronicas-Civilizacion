# Crónicas de Civilización

**Juego de estrategia por turnos con narrativa generada por IA**

## 🚀 Stack Tecnológico

### Frontend
- **Vue.js 3** - Framework reactivo para la interfaz
- **Vite** - Build tool y dev server
- **Socket.io Client** - Comunicación en tiempo real
- **Canvas API** - Renderizado del mapa

### Backend
- **Node.js** - Runtime de JavaScript
- **Express** - Framework web
- **Socket.io** - WebSocket para multijugador
- **PostgreSQL** - Base de datos principal
- **Redis** - Caché y sesiones
- **OpenAI API** - Generación de narrativa

## 📁 Estructura del Proyecto

```
cronicas-civilizacion/
├── frontend/          # Vue.js application
├── backend/           # Node.js/Express API
├── database/          # SQL schemas y migrations
├── docker-compose.yml # Servicios de desarrollo
└── README.md
```

## 🎯 Características Principales

- Mapa de mundo con territorios en cuadrícula
- Sistema de turnos para 1-N jugadores
- 7 tipos de recursos (Comida, Oro, Madera, Piedra, Ciencia, Cultura, Ejército)
- Narrativa dinámica generada por IA
- Multijugador en tiempo real
- Diferentes modos de victoria

## 🚧 Estado del Desarrollo

### ✅ Completado
- **Frontend**: Componentes principales (GameLobby, WaitingRoom, PlayerInfo, ResourcePanel, ActionPanel, GameMap, NarrativePanel, ChatPanel)
- **Backend**: Estructura completa con Express, Socket.io, modelos de juego
- **Base de datos**: Schema PostgreSQL completo con tablas para jugadores, partidas, mapa, ciudades, ejércitos, historial
- **Infraestructura**: Docker Compose para desarrollo, Redis para caché
- **Configuración**: Scripts de setup automático para Windows y Linux/macOS
- **Lógica de juego**: Sistema completo de acciones (fundar ciudad, recolectar recursos, mover ejército, construir infraestructura, diplomacia, acción libre)
- **Sistema de turnos**: Implementación completa con rotación de jugadores y efectos de fin de ronda
- **Condiciones de victoria**: Sistema de verificación para dominio, ciencia, cultura y economía
- **WebSocket**: Manejo completo de eventos en tiempo real con manejo de errores
- **Composables Vue**: useGameSocket y useGameApi completamente implementados
- **Fallback sin BD**: Sistema funciona sin base de datos para desarrollo

### ✅ Completado
- **Frontend**: Componentes principales (GameLobby, WaitingRoom, PlayerInfo, ResourcePanel, ActionPanel, GameMap, NarrativePanel, ChatPanel)
- **Backend**: Estructura completa con Express, Socket.io, modelos de juego
- **Base de datos**: Schema PostgreSQL completo con tablas para jugadores, partidas, mapa, ciudades, ejércitos, historial
- **Infraestructura**: Docker Compose para desarrollo, Redis para caché
- **Configuración**: Scripts de setup automático para Windows y Linux/macOS
- **Lógica de juego**: Sistema completo de acciones (fundar ciudad, recolectar recursos, mover ejército, construir infraestructura, diplomacia, acción libre)
- **Sistema de turnos**: Implementación completa con rotación de jugadores y efectos de fin de ronda
- **Condiciones de victoria**: Sistema de verificación para dominio, ciencia, cultura y economía
- **WebSocket**: Manejo completo de eventos en tiempo real con manejo de errores
- **Composables Vue**: useGameSocket y useGameApi completamente implementados
- **Fallback sin BD**: Sistema funciona sin base de datos para desarrollo
- **Integración OpenAI**: Generación de narrativa con IA completamente implementada con fallback
- **Integración de base de datos**: Migración completa de almacenamiento en memoria a PostgreSQL (funciona con fallback)
- **Autenticación**: Sistema completo de usuarios y sesiones con JWT

### 📋 Pendiente
- **Mejoras UI**: Interfaz más pulida y responsive
- **Pruebas**: Sistema de testing automatizado

## 🎯 Estado Actual

El juego está **funcionalmente completo** para desarrollo y pruebas:

✅ **Backend funcionando**: API REST + WebSocket en puerto 3000  
✅ **Frontend funcionando**: Interfaz Vue.js en puerto 5173  
✅ **Juego jugable**: Crear partidas, unirse, jugar turnos, condiciones de victoria  
✅ **Multijugador**: Hasta 8 jugadores simultáneos  
✅ **Mapa generado**: Mundo de 20x20 con recursos y terrenos  
✅ **7 tipos de recursos**: Comida, Oro, Madera, Piedra, Ciencia, Cultura, Ejército  
✅ **6 acciones disponibles**: Fundar ciudad, recolectar recursos, mover ejército, construir, diplomacia, acción libre  
✅ **4 modos de victoria**: Dominio (60% territorio), Ciencia (1000 pts), Cultura (800 pts), Economía (1500 oro)  

## 🛠️ Instalación y Desarrollo

### Prerrequisitos
- Node.js 18+
- Docker y Docker Compose
- Cuenta OpenAI API (opcional para narrativa IA)

### 📦 Configuración de Base de Datos
- [📘 Guía Completa de Configuración de Bases de Datos](docs/DATABASE_SETUP.md)
  - [🐘 PostgreSQL (Recomendado)](docs/DATABASE_SETUP.md#-configuración-de-postgresql-recomendado)
  - [🔴 Redis](docs/DATABASE_SETUP.md#-configuración-de-redis)
  - [🐳 MySQL (Alternativa)](docs/DATABASE_SETUP.md#-mysql-como-alternativa)

### Configuración rápida

#### Windows
```batch
# Ejecutar script de configuración
setup-dev.bat

# O manualmente:
docker-compose up -d postgres redis
cd backend && npm install && npm run dev
cd frontend && npm install && npm run dev
```

#### Linux/macOS
```bash
# Ejecutar script de configuración
./setup-dev.sh

# O manualmente:
docker-compose up -d postgres redis
cd backend && npm install && npm run dev
cd frontend && npm install && npm run dev
```

### URLs de desarrollo
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000
- **pgAdmin**: http://localhost:5050 (admin@cronicas.com / admin)

## 🎮 Cómo Jugar

1. Cada jugador controla una civilización
2. En su turno puede realizar una acción:
   - Fundar/conquistar ciudad
   - Recolectar recursos
   - Crear/mover ejército
   - Mejorar infraestructura
   - Diplomacia
   - Acción libre
3. La IA narra las consecuencias y modifica el mundo
4. Gana quien cumpla las condiciones de victoria

## 📝 Licencia

MIT License 