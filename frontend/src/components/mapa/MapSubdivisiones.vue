<!-- frontend/src/components/mapa/MapSubdivisiones.vue -->
<script setup>
import { computed, ref } from 'vue'

// El arbol de subdivisiones del Estado federal. Todo lo que muestra (tipos,
// niveles, prioridades) sale de /api/map/constantes; el backend vuelve a validar.
const props = defineProps({
  vista: { type: Object, required: true },
  jugadorId: { type: String, required: true },
  constantes: { type: Object, required: true }
})
const emit = defineEmits(['crear', 'renombrar', 'asignar', 'desasignar', 'quitar', 'cabecera'])

const NOMBRE_PRIORIDAD = { defensa: 'Defensa', comida: 'Comida', ciencia: 'Ciencia', economia: 'Economía' }
const tipos = computed(() => props.constantes.tiposSubdivision || [])
const prioridades = computed(() => props.constantes.prioridadesSubdivision || [])
const nombreTipo = (tipo) => tipos.value.find(t => t.tipo === tipo)?.nombre || tipo

const yo = computed(() => props.vista.jugadores.find(j => j.id === props.jugadorId))
const subdivisiones = computed(() => yo.value?.subdivisiones || [])

// Mis ciudades, para elegirlas y para mostrar sus nombres.
const misCiudades = computed(() =>
  props.vista.mapa
    .filter(t => t.ciudad && t.dueno === props.jugadorId)
    .map(t => ({ x: t.x, y: t.y, nombre: t.ciudad.nombre, clave: `${t.x},${t.y}` }))
)
const nombreDeCiudad = (c) => misCiudades.value.find(m => m.x === c.x && m.y === c.y)?.nombre || `(${c.x}, ${c.y})`

// El arbol aplanado en orden, con la profundidad de cada nodo (sangria).
const arbol = computed(() => {
  const lista = subdivisiones.value
  const hijas = (id) => lista.filter(s => (s.padreId ?? null) === id)
  const filas = []
  const recorrer = (s, profundidad) => {
    filas.push({ ...s, profundidad })
    for (const h of hijas(s.id)) recorrer(h, profundidad + 1)
  }
  for (const raiz of hijas(null)) recorrer(raiz, 0)
  return filas
})

// --- Cabecera: una ciudad del territorio (directas y de las hijas) ---
const territorio = (s) => {
  const hijas = subdivisiones.value.filter(h => (h.padreId ?? null) === s.id)
  return [...s.ciudades, ...hijas.flatMap(territorio)]
    .filter(c => misCiudades.value.some(m => m.x === c.x && m.y === c.y))
}
const claveCabecera = (s) => (s.cabecera ? `${s.cabecera.x},${s.cabecera.y}` : '')
const elegirCabecera = (s, valor) => {
  if (!valor) return emit('cabecera', s.id, null)
  const [x, y] = valor.split(',').map(Number)
  emit('cabecera', s.id, { x, y })
}

// --- Renombrar en el lugar ---
const editando = ref(null) // id de la subdivision que se esta renombrando
const nombreEditado = ref('')
const empezarRenombrar = (s) => { editando.value = s.id; nombreEditado.value = s.nombre }
const confirmarRenombrar = () => {
  const nombre = nombreEditado.value.trim()
  if (editando.value && nombre) emit('renombrar', editando.value, nombre)
  editando.value = null
}

// --- Asignar ciudades a una subdivision existente ---
const asignando = ref(null)
const ciudadesAsignar = ref([])
const empezarAsignar = (s) => {
  asignando.value = s.id
  ciudadesAsignar.value = s.ciudades.map(c => `${c.x},${c.y}`)
}
const confirmarAsignar = () => {
  const sub = subdivisiones.value.find(s => s.id === asignando.value)
  if (!sub) { asignando.value = null; return }
  const marcadas = misCiudades.value.filter(c => ciudadesAsignar.value.includes(c.clave)).map(({ x, y }) => ({ x, y }))
  // Las marcadas que no eran de esta subdivision entran (y salen de donde estaban); las que
  // tenia y se desmarcaron pasan a la subdivision de arriba (o al Pais).
  const nuevas = marcadas.filter(c => !sub.ciudades.some(d => d.x === c.x && d.y === c.y))
  const sacadas = sub.ciudades.filter(c => !marcadas.some(d => d.x === c.x && d.y === c.y))
  if (sacadas.length) emit('desasignar', sub.id, sacadas)
  if (nuevas.length) emit('asignar', sub.id, nuevas)
  asignando.value = null
}

// --- Crear ---
const nombre = ref('')
const tipo = ref('municipio')
const padreId = ref('')
const prioridad = ref('')
const elegidas = ref([])
const nivelDe = (t) => tipos.value.find(x => x.tipo === t)?.nivel ?? 5
// Solo pueden ser padre las de nivel ESTRICTAMENTE mayor (numero de nivel menor).
const padresPosibles = computed(() => subdivisiones.value.filter(s => s.nivel < nivelDe(tipo.value)))
const puedeCrear = computed(() => nombre.value.trim() !== '')
const crear = () => {
  if (!puedeCrear.value) return
  emit('crear', {
    nombre: nombre.value.trim(),
    tipoSubdivision: tipo.value,
    padreId: padreId.value || null,
    prioridad: prioridad.value || null,
    ciudades: misCiudades.value.filter(c => elegidas.value.includes(c.clave)).map(({ x, y }) => ({ x, y }))
  })
  nombre.value = ''
  elegidas.value = []
}
// Si cambia el tipo y el padre elegido deja de ser valido, se vuelve al Pais.
const alCambiarTipo = () => {
  if (padreId.value && !padresPosibles.value.some(s => s.id === padreId.value)) padreId.value = ''
}
</script>

<template>
  <div class="subdivisiones">
    <small>
      En el Estado federal todas tus ciudades se administran solas al terminar tu turno. Armá un árbol
      (País, Departamento, Distrito, Condado, Municipio, Freguesia) para elegir otra prioridad y para que
      los problemas los resuelva la subdivisión más chica que cubra la zona.
    </small>

    <ul v-if="arbol.length" class="arbol">
      <li v-for="s in arbol" :key="s.id" :style="{ paddingLeft: s.profundidad * 1.1 + 'rem' }">
        <div class="fila-nodo">
          <div class="datos">
            <template v-if="editando === s.id">
              <input v-model="nombreEditado" class="entrada" maxlength="30" @keyup.enter="confirmarRenombrar" @keyup.esc="editando = null">
              <button class="mini" @click="confirmarRenombrar">Guardar</button>
            </template>
            <template v-else>
              <strong>{{ s.nombre }}</strong>
              <small>
                {{ nombreTipo(s.tipo) }} ·
                {{ s.prioridad ? NOMBRE_PRIORIDAD[s.prioridad] : 'hereda prioridad' }} ·
                {{ s.ciudades.length ? s.ciudades.map(nombreDeCiudad).join(', ') : 'sin ciudades directas' }}
              </small>
              <small v-if="s.cabecera" class="cabecera">🏛️ Cabecera: {{ nombreDeCiudad(s.cabecera) }}</small>
            </template>
          </div>
          <div class="acciones">
            <button class="mini" @click="empezarRenombrar(s)">Renombrar</button>
            <button class="mini" @click="empezarAsignar(s)">Ciudades</button>
            <button class="mini" @click="emit('quitar', s.id)">Quitar</button>
          </div>
        </div>
        <select
          v-if="territorio(s).length"
          class="entrada ancha"
          :value="claveCabecera(s)"
          @change="elegirCabecera(s, $event.target.value)"
        >
          <option value="">Sin cabecera</option>
          <option v-for="c in territorio(s)" :key="`${c.x},${c.y}`" :value="`${c.x},${c.y}`">
            Cabecera: {{ nombreDeCiudad(c) }}
          </option>
        </select>
        <div v-if="asignando === s.id" class="asignar">
          <small>Marcá las ciudades de esta subdivisión (las que estén en otra se mueven acá).</small>
          <label v-for="c in misCiudades" :key="c.clave" class="check">
            <input v-model="ciudadesAsignar" type="checkbox" :value="c.clave"> {{ c.nombre }}
          </label>
          <button class="mini" @click="confirmarAsignar">Guardar ciudades</button>
        </div>
      </li>
    </ul>
    <em v-else class="vacio">Todavía no hay subdivisiones: todas tus ciudades dependen directo del País.</em>

    <h5>Crear subdivisión</h5>
    <input v-model="nombre" class="entrada ancha" placeholder="Nombre" maxlength="30">
    <select v-model="tipo" class="entrada ancha" @change="alCambiarTipo">
      <option v-for="t in tipos" :key="t.tipo" :value="t.tipo">{{ t.nombre }} (nivel {{ t.nivel }})</option>
    </select>
    <select v-model="padreId" class="entrada ancha">
      <option value="">Dentro del País</option>
      <option v-for="s in padresPosibles" :key="s.id" :value="s.id">Dentro de {{ s.nombre }} ({{ nombreTipo(s.tipo) }})</option>
    </select>
    <select v-model="prioridad" class="entrada ancha">
      <option value="">Heredar la prioridad</option>
      <option v-for="p in prioridades" :key="p" :value="p">{{ NOMBRE_PRIORIDAD[p] || p }}</option>
    </select>
    <label v-for="c in misCiudades" :key="c.clave" class="check">
      <input v-model="elegidas" type="checkbox" :value="c.clave"> {{ c.nombre }}
    </label>
    <button class="boton" :disabled="!puedeCrear" @click="crear"><strong>Crear subdivisión</strong></button>
  </div>
</template>

<style scoped>
.subdivisiones { display: flex; flex-direction: column; gap: 0.4rem; }
h5 { margin: 0.6rem 0 0; font-size: 0.8rem; text-transform: uppercase; opacity: 0.7; }
.arbol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
.fila-nodo { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
.datos { display: flex; flex-direction: column; min-width: 0; }
.datos small { opacity: 0.7; font-size: 0.72rem; }
.acciones { display: flex; gap: 0.25rem; flex-shrink: 0; }
.mini {
  background: rgba(255, 255, 255, 0.1); color: #ecf0f1; border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 5px; padding: 0.2rem 0.45rem; font-size: 0.72rem; cursor: pointer;
}
.mini:hover { background: rgba(255, 255, 255, 0.2); }
.asignar { display: flex; flex-direction: column; gap: 0.2rem; padding: 0.3rem 0 0.2rem 0.6rem; }
.check { font-size: 0.8rem; display: flex; gap: 0.4rem; align-items: center; }
.entrada {
  padding: 0.35rem 0.5rem; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.25); color: #ecf0f1;
}
.entrada.ancha { width: 100%; box-sizing: border-box; }
.boton {
  background: rgba(255, 255, 255, 0.1); color: #ecf0f1; border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px; padding: 0.5rem 0.8rem; cursor: pointer; text-align: left;
}
.boton:disabled { opacity: 0.45; cursor: not-allowed; }
.vacio { font-size: 0.72rem; font-style: normal; color: #e67e22; }
.datos small.cabecera { color: #f1c40f; opacity: 1; }
small { opacity: 0.7; font-size: 0.75rem; }
</style>
