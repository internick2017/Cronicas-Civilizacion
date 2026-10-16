<!-- frontend/src/components/mapa/MapLobby.vue -->
<script setup>
import { ref, reactive, onMounted } from 'vue'
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
  { valor: 10, etiqueta: 'Mini (10×10)' },
  { valor: 14, etiqueta: 'Chico (14×14)' },
  { valor: 20, etiqueta: 'Mediano (20×20)' },
  { valor: 28, etiqueta: 'Grande (28×28)' },
  { valor: 36, etiqueta: 'Enorme (36×36)' },
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
// Las seis casillas de la partida, todas prendidas: quien quiera otro juego apaga
// las que no le interesan. El backend completa con true lo que falte.
const MECANICAS = [
  { clave: 'ciencia', nombre: 'Ciencia', ayuda: 'Tecnologías, biblioteca, universidad y subir de nivel las ciudades.' },
  { clave: 'cultura', nombre: 'Cultura', ayuda: 'Rasgos culturales.' },
  { clave: 'armada', nombre: 'Armada', ayuda: 'Buques de guerra (el transporte sigue).' },
  { clave: 'alianzas', nombre: 'Alianzas', ayuda: 'Aliarse y regalarse recursos.' },
  { clave: 'moneda', nombre: 'Moneda', ayuda: 'Nombre propio de la moneda y acuñar oro.' },
  { clave: 'capital', nombre: 'Capital', ayuda: 'La capital rinde y defiende más, y se puede mudar.' },
]
const mecanicas = reactive(Object.fromEntries(MECANICAS.map((m) => [m.clave, true])))

// Por defecto todos juegan a la vez; "por turnos" queda para quien lo prefiera.
const MODOS_TURNO = [
  { valor: 'simultaneo', etiqueta: 'Todos a la vez' },
  { valor: 'secuencial', etiqueta: 'De a uno' },
]
const modoTurno = ref('simultaneo')

// Cuantas maquinas juegan. Solo: al menos una (si no, no hay rival). En una
// partida con gente: las que quieras sumar, o ninguna. El tope real lo pone el
// backend (ver MapGameService#crearPartida).
const BOTS_SOLO = [1, 2, 3, 4, 5]
const BOTS_CON_GENTE = [0, 1, 2, 3, 4]
const botsSolo = ref(1)
const botsConGente = ref(0)

const configElegida = () => ({
  modoTurno: modoTurno.value,
  porcentajeVictoria: porcentajeVictoria.value,
  tamanoMapa: tamanoMapa.value,
  limiteRondas: limiteRondas.value,
  islas: islas.value,
  mecanicas: { ...mecanicas },
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

// Razas: tambien salen del backend, con sus bonos, para no duplicar numeros que
// cambian con el balance. Se elige al unirse (crear, jugar solo o unirse con codigo).
const razas = ref([])
const raza = ref(null)

const NOMBRE_RECURSO = {
  food: 'comida', gold: 'oro', wood: 'madera', stone: 'piedra', science: 'ciencia', culture: 'cultura'
}
const signo = (n) => (n > 0 ? `+${n}` : `${n}`)

// Resume lo que gana y lo que paga una raza, en el orden en que se leen mejor:
// primero las ventajas. Devuelve [{ texto, bueno }] para colorearlas.
const efectosDe = (r) => {
  const efectos = []
  for (const [recurso, fraccion] of Object.entries(r.produccionPorcentual ?? {})) {
    efectos.push({ texto: `${signo(Math.round(fraccion * 100))}% ${NOMBRE_RECURSO[recurso] ?? recurso}`, bueno: fraccion > 0 })
  }
  if (r.bonoAtaqueUnidades) efectos.push({ texto: `${signo(r.bonoAtaqueUnidades)} ataque`, bueno: r.bonoAtaqueUnidades > 0 })
  if (r.bonoDefensaUnidades) efectos.push({ texto: `${signo(r.bonoDefensaUnidades)} defensa de tropas`, bueno: r.bonoDefensaUnidades > 0 })
  if (r.bonoDefensaCiudad) efectos.push({ texto: `${signo(Math.round(r.bonoDefensaCiudad * 100))}% defensa de ciudades`, bueno: r.bonoDefensaCiudad > 0 })
  if (r.visionExtra) efectos.push({ texto: `${signo(r.visionExtra)} visión`, bueno: r.visionExtra > 0 })
  return efectos.sort((a, b) => Number(b.bueno) - Number(a.bueno))
}

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
    civilizacion: nombreJugador.value,
    raza: raza.value
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
      bots: botsConGente.value,
      dificultadIA: dificultadIA.value,
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
      bots: botsSolo.value,
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

const cargarConstantes = async () => {
  try {
    const { dificultadesIA: lista, razas: listaRazas } = await obtenerConstantes()
    dificultadesIA.value = lista || []
    dificultadIA.value = lista?.find(d => d.porDefecto)?.tipo ?? lista?.[0]?.tipo ?? null
    razas.value = listaRazas || []
    raza.value = razas.value[0]?.tipo ?? null
  } catch {
    // Sin la lista, los selectores no se muestran: crearPartida ya cae al
    // default del backend si dificultadIA llega null/invalido, y unirse sin
    // raza juega sin bonos (como antes de que existieran).
    dificultadesIA.value = []
    razas.value = []
  }
}

onMounted(() => {
  cargarPartidas()
  cargarConstantes()
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

      <!-- La raza vale para las tres formas de entrar (solo, crear, unirse). Cada
           una gana algo y paga algo: por eso se muestran las dos cosas. -->
      <section v-if="razas.length" class="panel">
        <h2>Tu raza</h2>
        <div class="raza-lista" role="radiogroup" aria-label="Raza">
          <label
            v-for="r in razas"
            :key="r.tipo"
            class="raza-opcion"
            :class="{ elegida: raza === r.tipo }"
          >
            <input type="radio" name="raza" :value="r.tipo" v-model="raza" />
            <span class="raza-nombre">{{ r.icono }} {{ r.nombre }}</span>
            <small>{{ r.descripcion }}</small>
            <span class="raza-efectos">
              <span
                v-for="ef in efectosDe(r)"
                :key="ef.texto"
                :class="['efecto', ef.bueno ? 'efecto-bueno' : 'efecto-malo']"
              >{{ ef.texto }}</span>
            </span>
          </label>
        </div>
      </section>

      <section class="panel panel-ia">
        <h2>🤖 Jugar solo</h2>
        <p class="ayuda">Sin esperar a nadie: la máquina controla a tus rivales.</p>
        <label class="field">
          Rivales
          <select v-model.number="botsSolo">
            <option v-for="n in BOTS_SOLO" :key="n" :value="n">{{ n === 1 ? '1 máquina' : `${n} máquinas` }}</option>
          </select>
        </label>

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
        <label class="field">
          Máquinas
          <select v-model.number="botsConGente">
            <option v-for="n in BOTS_CON_GENTE" :key="n" :value="n">
              {{ n === 0 ? 'Ninguna (solo personas)' : n === 1 ? '1 máquina' : `${n} máquinas` }}
            </option>
          </select>
        </label>
        <label v-if="botsConGente > 0 && dificultadesIA.length" class="field">
          Dificultad de las máquinas
          <select v-model="dificultadIA">
            <option v-for="d in dificultadesIA" :key="d.tipo" :value="d.tipo">{{ d.nombre }}</option>
          </select>
        </label>
        <p class="ayuda-config">
          Las máquinas juegan como un jugador más, junto con las personas que se unan con el código.
        </p>
        <label class="field">
          Turnos
          <select v-model="modoTurno">
            <option v-for="m in MODOS_TURNO" :key="m.valor" :value="m.valor">{{ m.etiqueta }}</option>
          </select>
        </label>
        <p class="ayuda-config">
          Todos a la vez: cada uno mueve cuando quiere y la ronda termina cuando
          todos tocaron "Terminar turno". De a uno: se juega por orden, como antes.
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
        <h3 class="titulo-mecanicas">Mecánicas de la partida</h3>
        <template v-for="m in MECANICAS" :key="m.clave">
          <label class="field field-check">
            <input v-model="mecanicas[m.clave]" type="checkbox" />
            <span>{{ m.nombre }}</span>
          </label>
          <p class="ayuda-config">{{ m.ayuda }}</p>
        </template>
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
.titulo-mecanicas {
  margin: 0.75rem 0 0.25rem;
  font-size: 1rem;
}

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

.raza-lista {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.raza-opcion {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 0.5rem;
  row-gap: 0.2rem;
  align-items: baseline;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 0.5rem 0.6rem;
  cursor: pointer;
  font-size: 0.85rem;
}

.raza-opcion.elegida {
  border-color: rgba(52, 152, 219, 0.7);
  background: rgba(52, 152, 219, 0.14);
}

.raza-nombre { font-weight: 600; }
.raza-opcion small { grid-column: 2; opacity: 0.7; }
.raza-efectos { grid-column: 2; display: flex; flex-wrap: wrap; gap: 0.3rem; }
.efecto { font-size: 0.75rem; border-radius: 4px; padding: 0.05rem 0.4rem; }
.efecto-bueno { background: rgba(46, 204, 113, 0.18); color: #2ecc71; }
.efecto-malo { background: rgba(231, 76, 60, 0.18); color: #e74c3c; }

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
