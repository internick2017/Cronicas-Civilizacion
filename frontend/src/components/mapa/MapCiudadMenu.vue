<!-- frontend/src/components/mapa/MapCiudadMenu.vue -->
<script setup>
import { computed, ref } from 'vue'
import { recursoDe, textoCosto as textoCostoEn, textoFalta } from './recursos.js'

const props = defineProps({
  vista: { type: Object, required: true },
  jugadorId: { type: String, required: true },
  posicion: { type: Object, required: true },
  constantes: { type: Object, required: true } // {edificios: [...], unidades: [...], tecnologias: [...]}
})
const emit = defineEmits(['construir', 'reclutar', 'mejorar', 'renombrar', 'hacerCapital', 'cerrar'])

// Los costos NO se copian del backend: llegan por prop desde MapSession, que
// los pide a GET /api/map/constantes. Una sola fuente de verdad.
// Sirven solo para DESHABILITAR botones; el backend vuelve a validar todo.
// Lo que existe en el modo de esta partida lo dice el backend (vista.reglas): un edificio que
// produce algo que no existe (la biblioteca sin ciencia) no se ofrece.
const reglas = computed(() => props.vista.reglas ?? { tecnologias: true, mejorasCiudad: true, recursosActivos: null })
const existe = (recurso) => !reglas.value.recursosActivos || reglas.value.recursosActivos.includes(recurso)
const EDIFICIOS = computed(() =>
  (props.constantes.edificios || []).filter(e => Object.keys(e.produccion || {}).every(existe)))
const UNIDADES = computed(() => (props.constantes.unidades || []).filter(u => reglas.value.armada !== false || u.tipo !== 'warship'))

const tile = computed(() =>
  props.vista.mapa[props.posicion.y * props.vista.config.tamanoMapa + props.posicion.x]
)
const recursos = computed(() =>
  props.vista.jugadores.find(j => j.id === props.jugadorId)?.recursos || {}
)
// Los precios en oro se leen en la moneda propia del jugador.
const moneda = computed(() => props.vista.jugadores.find(j => j.id === props.jugadorId)?.moneda ?? null)
const textoCosto = (costo) => textoCostoEn(costo, moneda.value)
const tieneBarracks = computed(() => (tile.value?.ciudad?.edificios || []).includes('barracks'))
const tienePuerto = computed(() => (tile.value?.ciudad?.edificios || []).includes('port'))

// El mar pegado a esta ciudad. Se mira el terreno de los cuatro vecinos
// ortogonales, igual que `esCostera` en el dominio, y por la misma definicion:
// el rio NO cuenta, porque se vadea y no se navega.
const marAdyacente = computed(() => {
  const t = props.vista.config.tamanoMapa
  const { x, y } = props.posicion
  return [[0, -1], [0, 1], [-1, 0], [1, 0]]
    .map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
    .filter(p => p.x >= 0 && p.y >= 0 && p.x < t && p.y < t)
    .map(p => props.vista.mapa[p.y * t + p.x])
    .filter(tile => tile?.terreno === 'water')
})
const esCostera = computed(() => marAdyacente.value.length > 0)
const yaConstruido = (edificio) => (tile.value?.ciudad?.edificios || []).includes(edificio)
const misTecnologias = computed(() =>
  props.vista.jugadores.find(j => j.id === props.jugadorId)?.tecnologias || []
)
const nombreTecnologia = (tipo) =>
  (props.constantes.tecnologias || []).find(t => t.tipo === tipo)?.nombre || tipo

// La inflacion (problema social) encarece todo. El backend manda el multiplicador
// del jugador y redondea HACIA ARRIBA, igual que escalarCosto en el dominio.
const multiplicador = computed(() =>
  props.vista.jugadores.find(j => j.id === props.jugadorId)?.multiplicadorCostos ?? 1
)
const escalar = (costo) =>
  multiplicador.value === 1
    ? costo
    : Object.fromEntries(Object.entries(costo).map(([r, m]) => [r, Math.ceil(m * multiplicador.value - 1e-9)]))

const falta = (costo) => textoFalta(costo, recursos.value, moneda.value)

// Abre en lo mas urgente: sin tropa en la casilla, reclutar. Con guarnicion no
// se puede reclutar tierra, asi que construir.
const PESTANAS = [
  { valor: 'construir', etiqueta: 'Construir' },
  { valor: 'reclutar', etiqueta: 'Reclutar' },
  { valor: 'ciudad', etiqueta: 'Ciudad' },
]
const pestana = ref(tile.value?.ejercito ? 'construir' : 'reclutar')

// Nada que cueste recursos se compra con un solo toque: el primero lo deja
// PENDIENTE y muestra que se va a gastar y cuanto queda; el segundo confirma.
const pendiente = ref(null) // { titulo, costo, confirmar } | null
const pedir = (titulo, costo, confirmar) => { pendiente.value = { titulo, costo, confirmar } }
const confirmar = () => {
  const compra = pendiente.value
  pendiente.value = null
  compra?.confirmar()
}
const quedaTras = (costo) =>
  Object.entries(costo)
    .map(([r, m]) => `${recursoDe(r, moneda.value)?.icono ?? r} ${(recursos.value[r] || 0) - m}`)
    .join(' · ')

const motivoEdificio = (ed) => {
  if (yaConstruido(ed.tipo)) return 'ya construido'
  if (ed.requiereCosta && !esCostera.value) return 'requiere mar al lado'
  if (reglas.value.tecnologias && ed.requiereTecnologia && !misTecnologias.value.includes(ed.requiereTecnologia)) {
    return `requiere ${nombreTecnologia(ed.requiereTecnologia)}`
  }
  return falta(escalar(ed.costo))
}

// El cuartel abarata y potencia lo reclutado EN esa ciudad (ver el
// comentario en constantes.js#CUARTEL): sin esto el boton mostraria el
// precio y el movimiento de lista aunque el backend vaya a cobrar/dar otra
// cosa, y lo que dice que falta podria estar mal si el precio real (con descuento)
// si te alcanza.
const cuartel = computed(() => props.constantes.cuartel || null)
// El buque queda FUERA del bono del cuartel, igual que en reglas/militar.js:
// un cuartel entrena tropa, no marineros. Si la vista lo aplicara igual,
// mostraria un precio que el backend no va a cobrar.
const conBonoCuartel = (u) => tieneBarracks.value && cuartel.value && !u.naval
const costoReal = (costoBase, u) => {
  if (!conBonoCuartel(u)) return escalar(costoBase)
  return escalar(Object.fromEntries(Object.entries(costoBase).map(
    ([r, m]) => [r, Math.round(m * (1 - cuartel.value.descuentoReclutar))])))
}
const movimientoReal = (u) =>
  u.movimiento + (conBonoCuartel(u) ? cuartel.value.bonoMovimiento : 0)

const motivoUnidad = (u) => {
  // Un buque no ocupa la casilla de la ciudad, nace en el mar de al lado: que
  // haya guarnicion parada en la ciudad no lo bloquea (ver reglas/militar.js).
  if (!u.naval && tile.value?.ejercito) return 'casilla ocupada'
  if (u.requiereBarracks && !tieneBarracks.value) return 'requiere cuartel'
  if (u.requierePuerto && !tienePuerto.value) return 'requiere puerto'
  if (u.naval && !marAdyacente.value.some(m => !m.ejercito)) return 'sin mar libre donde botarlo'
  if (reglas.value.tecnologias && u.requiereTecnologia && !misTecnologias.value.includes(u.requiereTecnologia)) {
    return `requiere ${nombreTecnologia(u.requiereTecnologia)}`
  }
  return falta(costoReal(u.costo, u))
}

// Mejorar el nivel es repetible (a diferencia de construir un edificio): el
// costo crece con el nivel actual, calculado del mismo modo que el backend
// (COSTO_MEJORA_CIUDAD(nivel) = base * nivel), asi el numero mostrado nunca
// se desincroniza de lo que realmente va a cobrar el servidor.
const nivelActual = computed(() => tile.value?.ciudad?.nivel ?? 1)
const costoMejora = computed(() => {
  const base = props.constantes.costoMejoraCiudadPorNivel || {}
  return escalar(Object.fromEntries(Object.entries(base).map(([r, m]) => [r, m * nivelActual.value])))
})
const motivoMejora = computed(() => falta(costoMejora.value))

// Renombrar es gratis. El limite de largo es el del backend
// (LARGO_MAXIMO_NOMBRE_CIUDAD en reglas/ciudades.js): aca solo evita que el
// input deje escribir de mas, el backend vuelve a validar.
const LARGO_MAXIMO_NOMBRE = 30
const nombreNuevo = ref(tile.value?.ciudad?.nombre ?? '')
const nombreLimpio = computed(() => nombreNuevo.value.trim())
const puedeRenombrar = computed(() =>
  nombreLimpio.value !== '' && nombreLimpio.value !== tile.value?.ciudad?.nombre)
const vidaCiudad = computed(() => {
  const c = tile.value?.ciudad
  return c && typeof c.salud === 'number' && c.saludMax ? `${c.salud}/${c.saludMax}` : null
})
const renombrar = () => {
  if (puedeRenombrar.value) emit('renombrar', nombreLimpio.value)
}

const esCapital = computed(() => Boolean(tile.value?.ciudad?.capital))
const instalandoseHasta = computed(() => {
  const hasta = tile.value?.ciudad?.mudanzaHasta ?? 0
  return hasta > props.vista.turno ? hasta : null
})
const capital = computed(() => props.constantes.capital || null)
const costoCapital = computed(() => escalar(capital.value?.costoMover || {}))
const motivoCapital = computed(() => falta(costoCapital.value))
</script>

<template>
  <div class="ciudad-menu">
    <div class="pestanas" role="tablist" aria-label="Secciones de la ciudad">
      <button
        v-for="p in PESTANAS"
        :key="p.valor"
        role="tab"
        :aria-selected="pestana === p.valor"
        :class="['pestana', { elegida: pestana === p.valor }]"
        @click="pestana = p.valor"
      >{{ p.etiqueta }}</button>
    </div>

    <template v-if="pestana === 'ciudad'">
    <section>
      <h4>Nombre</h4>
      <div class="fila-nombre">
        <input
          v-model="nombreNuevo"
          class="entrada-nombre"
          :maxlength="LARGO_MAXIMO_NOMBRE"
          placeholder="Nombre de la ciudad"
          @keyup.enter="renombrar"
        >
        <button class="btn-secundario" :disabled="!puedeRenombrar" @click="renombrar">
          <strong>Renombrar</strong>
        </button>
      </div>
    </section>

    <section v-if="vidaCiudad">
      <h4>Vida de la ciudad</h4>
      <p class="vida-ciudad">❤️ {{ vidaCiudad }}</p>
    </section>

    <section v-if="capital && reglas.capital !== false">
      <h4>Capital</h4>
      <p v-if="esCapital" class="capital">
        👑 Es tu capital: +{{ Math.round(capital.bonoProduccion * 100) }}% de producción y +{{ capital.bonoDefensa }} de defensa.
      </p>
      <button
        v-else
        class="btn-secundario"
        :disabled="motivoCapital !== null"
        @click="pedir('Hacer capital esta ciudad', costoCapital, () => emit('hacerCapital'))"
      >
        <strong>Hacer capital ({{ textoCosto(costoCapital) }})</strong>
        <small>Rinde +{{ Math.round(capital.bonoProduccion * 100) }}% y defiende mejor, pero no produce nada la primera ronda.</small>
        <em v-if="motivoCapital">{{ motivoCapital }}</em>
      </button>
      <em v-if="instalandoseHasta">La capital se está instalando: vuelve a producir en la ronda {{ instalandoseHasta }}.</em>
    </section>

    <section v-if="reglas.mejorasCiudad">
      <h4>Nivel de la ciudad</h4>
      <button
        class="btn-secundario"
        :disabled="motivoMejora !== null"
        @click="pedir(`Mejorar la ciudad a nivel ${nivelActual + 1}`, costoMejora, () => emit('mejorar'))"
      >
        <strong>Mejorar (nivel {{ nivelActual }} → {{ nivelActual + 1 }})</strong>
        <small>{{ textoCosto(costoMejora) }}</small>
        <small>Más defensa contra ataques.</small>
        <em v-if="motivoMejora">{{ motivoMejora }}</em>
      </button>
    </section>
    </template>

    <section v-if="pestana === 'construir'">
      <button
        v-for="ed in EDIFICIOS"
        :key="ed.tipo"
        class="btn-secundario"
        :disabled="motivoEdificio(ed) !== null"
        @click="pedir(`Construir: ${ed.nombre}`, escalar(ed.costo), () => emit('construir', ed.tipo))"
      >
        <strong>{{ ed.nombre }}</strong>
        <small>{{ textoCosto(escalar(ed.costo)) }}</small>
        <em v-if="motivoEdificio(ed)">{{ motivoEdificio(ed) }}</em>
      </button>
    </section>

    <section v-if="pestana === 'reclutar'">
      <button
        v-for="u in UNIDADES"
        :key="u.tipo"
        class="btn-secundario"
        :disabled="motivoUnidad(u) !== null"
        @click="pedir(`Reclutar: ${u.nombre}`, costoReal(u.costo, u), () => emit('reclutar', u.tipo))"
      >
        <strong>{{ u.nombre }}</strong>
        <small>ATQ {{ u.ataque }} · DEF {{ u.defensa }} · MOV {{ movimientoReal(u) }}</small>
        <small>{{ textoCosto(costoReal(u.costo, u)) }}</small>
        <em v-if="conBonoCuartel(u)" class="bono-cuartel">🏛️ cuartel: -{{ Math.round(cuartel.descuentoReclutar * 100) }}%, +{{ cuartel.bonoMovimiento }} mov</em>
        <em v-if="motivoUnidad(u)">{{ motivoUnidad(u) }}</em>
      </button>
    </section>

    <!-- Pegada abajo del dialogo: se ve sin importar hasta donde se haya bajado. -->
    <div v-if="pendiente" class="confirmar" role="alertdialog" aria-label="Confirmar compra">
      <strong>{{ pendiente.titulo }}</strong>
      <span>Cuesta {{ textoCosto(pendiente.costo) }}</span>
      <small>Te quedaría: {{ quedaTras(pendiente.costo) }}</small>
      <div class="confirmar-botones">
        <button class="btn-confirmar" @click="confirmar">Sí, gastar</button>
        <button class="btn-cancelar" @click="pendiente = null">No</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ciudad-menu { display: flex; flex-direction: column; gap: 1rem; }
.pestanas { display: flex; gap: 0.3rem; }
.pestana {
  flex: 1; min-height: 44px; border-radius: 6px; cursor: pointer; font-size: 0.85rem;
  background: rgba(255, 255, 255, 0.06); color: #ecf0f1; border: 1px solid rgba(255, 255, 255, 0.15);
}
.pestana.elegida { border-color: #2ecc71; background: rgba(46, 204, 113, 0.18); }
h4 { margin: 0 0 0.4rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.7; }
section { display: flex; flex-direction: column; gap: 0.35rem; }
.btn-secundario {
  background: rgba(255, 255, 255, 0.1); color: #ecf0f1;
  border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 6px;
  padding: 0.5rem 0.8rem; min-height: 44px; cursor: pointer; text-align: left;
  display: flex; flex-direction: column; gap: 0.1rem; font-size: 0.85rem;
}
.btn-secundario:hover:not(:disabled) { background: rgba(255, 255, 255, 0.2); }
/* Lo apagado es el boton, no el motivo: es justo lo que hay que poder leer. */
.btn-secundario:disabled { background: rgba(0, 0, 0, 0.15); cursor: not-allowed; }
.btn-secundario:disabled strong, .btn-secundario:disabled small { opacity: 0.6; }
small { opacity: 0.7; font-size: 0.75rem; }
em { color: #f5b041; font-size: 0.75rem; font-style: normal; }
.fila-nombre { display: flex; gap: 0.4rem; }
.entrada-nombre {
  flex: 1; min-width: 0; min-height: 44px; padding: 0.4rem 0.6rem; border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(0, 0, 0, 0.25); color: #ecf0f1;
}
.bono-cuartel { color: #2ecc71; }
.capital { margin: 0; font-size: 0.85rem; }
.confirmar {
  position: sticky; bottom: -1.5rem; z-index: 1;
  margin: 0 -0.5rem; padding: 0.75rem;
  background: #1f2d3a; border: 1px solid #f1c40f; border-radius: 8px;
  display: flex; flex-direction: column; gap: 0.3rem;
  box-shadow: 0 -6px 16px rgba(0, 0, 0, 0.45);
}
.confirmar small { opacity: 0.8; font-size: 0.8rem; }
.confirmar-botones { display: flex; gap: 0.5rem; margin-top: 0.3rem; }
.btn-confirmar, .btn-cancelar {
  flex: 1; min-height: 44px; border-radius: 6px; cursor: pointer; font-weight: bold;
  color: #ecf0f1; border: 1px solid rgba(255, 255, 255, 0.2);
}
.btn-confirmar { background: #27ae60; border-color: #27ae60; }
.btn-cancelar { background: rgba(255, 255, 255, 0.1); }
</style>
