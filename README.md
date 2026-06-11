# 📚 Crónicas de Civilización - Modo Narrativo

Una experiencia de narración colaborativa donde tú y tu familia crean historias épicas juntos, con la IA como narrador maestro.

## 🎯 ¿Qué es?

**Crónicas de Civilización** es ahora una plataforma de narración colaborativa que permite a familias crear historias épicas juntas. Cada miembro de la familia escribe una acción, y la IA genera una narrativa continua que mantiene la historia fluyendo.

### ✨ Características Principales

- **Narración Colaborativa**: Cada jugador contribuye a la historia por turnos
- **IA Narrativa**: La inteligencia artificial genera respuestas épicas y continuas
- **Múltiples Géneros**: Fantasía, histórico, ciencia ficción, misterio
- **Interfaz Simple**: Enfocada en la escritura y la narrativa
- **Tiempo Real**: Actualizaciones en vivo de la historia
- **Exportación**: Guarda tus historias para leerlas después

## 🚀 Cómo Funciona

1. **Crear una Historia**: Define el título, descripción y género
2. **Unirse**: Los miembros de la familia se unen con sus personajes
3. **Escribir**: Cada uno describe qué hace su personaje
4. **Narrar**: La IA continúa la historia con detalles épicos
5. **Continuar**: La historia evoluciona turno tras turno

## 🛠️ Instalación

### Prerrequisitos

- Node.js 18+ 
- npm o yarn
- OpenAI API Key (opcional, para narrativa mejorada)

### Configuración Rápida

1. **Clonar el repositorio**
```bash
git clone <repository-url>
cd cronicas-civilizacion
```

2. **Configurar variables de entorno**
```bash
# Backend
cd backend
cp env.example .env
```

Editar `.env`:
```env
# OpenAI (opcional)
OPENAI_API_KEY=tu_api_key_aqui

# Base de datos (SQLite por defecto)
DATABASE_TYPE=sqlite
DATABASE_URL=./data/story_sessions.db

# Servidor
PORT=3000
NODE_ENV=development
```

3. **Instalar dependencias**
```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

4. **Ejecutar en desarrollo**
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

5. **Abrir en el navegador**
```
http://localhost:5173
```

## 🎮 Cómo Jugar

### Crear una Nueva Historia

1. En el lobby, completa el formulario de "Crear Nueva Historia"
2. Define:
   - **Título**: El nombre de tu aventura
   - **Descripción**: El contexto o ambientación
   - **Jugadores**: Cuántos participarán (2-6)
   - **Género**: Fantasía, histórico, etc.

### Unirse a una Historia

1. Ve a la sección "Unirse a una Historia"
2. Selecciona una sesión activa
3. Completa tu información:
   - **Tu nombre**: Tu nombre real
   - **Personaje**: Nombre de tu personaje
   - **Clase**: Tipo de personaje (Aventurero, Mago, etc.)

### Jugar por Turnos

1. **Espera tu turno**: El sistema indica quién debe escribir
2. **Escribe tu acción**: Describe qué hace tu personaje
3. **Envía**: La IA genera la narrativa
4. **Continúa**: El turno pasa al siguiente jugador

### Consejos para Escribir

- **Sé específico**: "Levanto mi espada y cargo contra el dragón"
- **Incluye diálogo**: "¡Por el honor de mi reino!"
- **Mantén continuidad**: Lee las acciones anteriores
- **Sé creativo**: La IA se alimenta de tu imaginación

## 🏗️ Arquitectura

### Backend (Node.js + Express)

```
backend/
├── src/
│   ├── models/
│   │   └── StorySession.js      # Modelo de sesiones narrativas
│   ├── services/
│   │   ├── NarrativeService.js  # Lógica de narración
│   │   └── AIService.js         # Integración con OpenAI
│   ├── routes/
│   │   └── narrativeRoutes.js   # API para sesiones
│   └── config/
│       └── index.js             # Configuración
```

### Frontend (Vue.js 3)

```
frontend/
├── src/
│   ├── components/
│   │   ├── StoryLobby.vue       # Lobby para crear/unirse
│   │   ├── StorySession.vue     # Interfaz de juego
│   │   └── StoryInput.vue       # Entrada de texto
│   └── App.vue                  # Componente principal
```

## 🔧 API Endpoints

### Sesiones Narrativas

- `GET /api/narrative/sessions` - Listar sesiones activas
- `POST /api/narrative/sessions` - Crear nueva sesión
- `POST /api/narrative/sessions/:id/join` - Unirse a sesión
- `POST /api/narrative/sessions/:id/action` - Enviar acción
- `GET /api/narrative/sessions/:id/history` - Obtener historial

### Ejemplo de Uso

```javascript
// Crear sesión
const response = await fetch('/api/narrative/sessions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'La Búsqueda del Tesoro',
    description: 'Una aventura épica',
    maxPlayers: 4,
    settings: { genre: 'fantasy' }
  })
})

// Enviar acción
const actionResponse = await fetch('/api/narrative/sessions/session-id/action', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    playerId: 'player-id',
    action: 'Levanto mi espada y cargo contra el enemigo'
  })
})
```

## 🎨 Personalización

### Configurar IA

En `backend/src/services/AIService.js`:

```javascript
// Personalizar prompts
getSystemPrompt() {
  return `Eres el narrador de una historia colaborativa...
  // Personaliza aquí el estilo narrativo
`
}
```

### Añadir Géneros

En `frontend/src/components/StoryLobby.vue`:

```javascript
const genres = [
  { value: 'fantasy', label: 'Fantasía' },
  { value: 'historical', label: 'Histórico' },
  { value: 'sci-fi', label: 'Ciencia Ficción' },
  { value: 'mystery', label: 'Misterio' },
  // Añade nuevos géneros aquí
]
```

## 🚀 Despliegue

### Docker

```bash
# Construir imágenes
docker-compose build

# Ejecutar
docker-compose up -d
```

### Producción

1. **Configurar variables de producción**
2. **Usar base de datos PostgreSQL**
3. **Configurar Redis para caché**
4. **Configurar proxy reverso (nginx)**

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature
3. Commit tus cambios
4. Push a la rama
5. Abre un Pull Request

## 📝 Licencia

Este proyecto está bajo la Licencia MIT.

## 🆘 Soporte

- **Issues**: Reporta bugs en GitHub Issues
- **Discusiones**: Únete a las discusiones para ideas
- **Documentación**: Revisa la carpeta `docs/`

## 🎯 Roadmap

- [ ] **Múltiples idiomas**: Soporte para inglés y otros idiomas
- [ ] **Imágenes generadas**: IA para ilustrar escenas
- [ ] **Música de fondo**: Ambientación sonora
- [ ] **Modo offline**: Jugar sin conexión
- [ ] **Historias guardadas**: Biblioteca de historias
- [ ] **Colaboración en tiempo real**: Múltiples dispositivos

---

**¡Que comience la aventura! 🗡️✨** 