# Frontend del modo mapa — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Interfaz Vue jugable para el modo mapa: crear/unirse/iniciar una partida, ver el mapa con niebla de guerra en una grilla CSS, y ejecutar fundar ciudad / construir / terminar turno, con actualización en vivo vía socket.

**Architecture:** Dos composables nuevos (`useMapApi`, `useMapSocket`) más siete componentes bajo `frontend/src/components/mapa/`, todo nuevo y sin tocar el modo narrativo ni el sistema legacy del modo mapa (`GameMap.vue`, `useGameApi.js`, `useGameSocket.js`). `App.vue` gana un selector de modo delante de lo que hoy monta directamente.

**Tech Stack:** Vue 3 `<script setup>`, `axios` (ya es dependencia), `socket.io-client` (ya es dependencia). Sin librerías nuevas.

## Global Constraints

- npm/npx están rotos en esta máquina: usar **yarn** para todo (`yarn dev`, `yarn lint`, `yarn build`).
- Sin tests automatizados de frontend (el proyecto no tiene ninguno hoy). Verificación manual en navegador real con `preview_start`, dos pestañas simulando dos jugadores, antes de dar cada tarea por terminada.
- No tocar `GameMap.vue`, `useGameApi.js`, `useGameSocket.js`, `GameLobby.vue`, `ActionPanel.vue`, `PlayerInfo.vue`, `ResourcePanel.vue` (legacy, se borran en un PR de limpieza aparte) ni ningún componente del modo narrativo (`StoryLobby.vue`, `StorySession.vue`, etc.).
- `jugadorId` lo genera el cliente con `crypto.randomUUID()` al entrar al lobby, antes de llamar a `unirse`.
- El `token` que devuelve `unirse` se guarda en `localStorage` bajo las claves `cronicas-mapa-id`, `cronicas-mapa-codigo`, `cronicas-mapa-jugadorId`, `cronicas-mapa-token`. Nunca se manda a ningún lado salvo el header `X-Jugador-Token` y el tercer argumento de `map:join`.
- Todas las llamadas a `POST /:id/accion` y `GET /:id` van con el header `X-Jugador-Token`. `POST /:id/unirse`, `POST /:id/iniciar`, `POST /api/map`, `GET /api/map` van sin header.
- El backend corre en el mismo origen que el frontend vía proxy de Vite (`config.api.baseUrl` es `''`, `config.socket.url` es `window.location.origin`) — ver `frontend/src/config/env.js`. Nada de URLs hardcodeadas.
- Paleta a reusar (de `StoryLobby.vue`): fondo `linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)`, texto `#ecf0f1`, acentos `#3498db` (azul, seleccionado/foco), `#27ae60`/`#2ecc71` (verde, confirmar), `#e74c3c` (rojo, error/peligro), paneles `rgba(255, 255, 255, 0.05-0.15)`.
- ESLint 0 errores: `cd frontend && yarn lint` antes de cada commit.
- Commits sin atribución de IA ni líneas `Co-Authored-By`.
- Spec de referencia: `docs/superpowers/specs/2026-08-08-frontend-modo-mapa-design.md`.

---

### Task 1: `useMapApi.js` — cliente REST del modo mapa

**Files:**
- Create: `frontend/src/composables/useMapApi.js`

**Interfaces:**
- Produces (las usan Tasks 3-7):
  - `crearPartida({ nombre }) -> Promise<{ id, codigo }>`
  - `unirse(idOCodigo, { id, nombre, civilizacion }) -> Promise<{ vista, token }>`
  - `iniciar(id) -> Promise<vista>`
  - `accion(id, jugadorId, token, { tipo, ...datos }) -> Promise<{ vista, eventos }>`
  - `vista(id, jugadorId, token) -> Promise<vista>`
  - `listarPartidas() -> Promise<[{ id, codigo, nombre, estado }]>`
  - Todas lanzan el error tal cual lo devuelve axios en el catch (`{ codigo, mensaje }` si el backend respondió 400/404, o el error de red crudo si no hubo respuesta) — no se envuelve en una clase propia, el consumidor decide qué mostrar.

No hay test automatizado (Global Constraints). La verificación de este task se hace desde la consola del navegador una vez montado en la app real (Task 7 en adelante), así que este task no tiene un paso de verificación aislado propio: se commitea y se verifica en conjunto con Task 3 (lobby).

- [ ] **Step 1: Crear el archivo**

```js
// frontend/src/composables/useMapApi.js
import axios from 'axios'
import config from '../config/env.js'

const api = axios.create({
  baseURL: `${config.api.baseUrl}/api/map`,
  timeout: config.api.timeout,
  headers: { 'Content-Type': 'application/json' }
})

api.interceptors.response.use(
  (response) => response.data,
  (error) => Promise.reject(error.response?.data || error)
)

export function useMapApi() {
  const crearPartida = ({ nombre }) => api.post('/', { nombre })

  const unirse = (idOCodigo, { id, nombre, civilizacion }) =>
    api.post(`/${idOCodigo}/unirse`, { id, nombre, civilizacion })

  const iniciar = (id) => api.post(`/${id}/iniciar`)

  const accion = (id, jugadorId, token, { tipo, ...datos }) =>
    api.post(`/${id}/accion`, { jugadorId, tipo, ...datos }, {
      headers: { 'X-Jugador-Token': token }
    })

  const vista = (id, jugadorId, token) =>
    api.get(`/${id}`, {
      params: { jugadorId },
      headers: { 'X-Jugador-Token': token }
    })

  const listarPartidas = () => api.get('/')

  return { crearPartida, unirse, iniciar, accion, vista, listarPartidas }
}
```

- [ ] **Step 2: Lint y commit**

```bash
cd frontend && yarn lint
git add src/composables/useMapApi.js
git commit -m "feat(mapa-frontend): cliente REST del modo mapa"
```

---

### Task 2: `useMapSocket.js` — conexión de socket con sala privada por jugador

**Files:**
- Create: `frontend/src/composables/useMapSocket.js`

**Interfaces:**
- Consumes: `config.socket` de `frontend/src/config/env.js` (`url`, `options` con `transports: ['websocket']`, `autoConnect: false`).
- Produces (la usa Task 6):
  - `useMapSocket()` devuelve `{ conectar(), desconectar(), unirseAPartida(gameId, jugadorId, token) -> Promise<boolean>, onEstado(callback) }`.
  - `conectar()`: crea el socket si no existe y lo conecta; devuelve una promesa que resuelve cuando `connect` dispara.
  - `unirseAPartida(gameId, jugadorId, token)`: emite `map:join` con ack; resuelve `true`/`false` según la respuesta del servidor (ver `backend/src/sockets/mapSocket.js`, que ya implementa el ack).
  - `onEstado(callback)`: registra `callback` sobre el evento `'estado'` (el payload es la vista filtrada del jugador — ver `backend/src/services/MapGameService.js`, método `_accion`, que emite `'estado'` a cada jugador tras cualquier acción).
  - `desconectar()`: cierra el socket.

Este composable es código nuevo (no hay patrón de sockets ya probado en el frontend, ver Global Constraints/spec sección 3). Se apoya en la forma de `useGameSocket.js` (legacy) solo para nomenclatura de connect/disconnect/emit/on, reescrito para el caso concreto de una sala por jugador con ack.

- [ ] **Step 1: Crear el archivo**

```js
// frontend/src/composables/useMapSocket.js
import { ref } from 'vue'
import { io } from 'socket.io-client'
import config from '../config/env.js'

const socket = ref(null)

export function useMapSocket() {
  const conectar = () => {
    return new Promise((resolve, reject) => {
      if (!socket.value) {
        socket.value = io(config.socket.url, config.socket.options)
      }
      if (socket.value.connected) {
        resolve(socket.value)
        return
      }
      socket.value.once('connect', () => resolve(socket.value))
      socket.value.once('connect_error', (error) => reject(error))
      socket.value.connect()
    })
  }

  const desconectar = () => {
    if (socket.value) {
      socket.value.disconnect()
      socket.value = null
    }
  }

  const unirseAPartida = (gameId, jugadorId, token) => {
    return new Promise((resolve) => {
      if (!socket.value || !socket.value.connected) {
        resolve(false)
        return
      }
      socket.value.emit('map:join', gameId, jugadorId, token, resolve)
    })
  }

  const onEstado = (callback) => {
    if (socket.value) socket.value.on('estado', callback)
  }

  return { conectar, desconectar, unirseAPartida, onEstado }
}
```

- [ ] **Step 2: Lint y commit**

```bash
cd frontend && yarn lint
git add src/composables/useMapSocket.js
git commit -m "feat(mapa-frontend): conexion de socket con sala privada por jugador"
```

---

### Task 3: `ModeSelect.vue` y cableado en `App.vue`

**Files:**
- Create: `frontend/src/components/mapa/ModeSelect.vue`
- Modify: `frontend/src/App.vue`

**Interfaces:**
- Produces: `ModeSelect.vue` emite `elegir-modo` con `'narrativo'` o `'mapa'`.
- `App.vue` gana `currentMode` (ref, `null | 'narrativo' | 'mapa'`), inicializado en `null`.

Este task deja la app arrancando en la pantalla de selección y permite volver a entrar al modo narrativo exactamente como antes (sin cambios de comportamiento ahí). El modo mapa, en este task, monta un placeholder (`MapLobby` se crea recién en Task 4); si se elige "mapa" antes de que exista `MapLobby.vue`, el build fallaría — así que el `import` y el `v-else-if` para mapa se agregan en este mismo task apuntando a un archivo que Task 4 crea, y este task NO se da por terminado hasta que Task 4 exista (ver nota al final). Alternativa más simple: no referenciar `MapLobby` todavía. Se resuelve así:

Este task SOLO agrega el selector y dejará `currentMode === 'mapa'` sin montar nada visible aún (una `<div>` de "Cargando modo mapa…" placeholder), y Task 4 reemplaza ese placeholder por el import real. Esto evita que Task 3 dependa de un archivo que no existe todavía.

- [ ] **Step 1: Crear `ModeSelect.vue`**

```vue
<!-- frontend/src/components/mapa/ModeSelect.vue -->
<script setup>
const emit = defineEmits(['elegir-modo'])
</script>

<template>
  <div class="mode-select">
    <h1>Crónicas de Civilización</h1>
    <p class="subtitle">Elegí cómo querés jugar</p>
    <div class="mode-cards">
      <button class="mode-card" @click="emit('elegir-modo', 'narrativo')">
        <h2>📖 Modo narrativo</h2>
        <p>Historia colaborativa guiada por un narrador IA.</p>
      </button>
      <button class="mode-card" @click="emit('elegir-modo', 'mapa')">
        <h2>🗺️ Modo mapa <span class="beta">beta</span></h2>
        <p>Estrategia por turnos sobre un mapa de casillas.</p>
      </button>
    </div>
  </div>
</template>

<style scoped>
.mode-select {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  color: #ecf0f1;
  text-align: center;
  padding: 2rem;
}

.subtitle {
  color: #bdc3c7;
  margin: 0;
}

.mode-cards {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
  justify-content: center;
}

.mode-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 2rem;
  width: 260px;
  color: #ecf0f1;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
}

.mode-card:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: #3498db;
}

.mode-card h2 {
  margin: 0 0 0.5rem 0;
  font-size: 1.2rem;
}

.mode-card p {
  margin: 0;
  color: #bdc3c7;
  font-size: 0.9rem;
}

.beta {
  font-size: 0.6rem;
  background: #e74c3c;
  padding: 2px 6px;
  border-radius: 4px;
  vertical-align: middle;
  margin-left: 4px;
}
</style>
```

- [ ] **Step 2: Modificar `App.vue`**

Agregar el import y el estado `currentMode` cerca de `currentView`:

```js
import ModeSelect from './components/mapa/ModeSelect.vue'
```

```js
const currentMode = ref(null) // null | 'narrativo' | 'mapa'

const elegirModo = (modo) => {
  currentMode.value = modo
}
```

En el `<template>`, envolver el contenido existente: el bloque `StoryLobby`/`StorySession` actual pasa a estar condicionado también a `currentMode === 'narrativo'`, y se agrega el selector y un placeholder para mapa:

```html
<ModeSelect
  v-if="currentMode === null"
  @elegir-modo="elegirModo"
/>

<template v-else-if="currentMode === 'narrativo'">
  <StoryLobby
    v-if="currentView === 'lobby'"
    @session-created="handleSessionCreated"
    @session-joined="handleSessionJoined"
    @error="handleError"
  />
  <StorySession
    v-else-if="currentView === 'session'"
    :session-id="currentSession?.id"
    :current-player-id="currentPlayer?.id"
    @session-ended="handleSessionEnded"
    @error="handleError"
  />
</template>

<div v-else-if="currentMode === 'mapa'" class="loading-placeholder">
  Cargando modo mapa…
</div>
```

No cambiar `loadSavedSession`, `saveSession`, `clearSavedSession`, ni los handlers existentes — siguen operando solo sobre el modo narrativo. `onMounted` sigue llamando `loadSavedSession()`, pero ahora esa función, si encuentra una sesión narrativa guardada, además debe fijar `currentMode.value = 'narrativo'` antes de `currentView.value = 'session'` (si no, la app se queda en el selector con `currentView` ya en `'session'` pero sin nada montado). Ubicar la línea `currentView.value = 'session'` dentro de `loadSavedSession` y agregar `currentMode.value = 'narrativo'` inmediatamente antes.

- [ ] **Step 3: Verificar manualmente**

Arrancar el frontend y el backend (`cd backend && yarn dev`, `cd frontend && yarn dev`), abrir en el navegador. Confirmar: aparece el selector de modo; "Modo narrativo" lleva al lobby narrativo de siempre (sin regresiones); "Modo mapa" muestra el placeholder "Cargando modo mapa…"; recargar la página después de haber creado/unido una sesión narrativa restaura esa sesión directamente (sin pasar por el selector).

- [ ] **Step 4: Lint y commit**

```bash
cd frontend && yarn lint
git add src/components/mapa/ModeSelect.vue src/App.vue
git commit -m "feat(mapa-frontend): selector de modo en la pantalla inicial"
```

---

### Task 4: `MapLobby.vue` — crear, unirse, listar

**Files:**
- Create: `frontend/src/components/mapa/MapLobby.vue`
- Modify: `frontend/src/App.vue`

**Interfaces:**
- Consumes: `useMapApi()` (Task 1).
- Produces: `MapLobby.vue` emite `partida-unida` con `{ id, codigo, jugadorId, token, vista }` cuando el jugador ya está adentro de una partida (recién creada+unida, o unida por código).

- [ ] **Step 1: Crear `MapLobby.vue`**

```vue
<!-- frontend/src/components/mapa/MapLobby.vue -->
<script setup>
import { ref, onMounted } from 'vue'
import { useMapApi } from '../../composables/useMapApi.js'

const emit = defineEmits(['partida-unida'])

const { crearPartida, unirse, listarPartidas } = useMapApi()

const nombrePartida = ref('')
const nombreJugador = ref('')
const codigoUnirse = ref('')
const partidasActivas = ref([])
const cargando = ref(false)
const error = ref('')

const cargarPartidas = async () => {
  try {
    partidasActivas.value = (await listarPartidas()).filter(p => p.estado === 'esperando')
  } catch {
    // lista opcional; si falla, se muestra vacia sin bloquear el lobby
    partidasActivas.value = []
  }
}

const unirseYEmitir = async (idOCodigo) => {
  const jugadorId = crypto.randomUUID()
  const { vista, token } = await unirse(idOCodigo, {
    id: jugadorId,
    nombre: nombreJugador.value,
    civilizacion: nombreJugador.value
  })
  emit('partida-unida', { id: vista.id, codigo: vista.codigo ?? idOCodigo, jugadorId, token, vista })
}

const crear = async () => {
  if (!nombrePartida.value || !nombreJugador.value) {
    error.value = 'Completá el nombre de la partida y tu nombre.'
    return
  }
  error.value = ''
  cargando.value = true
  try {
    const { id } = await crearPartida({ nombre: nombrePartida.value })
    await unirseYEmitir(id)
  } catch (err) {
    error.value = err.mensaje || 'No se pudo crear la partida.'
  } finally {
    cargando.value = false
  }
}

const unirseConCodigo = async (codigo) => {
  if (!nombreJugador.value) {
    error.value = 'Ingresá tu nombre antes de unirte.'
    return
  }
  error.value = ''
  cargando.value = true
  try {
    await unirseYEmitir(codigo)
  } catch (err) {
    error.value = err.mensaje || 'No se pudo unir a la partida.'
  } finally {
    cargando.value = false
  }
}

onMounted(cargarPartidas)
</script>

<template>
  <div class="map-lobby">
    <h1>🗺️ Modo mapa</h1>

    <div v-if="error" class="lobby-error">{{ error }}</div>

    <label class="field">
      Tu nombre / civilización
      <input v-model="nombreJugador" type="text" placeholder="Incas" />
    </label>

    <section class="panel">
      <h2>Crear partida nueva</h2>
      <label class="field">
        Nombre de la partida
        <input v-model="nombrePartida" type="text" placeholder="Mi partida" />
      </label>
      <button class="btn-primary" :disabled="cargando" @click="crear">Crear</button>
    </section>

    <section class="panel">
      <h2>Unirse con código</h2>
      <label class="field">
        Código
        <input v-model="codigoUnirse" type="text" maxlength="6" placeholder="ABC123" />
      </label>
      <button class="btn-primary" :disabled="cargando || !codigoUnirse" @click="unirseConCodigo(codigoUnirse)">
        Unirse
      </button>
    </section>

    <section class="panel" v-if="partidasActivas.length > 0">
      <h2>Partidas esperando jugadores</h2>
      <ul class="partidas-lista">
        <li v-for="p in partidasActivas" :key="p.id">
          <span>{{ p.nombre }} ({{ p.codigo }})</span>
          <button class="btn-secondary" :disabled="cargando" @click="unirseConCodigo(p.codigo)">Unirse</button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.map-lobby {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
  padding: 2rem;
  color: #ecf0f1;
}

.panel {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 1.25rem;
  width: 100%;
  max-width: 420px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.75rem;
  font-size: 0.9rem;
}

.field input {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  padding: 0.5rem;
  color: #ecf0f1;
}

.btn-primary {
  background: linear-gradient(45deg, #27ae60, #2ecc71);
  color: white;
  border: none;
  border-radius: 6px;
  padding: 0.6rem 1rem;
  cursor: pointer;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: #ecf0f1;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  padding: 0.4rem 0.8rem;
  cursor: pointer;
}

.partidas-lista {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.partidas-lista li {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.lobby-error {
  background: rgba(231, 76, 60, 0.15);
  color: #e74c3c;
  border-radius: 6px;
  padding: 0.6rem 1rem;
  max-width: 420px;
}
</style>
```

Nota: `vista.codigo` no existe en la vista filtrada (`vistaJugador` no expone `codigo`, ver `backend/src/domain/mapa/reglas/visibilidad.js`), por eso el fallback `?? idOCodigo` — si el jugador entró por código, ese es el código real; si entró por id (recién creada en este mismo flujo), el `idOCodigo` pasado a `unirseYEmitir` fue el `id` devuelto por `crearPartida`, no un código real. Esto es un dato menor (el código solo hace falta para que un tercero se una); `MapSession` (Task 6) no depende de tenerlo para funcionar, así que no bloquea este task.

- [ ] **Step 2: Reemplazar el placeholder de `App.vue` por el lobby real**

En `App.vue`, agregar el import:

```js
import MapLobby from './components/mapa/MapLobby.vue'
```

Agregar estado para lo que devuelve `partida-unida`:

```js
const mapaPartida = ref(null) // { id, codigo, jugadorId, token, vista } | null

const handlePartidaUnida = (datos) => {
  mapaPartida.value = datos
}
```

Reemplazar el placeholder `<div v-else-if="currentMode === 'mapa'" ...>` por:

```html
<template v-else-if="currentMode === 'mapa'">
  <MapLobby
    v-if="!mapaPartida"
    @partida-unida="handlePartidaUnida"
  />
  <div v-else class="loading-placeholder">Cargando partida…</div>
</template>
```

(El `<div>` final es intencional: `MapSession`, que reemplaza este placeholder, se crea en Task 6.)

- [ ] **Step 3: Verificar manualmente**

Con backend y frontend corriendo, entrar a "Modo mapa", crear una partida con nombre propio y de partida, confirmar que no tira error y pasa al placeholder "Cargando partida…". Abrir la consola del navegador y confirmar (via Network tab) que `POST /api/map` y `POST /api/map/:id/unirse` devolvieron 200/201 y que `unirse` devolvió un `token` de 64 caracteres hex.

- [ ] **Step 4: Lint y commit**

```bash
cd frontend && yarn lint
git add src/components/mapa/MapLobby.vue src/App.vue
git commit -m "feat(mapa-frontend): lobby para crear/unirse/listar partidas"
```

---

### Task 5: `MapGrid.vue` y `MapTile.vue` — la grilla del mapa

**Files:**
- Create: `frontend/src/components/mapa/MapGrid.vue`
- Create: `frontend/src/components/mapa/MapTile.vue`

**Interfaces:**
- `MapTile.vue` props: `tile` (objeto `{x, y, descubierto, terreno?, recurso?, dueno?, ciudad?, ejercito?}`), `esPropio` (boolean, `tile.dueno === jugadorId`). Emite `click-tile` con `{x, y}`.
- `MapGrid.vue` props: `mapa` (array plano de tiles), `tamanoMapa` (número), `jugadorId` (string). Emite `click-tile` con `{x, y}` (re-emitido desde `MapTile`).

Sin backend corriendo todavía en este task (es un componente puro de presentación); la verificación es visual, montando con datos de prueba armados a mano en Step 3.

- [ ] **Step 1: Crear `MapTile.vue`**

```vue
<!-- frontend/src/components/mapa/MapTile.vue -->
<script setup>
const props = defineProps({
  tile: { type: Object, required: true },
  esPropio: { type: Boolean, default: false }
})
const emit = defineEmits(['click-tile'])

const COLOR_TERRENO = {
  plains: '#c9a86c',
  forest: '#2d5a3d',
  mountains: '#6b6b6b',
  desert: '#d9c07a',
  water: '#3a6ea5',
  hills: '#8a7a4b'
}

const colorTile = () => {
  if (!props.tile.descubierto) return '#1a1a1a'
  return COLOR_TERRENO[props.tile.terreno] || '#333'
}

const clasesTile = () => {
  if (!props.tile.descubierto) return 'tile tile-oculto'
  const clases = ['tile']
  if (props.tile.dueno && props.esPropio) clases.push('tile-propio')
  else if (props.tile.dueno) clases.push('tile-ajeno')
  return clases.join(' ')
}

const onClick = () => {
  if (!props.tile.descubierto) return
  emit('click-tile', { x: props.tile.x, y: props.tile.y })
}
</script>

<template>
  <div
    :class="clasesTile()"
    :style="{ backgroundColor: colorTile() }"
    :title="tile.descubierto ? `${tile.terreno}${tile.ciudad ? ' - ' + tile.ciudad.nombre : ''}` : ''"
    @click="onClick"
  >
    <span v-if="tile.descubierto && tile.ciudad" class="tile-icon">🏛️</span>
    <span v-else-if="tile.descubierto && tile.ejercito" class="tile-icon">⚔️</span>
  </div>
</template>

<style scoped>
.tile {
  aspect-ratio: 1;
  min-width: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
  box-sizing: border-box;
}

.tile-oculto {
  cursor: default;
}

.tile-propio {
  cursor: pointer;
  outline: 2px solid #2ecc71;
  outline-offset: -2px;
}

.tile-ajeno {
  outline: 2px solid #e74c3c;
  outline-offset: -2px;
}

.tile-icon {
  font-size: 0.8em;
  pointer-events: none;
}
</style>
```

- [ ] **Step 2: Crear `MapGrid.vue`**

```vue
<!-- frontend/src/components/mapa/MapGrid.vue -->
<script setup>
import MapTile from './MapTile.vue'

const props = defineProps({
  mapa: { type: Array, required: true },
  tamanoMapa: { type: Number, required: true },
  jugadorId: { type: String, required: true }
})
const emit = defineEmits(['click-tile'])
</script>

<template>
  <div
    class="map-grid"
    :style="{ gridTemplateColumns: `repeat(${tamanoMapa}, minmax(24px, 1fr))` }"
  >
    <MapTile
      v-for="tile in mapa"
      :key="`${tile.x}-${tile.y}`"
      :tile="tile"
      :es-propio="tile.dueno === jugadorId"
      @click-tile="emit('click-tile', $event)"
    />
  </div>
</template>

<style scoped>
.map-grid {
  display: grid;
  gap: 1px;
  background: #000;
  border: 1px solid rgba(255, 255, 255, 0.15);
  max-height: 70vh;
  max-width: 100%;
  overflow: auto;
}
</style>
```

- [ ] **Step 3: Verificar manualmente con datos de prueba**

Montar `MapGrid` temporalmente en cualquier vista existente (o crear un archivo de scratch en `frontend/src/dev-scratch.vue` que se borra al final del step) con un `mapa` de prueba: un array de 9 tiles (grid 3x3) mezclando `descubierto: true/false`, distintos `terreno`, uno con `dueno: 'jugador-de-prueba'` igual al `jugadorId` pasado (para ver el borde verde) y otro con un `dueno` distinto (borde rojo), uno con `ciudad: { nombre: 'Test' }`. Confirmar visualmente: los tiles no descubiertos son negros sin contenido; los descubiertos muestran color de terreno; el borde verde/rojo aparece donde corresponde; el ícono de ciudad aparece donde corresponde; el evento `click-tile` se dispara (loguear en consola) solo al clickear tiles descubiertos. Borrar el archivo de scratch antes de commitear si se creó uno.

- [ ] **Step 4: Lint y commit**

```bash
cd frontend && yarn lint
git add src/components/mapa/MapGrid.vue src/components/mapa/MapTile.vue
git commit -m "feat(mapa-frontend): grilla CSS del mapa con niebla de guerra"
```

---

### Task 6: `MapPlayerPanel.vue` y `MapActionBar.vue`

**Files:**
- Create: `frontend/src/components/mapa/MapPlayerPanel.vue`
- Create: `frontend/src/components/mapa/MapActionBar.vue`

**Interfaces:**
- `MapPlayerPanel.vue` props: `vista` (la vista completa), `jugadorId`. Sin emits; solo muestra `vista.jugadores`, marca cuál es `vista.jugadores[vista.indiceJugadorActual]`, y `vista.jugadores.find(j => j.id === jugadorId).recursos`.
- `MapActionBar.vue` props: `vista`, `jugadorId`. Emite `fundar-ciudad` con `{x, y, nombre}` (pero en este task NO dispara el flujo completo todavía — eso lo arma `MapSession` en Task 7 escuchando el evento `click-tile` de `MapGrid`; `MapActionBar` en este task solo expone el botón "Terminar turno" con su habilitación condicional, y placeholders para los otros dos botones que Task 7 cablea).
- `MapActionBar.vue` emite `terminar-turno` (sin payload) y `construir` con `{x, y, edificio}` — este último lo dispara `MapSession` (Task 7) llamando a un método expuesto, no un click directo en este componente (ver Task 7 para el flujo completo de construir).

Para mantener este task autocontenido y verificable, `MapActionBar.vue` expone solo lo que puede probarse sin el resto de la orquestación: el estado de turno y el botón de terminar turno. El resto del cableado de acciones queda en Task 7, que es quien conecta clicks del grid con estos componentes.

- [ ] **Step 1: Crear `MapPlayerPanel.vue`**

```vue
<!-- frontend/src/components/mapa/MapPlayerPanel.vue -->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  vista: { type: Object, required: true },
  jugadorId: { type: String, required: true }
})

const jugadorActual = computed(() => props.vista.jugadores[props.vista.indiceJugadorActual])
const yo = computed(() => props.vista.jugadores.find(j => j.id === props.jugadorId))

const RECURSOS_ICONOS = {
  food: '🌾', gold: '💰', wood: '🪵', stone: '🪨', science: '🔬', culture: '🎭'
}
</script>

<template>
  <div class="player-panel">
    <div class="turno-actual">
      Turno {{ vista.turno }} — <strong>{{ jugadorActual?.nombre }}</strong>
      <span v-if="jugadorActual?.id === jugadorId" class="tu-turno">(tu turno)</span>
    </div>

    <div v-if="yo?.recursos" class="recursos">
      <span v-for="(cantidad, recurso) in yo.recursos" :key="recurso" class="recurso">
        {{ RECURSOS_ICONOS[recurso] || recurso }} {{ cantidad }}
      </span>
    </div>

    <ul class="jugadores-lista">
      <li v-for="j in vista.jugadores" :key="j.id" :class="{ activo: j.id === jugadorActual?.id }">
        {{ j.nombre }} ({{ j.civilizacion }}) <span v-if="!j.activo">— eliminado</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.player-panel {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 1rem;
  color: #ecf0f1;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.tu-turno {
  color: #2ecc71;
}

.recursos {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  font-size: 0.9rem;
}

.jugadores-lista {
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: 0.85rem;
  color: #bdc3c7;
}

.jugadores-lista .activo {
  color: #3498db;
  font-weight: bold;
}
</style>
```

- [ ] **Step 2: Crear `MapActionBar.vue`**

```vue
<!-- frontend/src/components/mapa/MapActionBar.vue -->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  vista: { type: Object, required: true },
  jugadorId: { type: String, required: true }
})
const emit = defineEmits(['terminar-turno'])

const esMiTurno = computed(() =>
  props.vista.jugadores[props.vista.indiceJugadorActual]?.id === props.jugadorId
)
</script>

<template>
  <div class="action-bar">
    <button class="btn-primary" :disabled="!esMiTurno" @click="emit('terminar-turno')">
      {{ esMiTurno ? 'Terminar turno' : 'No es tu turno' }}
    </button>
  </div>
</template>

<style scoped>
.action-bar {
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem;
}

.btn-primary {
  background: linear-gradient(45deg, #27ae60, #2ecc71);
  color: white;
  border: none;
  border-radius: 6px;
  padding: 0.6rem 1.2rem;
  cursor: pointer;
  font-weight: bold;
}

.btn-primary:disabled {
  background: rgba(255, 255, 255, 0.1);
  color: #bdc3c7;
  cursor: not-allowed;
}
</style>
```

- [ ] **Step 3: Verificar manualmente con datos de prueba**

Igual que Task 5: montar temporalmente con una `vista` de prueba armada a mano (2 jugadores, `indiceJugadorActual: 0`, `recursos` con las 6 claves). Confirmar: `MapPlayerPanel` muestra el turno, marca al jugador activo, muestra los recursos propios con íconos. `MapActionBar` muestra "Terminar turno" habilitado cuando `jugadorId` coincide con el jugador activo, y "No es tu turno" deshabilitado en caso contrario; el click emite el evento (loguear en consola).

- [ ] **Step 4: Lint y commit**

```bash
cd frontend && yarn lint
git add src/components/mapa/MapPlayerPanel.vue src/components/mapa/MapActionBar.vue
git commit -m "feat(mapa-frontend): panel de jugadores y barra de acciones"
```

---

### Task 7: `MapSession.vue` — orquestación completa y cableado final

**Files:**
- Create: `frontend/src/components/mapa/MapSession.vue`
- Modify: `frontend/src/App.vue`

**Interfaces:**
- Consumes: `useMapApi()` (Task 1), `useMapSocket()` (Task 2), `MapGrid` (Task 5), `MapPlayerPanel`/`MapActionBar` (Task 6).
- Props: `partidaInicial` (objeto `{ id, codigo, jugadorId, token, vista }`, lo que emitió `MapLobby`).
- Emite `salir` (sin payload) cuando la partida ya no es válida (token/partida inválidos) o el jugador decide volver al lobby.

Este es el task que junta todo. Cablea:
1. Al montar: si `partidaInicial` trae `vista`, la usa directo; conecta el socket y hace `map:join`.
2. `onEstado` del socket reemplaza `vista` completa cada vez que llega el evento.
3. Click en `MapActionBar` → `terminar-turno` → `accion(..., { tipo: 'terminarTurno' })`.
4. Click en un tile propio sin ciudad (desde `MapGrid`) → `prompt()` de nombre → `accion(..., { tipo: 'fundarCiudad', x, y, nombre })`.
5. Click en un tile con ciudad propia → menú de 4 botones de edificio → `accion(..., { tipo: 'construir', x, y, edificio })`.
6. Persistencia en `localStorage` de `{id, codigo, jugadorId, token}` al montar, y limpieza si la partida deja de ser válida.
7. Cableado final en `App.vue`: reemplaza el placeholder de Task 4.

- [ ] **Step 1: Crear `MapSession.vue`**

```vue
<!-- frontend/src/components/mapa/MapSession.vue -->
<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useMapApi } from '../../composables/useMapApi.js'
import { useMapSocket } from '../../composables/useMapSocket.js'
import MapGrid from './MapGrid.vue'
import MapPlayerPanel from './MapPlayerPanel.vue'
import MapActionBar from './MapActionBar.vue'

const props = defineProps({
  partidaInicial: { type: Object, required: true }
})
const emit = defineEmits(['salir', 'error'])

const { accion, vista: pedirVista } = useMapApi()
const { conectar, desconectar, unirseAPartida, onEstado } = useMapSocket()

const id = props.partidaInicial.id
const jugadorId = props.partidaInicial.jugadorId
const token = props.partidaInicial.token
const vista = ref(props.partidaInicial.vista)

const edificioMenuAbierto = ref(null) // {x, y} | null

const EDIFICIOS = [
  { tipo: 'granary', nombre: 'Granero' },
  { tipo: 'market', nombre: 'Mercado' },
  { tipo: 'library', nombre: 'Biblioteca' },
  { tipo: 'barracks', nombre: 'Cuartel' }
]

const guardarSesion = () => {
  localStorage.setItem('cronicas-mapa-id', id)
  localStorage.setItem('cronicas-mapa-codigo', props.partidaInicial.codigo)
  localStorage.setItem('cronicas-mapa-jugadorId', jugadorId)
  localStorage.setItem('cronicas-mapa-token', token)
}

const limpiarSesion = () => {
  localStorage.removeItem('cronicas-mapa-id')
  localStorage.removeItem('cronicas-mapa-codigo')
  localStorage.removeItem('cronicas-mapa-jugadorId')
  localStorage.removeItem('cronicas-mapa-token')
}

const ejecutarAccion = async (datosAccion) => {
  try {
    const resultado = await accion(id, jugadorId, token, datosAccion)
    vista.value = resultado.vista
  } catch (err) {
    emit('error', err.mensaje || 'No se pudo ejecutar la acción.')
  }
}

const onTerminarTurno = () => ejecutarAccion({ tipo: 'terminarTurno' })

const onClickTile = (posicion) => {
  const tile = vista.value.mapa[posicion.y * vista.value.config.tamanoMapa + posicion.x]
  if (!tile) return

  if (tile.ciudad && tile.dueno === jugadorId) {
    edificioMenuAbierto.value = posicion
    return
  }

  if (!tile.ciudad && (tile.dueno === jugadorId || tile.dueno === null)) {
    const nombre = window.prompt('Nombre de la ciudad:')
    if (!nombre) return
    ejecutarAccion({ tipo: 'fundarCiudad', x: posicion.x, y: posicion.y, nombre })
  }
}

const construir = (edificio) => {
  if (!edificioMenuAbierto.value) return
  const { x, y } = edificioMenuAbierto.value
  edificioMenuAbierto.value = null
  ejecutarAccion({ tipo: 'construir', x, y, edificio })
}

const cerrarMenuEdificio = () => {
  edificioMenuAbierto.value = null
}

onMounted(async () => {
  guardarSesion()
  try {
    await conectar()
    await unirseAPartida(id, jugadorId, token)
    onEstado((payload) => {
      vista.value = payload
    })
  } catch {
    // El socket es solo para actualizaciones en vivo; si falla la conexion,
    // la partida sigue jugable por REST (ver spec seccion 6).
  }
})

onUnmounted(() => {
  desconectar()
})
</script>

<template>
  <div class="map-session">
    <MapPlayerPanel :vista="vista" :jugador-id="jugadorId" />

    <MapGrid
      :mapa="vista.mapa"
      :tamano-mapa="vista.config.tamanoMapa"
      :jugador-id="jugadorId"
      @click-tile="onClickTile"
    />

    <MapActionBar :vista="vista" :jugador-id="jugadorId" @terminar-turno="onTerminarTurno" />

    <div v-if="edificioMenuAbierto" class="edificio-menu-overlay" @click.self="cerrarMenuEdificio">
      <div class="edificio-menu">
        <h3>Construir</h3>
        <button
          v-for="ed in EDIFICIOS"
          :key="ed.tipo"
          class="btn-secondary"
          @click="construir(ed.tipo)"
        >
          {{ ed.nombre }}
        </button>
        <button class="btn-secondary" @click="cerrarMenuEdificio">Cancelar</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.map-session {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  color: #ecf0f1;
}

.edificio-menu-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.edificio-menu {
  background: #2c3e50;
  border-radius: 12px;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 220px;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: #ecf0f1;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  padding: 0.5rem 0.8rem;
  cursor: pointer;
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.2);
}
</style>
```

- [ ] **Step 2: Cablear en `App.vue`**

Reemplazar el `<div v-else class="loading-placeholder">Cargando partida…</div>` de Task 4 por:

```html
<MapSession
  v-else
  :partida-inicial="mapaPartida"
  @error="handleError"
  @salir="mapaPartida = null"
/>
```

Agregar el import:

```js
import MapSession from './components/mapa/MapSession.vue'
```

- [ ] **Step 3: Verificar manualmente el flujo completo con dos jugadores**

Con backend y frontend corriendo, abrir DOS pestañas del navegador (o una normal y una privada, para no compartir `localStorage`). En la pestaña 1: modo mapa → crear partida → confirma que se ve el tablero con la niebla (la mayoría de tiles negros, un área alrededor de la capital propia visible). En la pestaña 2: modo mapa → unirse con el código mostrado en la pestaña 1 (agregar temporalmente un `console.log(props.partidaInicial.codigo)` en `MapSession` si no es visible en la UI, y quitarlo antes de commitear) → confirma que entra a la misma partida. Desde la pestaña 1 (dueña de la partida, que además debe iniciarla — llamar `POST /api/map/:id/iniciar` manualmente desde la consola del navegador con `fetch` si `MapLobby` no expone un botón de iniciar todavía; si falta, agregarlo a `MapLobby.vue` en este mismo step: un botón "Iniciar partida" visible solo cuando el jugador ya está en una partida en estado `esperando`, ver nota abajo). Una vez iniciada: fundar una ciudad en la pestaña del jugador activo, confirmar que la pestaña 2 actualiza su vista SIN recargar (llega el evento de socket). Terminar turno, confirmar que pasa al otro jugador en ambas pestañas. Construir un edificio, confirmar el descuento de recursos reflejado tras la acción.

Nota sobre iniciar: si en la verificación de Task 4 no se agregó manera de iniciar la partida desde la UI, agregarlo ahora en `MapLobby.vue`: tras `unirseYEmitir` en el flujo de "crear", en vez de emitir `partida-unida` inmediatamente, mostrar un botón "Iniciar partida" (solo lo ve quien creó, ya que es el único ahí en ese momento) que llama a `iniciar(id)` de `useMapApi` y RECIÉN AHÍ emite `partida-unida` con la vista que devuelve `iniciar`. Para el jugador que se une después por código, `unirseYEmitir` emite `partida-unida` directo (no inicia nada). Esto requiere que el creador espere a que se unan los demás antes de tocar "Iniciar" — coordinarlo a mano entre las dos pestañas de prueba.

- [ ] **Step 4: Lint y commit**

```bash
cd frontend && yarn lint
git add src/components/mapa/MapSession.vue src/components/mapa/MapLobby.vue src/App.vue
git commit -m "feat(mapa-frontend): orquestacion de la partida, acciones y actualizacion en vivo"
```

---

## Self-Review (hecho al escribir este plan)

- **Cobertura del spec:** arquitectura de archivos (Task 1-7, mismos nombres que la spec sección 1), contrato de API (Task 1, valores copiados de `mapRoutes.js`), alcance del lobby (Task 4 y nota de Task 7 sobre "iniciar"), estado/flujo de datos incluida persistencia en localStorage (Task 7), grilla (Task 5), acciones y flujos de fundar/construir (Task 6-7), manejo de errores con el `error-toast` existente (Task 7, evento `error` reusa el handler de `App.vue`), sockets (Task 2 y 7). Fuera de alcance respetado: no se tocó código legacy, no se agregaron tests automatizados, no se implementó mover/atacar/reclutar.
- **Placeholders:** ninguno; cada step trae código completo. La única ambigüedad operativa que quedó (cómo iniciar la partida desde la UI) se resolvió explícitamente como nota accionable en Task 7 Step 3, no como un "TODO".
- **Consistencia de tipos:** `{ id, codigo, jugadorId, token, vista }` como forma de `partida-unida` es la misma en Task 4 (quien la emite) y Task 7 (prop `partidaInicial`, que la consume). `useMapApi().accion(id, jugadorId, token, {tipo, ...datos})` tiene la misma firma en Task 1 (definición) y Task 7 (uso). Los nombres de evento (`click-tile`, `terminar-turno`, `partida-unida`, `elegir-modo`) son consistentes entre quien emite y quien escucha en cada par de tasks.
