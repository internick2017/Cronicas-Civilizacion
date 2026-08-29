<!-- frontend/src/components/mapa/MapLobby.vue -->
<script setup>
import { ref, onMounted } from 'vue'
import { useMapApi } from '../../composables/useMapApi.js'

const emit = defineEmits(['partida-unida'])

const { crearPartida, unirse, iniciar, listarPartidas, obtenerConstantes } = useMapApi()

const nombrePartida = ref('')

// Parametros de la partida, elegidos al crearla. Los valores por defecto son los
// historicos (60% de la tierra, mapa de 20, sin limite), asi que quien no toca
// nada juega exactamente lo de siempre.
const OBJETIVOS = [
  { valor: 50, etiqueta: '50% — partida corta' },
  { valor: 60, etiqueta: '60% — equilibrada' },
  { valor: 75, etiqueta: '75% — larga' },
]
const TAMANOS = [
  { valor: 14, etiqueta: 'Chico (14×14)' },
  { valor: 20, etiqueta: 'Mediano (20×20)' },
  { valor: 28, etiqueta: 'Grande (28×28)' },
]
const DURACIONES = [
  { valor: null, etiqueta: 'Sin límite' },
  { valor: 40, etiqueta: '40 rondas' },
  { valor: 60, etiqueta: '60 rondas' },
  { valor: 100, etiqueta: '100 rondas' },
]
const porcentajeVictoria = ref(60)
const tamanoMapa = ref(20)
const limiteRondas = ref(null)
// Apagado por defecto: un mapa de islas es otro juego (mitad del mundo es mar y
// hay que cruzarlo en transporte), asi que se elige, no se hereda.
const islas = ref(false)

const configElegida = () => ({
  porcentajeVictoria: porcentajeVictoria.value,
  tamanoMapa: tamanoMapa.value,
  limiteRondas: limiteRondas.value,
  islas: islas.value,
})
const nombreJugador = ref('')
const codigoUnirse = ref('')
const partidasActivas = ref([])
const cargando = ref(false)
const error = ref('')

// Se leen del backend (no se hardcodean acá) para no duplicar ni las
// dificultades disponibles ni sus descripciones: si el balance cambia, esta
// pantalla no queda desactualizada. dificultadIA arranca en null y se fija
// al default recien cuando llega la respuesta.
const dificultadesIA = ref([])
const dificultadIA = ref(null)

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
    const { id, codigo } = await crearPartida({
      nombre: nombrePartida.value,
      config: configElegida(),
    })
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
      contraIA: true,
      dificultadIA: dificultadIA.value,
      config: configElegida(),
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

const cargarDificultadesIA = async () => {
  try {
    const { dificultadesIA: lista } = await obtenerConstantes()
    dificultadesIA.value = lista || []
    dificultadIA.value = lista?.find(d => d.porDefecto)?.tipo ?? lista?.[0]?.tipo ?? null
  } catch {
    // Sin la lista, el selector no se muestra: crearPartida ya cae al
    // default del backend si dificultadIA llega null/invalido.
    dificultadesIA.value = []
  }
}

onMounted(() => {
  cargarPartidas()
  cargarDificultadesIA()
})
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

        <div v-if="dificultadesIA.length" class="dificultad-lista" role="radiogroup" aria-label="Dificultad">
          <label
            v-for="d in dificultadesIA"
            :key="d.tipo"
            class="dificultad-opcion"
            :class="{ elegida: dificultadIA === d.tipo }"
          >
            <input type="radio" name="dificultadIA" :value="d.tipo" v-model="dificultadIA" />
            <span class="dificultad-nombre">{{ d.nombre }}</span>
            <small>{{ d.descripcion }}</small>
          </label>
        </div>

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
        <label class="field">
          Territorio para ganar
          <select v-model.number="porcentajeVictoria">
            <option v-for="o in OBJETIVOS" :key="o.valor" :value="o.valor">{{ o.etiqueta }}</option>
          </select>
        </label>
        <label class="field">
          Tamaño del mapa
          <select v-model.number="tamanoMapa">
            <option v-for="t in TAMANOS" :key="t.valor" :value="t.valor">{{ t.etiqueta }}</option>
          </select>
        </label>
        <label class="field">
          Duración
          <select v-model="limiteRondas">
            <option v-for="d in DURACIONES" :key="String(d.valor)" :value="d.valor">{{ d.etiqueta }}</option>
          </select>
        </label>
        <p class="ayuda-config">
          Al llegar al límite gana quien controle más territorio.
        </p>
        <label class="field field-check">
          <input v-model="islas" type="checkbox" />
          <span>Mapa de islas</span>
        </label>
        <p class="ayuda-config">
          La mitad del mundo es mar y cada uno empieza en una isla distinta. Para
          tocar al rival hay que construir un puerto y cruzar en transporte. Si la
          semilla no da dos islas grandes, la partida arranca como una normal.
        </p>
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

.field-check { flex-direction: row; align-items: center; gap: 0.5rem; }
.field-check input { width: auto; }
.ayuda-config {
  margin: 0.25rem 0 0.75rem;
  font-size: 0.8rem;
  color: #95a5a6;
}

.dificultad-lista {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin: 0.5rem 0 0.9rem;
}

.dificultad-opcion {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 0.5rem;
  align-items: baseline;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 0.45rem 0.6rem;
  cursor: pointer;
  font-size: 0.85rem;
}

.dificultad-opcion.elegida {
  border-color: rgba(46, 204, 113, 0.6);
  background: rgba(46, 204, 113, 0.12);
}

.dificultad-nombre { font-weight: 600; }
.dificultad-opcion small { grid-column: 2; opacity: 0.7; }

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
