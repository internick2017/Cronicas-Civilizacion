<!-- frontend/src/components/mapa/MapLobby.vue -->
<script setup>
import { ref, onMounted } from 'vue'
import { useMapApi } from '../../composables/useMapApi.js'

const emit = defineEmits(['partida-unida'])

const { crearPartida, unirse, iniciar, listarPartidas } = useMapApi()

const nombrePartida = ref('')
const nombreJugador = ref('')
const codigoUnirse = ref('')
const partidasActivas = ref([])
const cargando = ref(false)
const error = ref('')

// Cuando el jugador CREA una partida no entra directo: queda en esta sala de espera
// con el codigo a la vista, porque hasta que alguien llame a `iniciar` el mapa esta
// 100% cubierto por la niebla y no habria nada que mirar.
const salaDeEspera = ref(null) // { id, codigo, jugadorId, token, vista } | null

const cargarPartidas = async () => {
  try {
    partidasActivas.value = (await listarPartidas()).filter(p => p.estado === 'esperando')
  } catch {
    // lista opcional; si falla, se muestra vacia sin bloquear el lobby
    partidasActivas.value = []
  }
}

// `crypto.randomUUID` SOLO existe en contexto seguro (HTTPS o localhost). Al abrir el
// juego por HTTP desde la IP de la red (tablets, celulares) es `undefined` y reventaba
// antes de llamar a `unirse`, con el mensaje enganosos "No se pudo crear la partida".
// El respaldo no necesita ser criptografico: es un id de jugador, no un secreto.
const nuevoId = () =>
  window.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`

const unirseAPartida = async (idOCodigo, codigoConocido = null) => {
  const jugadorId = nuevoId()
  const { vista, token } = await unirse(idOCodigo, {
    id: jugadorId,
    nombre: nombreJugador.value,
    civilizacion: nombreJugador.value
  })
  return { id: vista.id, codigo: codigoConocido ?? idOCodigo, jugadorId, token, vista }
}

const crear = async () => {
  if (!nombrePartida.value || !nombreJugador.value) {
    error.value = 'Completá el nombre de la partida y tu nombre.'
    return
  }
  error.value = ''
  cargando.value = true
  try {
    const { id, codigo } = await crearPartida({ nombre: nombrePartida.value })
    salaDeEspera.value = await unirseAPartida(id, codigo)
    await cargarPartidas()
  } catch (err) {
    error.value = err.mensaje || 'No se pudo crear la partida.'
  } finally {
    cargando.value = false
  }
}

// Jugar contra la maquina no necesita sala de espera: el bot se agrega solo
// al unirse (ver MapGameService#_unirse), asi que apenas el humano entra ya
// hay 2 jugadores y se puede arrancar directo, sin un codigo que mostrarle a
// nadie ni un boton "iniciar" esperando a alguien que nunca va a llegar.
const jugarContraIA = async () => {
  if (!nombreJugador.value) {
    error.value = 'Ingresá tu nombre antes de jugar.'
    return
  }
  error.value = ''
  cargando.value = true
  try {
    const { id, codigo } = await crearPartida({
      nombre: nombrePartida.value || 'Partida en solitario',
      contraIA: true
    })
    const sesion = await unirseAPartida(id, codigo)
    await iniciar(id)
    emit('partida-unida', sesion)
  } catch (err) {
    error.value = err.mensaje || 'No se pudo iniciar la partida contra la máquina.'
  } finally {
    cargando.value = false
  }
}

const iniciarPartida = async () => {
  error.value = ''
  cargando.value = true
  try {
    await iniciar(salaDeEspera.value.id)
    emit('partida-unida', salaDeEspera.value)
  } catch (err) {
    error.value = err.mensaje || 'No se pudo iniciar la partida.'
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
    emit('partida-unida', await unirseAPartida(codigo, codigo))
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

    <!-- Sala de espera: ya creo la partida, espera a los demas antes de iniciar -->
    <section v-if="salaDeEspera" class="panel">
      <h2>Partida creada</h2>
      <p class="ayuda">Pasales este código para que se unan:</p>
      <p class="codigo">{{ salaDeEspera.codigo }}</p>
      <p class="ayuda">
        Cuando estén todos adentro, iniciá la partida. El mapa recién se descubre al iniciar.
      </p>
      <button class="btn-primary" :disabled="cargando" @click="iniciarPartida">
        Iniciar partida
      </button>
    </section>

    <template v-else>
      <label class="field">
        Tu nombre / civilización
        <input v-model="nombreJugador" type="text" placeholder="Incas" />
      </label>

      <section class="panel panel-ia">
        <h2>🤖 Jugar solo</h2>
        <p class="ayuda">Sin esperar a nadie: la máquina controla al rival.</p>
        <button class="btn-primary" :disabled="cargando" @click="jugarContraIA">
          Jugar contra la máquina
        </button>
      </section>

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
        <button
          class="btn-primary"
          :disabled="cargando || !codigoUnirse"
          @click="unirseConCodigo(codigoUnirse)"
        >
          Unirse
        </button>
      </section>

      <section v-if="partidasActivas.length > 0" class="panel">
        <h2>Partidas esperando jugadores</h2>
        <ul class="partidas-lista">
          <li v-for="p in partidasActivas" :key="p.id">
            <span>{{ p.nombre }} ({{ p.codigo }})</span>
            <button class="btn-secondary" :disabled="cargando" @click="unirseConCodigo(p.codigo)">
              Unirse
            </button>
          </li>
        </ul>
      </section>
    </template>
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

.codigo {
  font-size: 2rem;
  font-weight: bold;
  letter-spacing: 0.3rem;
  color: #3498db;
  margin: 0.5rem 0;
  text-align: center;
}

.ayuda {
  color: #bdc3c7;
  font-size: 0.85rem;
  margin: 0.25rem 0;
}

/* Se separa visualmente del resto: es el camino mas rapido (un solo click,
   sin nombre de partida ni codigo que compartir), asi que conviene que se
   note distinto en vez de mezclarse con "crear" y "unirse". */
.panel-ia {
  border-color: rgba(46, 204, 113, 0.35);
  background: rgba(46, 204, 113, 0.08);
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
