<!-- frontend/src/components/mapa/MapProblemas.vue -->
<script setup>
import { computed } from 'vue'

// Problemas sociales de las zonas del Estado federal: los activos, con quien los
// resuelve, y las señales de aviso (antes del limite) y de recuperacion (despues).
// Los NUMEROS (costos, rondas) salen de /api/map/constantes; solo las frases estan aca.
const props = defineProps({
  vista: { type: Object, required: true },
  jugadorId: { type: String, required: true },
  constantes: { type: Object, required: true }
})

const FRASE_AVISO = {
  inseguridad: 'crece la inseguridad en',
  desempleo: 'empiezan a faltar empleos en',
  inflacion: 'suben los precios en',
  pobreza: 'crece la pobreza en',
  salud: 'los hospitales no dan abasto en',
  educacion: 'bajan los niveles educativos en',
  infraestructura: 'falta infraestructura y vivienda en',
  corrupcion: 'crecen los rumores de corrupción en',
  clima: 'se agrava la escasez de agua en',
  inmigracion: 'aumenta la presión en la frontera de',
}
const FRASE_RECUPERACION = {
  inseguridad: 'vuelve la calma en',
  desempleo: 'se recupera el empleo en',
  inflacion: 'se frenan los precios en',
  pobreza: 'mejora la situación social en',
  salud: 'se recupera la salud pública en',
  educacion: 'mejora la educación en',
  infraestructura: 'avanzan las obras en',
  corrupcion: 'se limpia la administración en',
  clima: 'vuelve el agua en',
  inmigracion: 'se ordena la frontera de',
}

const yo = computed(() => props.vista.jugadores.find(j => j.id === props.jugadorId))
const problemas = computed(() => yo.value?.problemas || [])
const senales = computed(() => yo.value?.senales || [])
const avisos = computed(() => senales.value.filter(s => s.estado === 'aviso'))
const recuperaciones = computed(() => senales.value.filter(s => s.estado === 'recuperacion'))

const nombreProblema = (tipo) =>
  (props.constantes.problemasSociales || []).find(p => p.tipo === tipo)?.nombre || tipo
const nombreCiudad = (c) =>
  props.vista.mapa.find(t => t.x === c.x && t.y === c.y)?.ciudad?.nombre || `(${c.x}, ${c.y})`
const lista = (ciudades) => ciudades.map(nombreCiudad).join(', ')

const subdivisiones = computed(() => yo.value?.subdivisiones || [])
// El backend manda el resolutor, el costo y las rondas de HOY (con el arbol actual): lo que se
// muestra es lo que se va a cobrar, aunque el arbol se haya reorganizado desde que surgio.
const resolutor = (p) => {
  const sub = subdivisiones.value.find(s => s.id === p.resolutorActual)
  return sub ? sub.nombre : 'el País'
}
</script>

<template>
  <div class="problemas">
    <small>
      Cada zona acumula problemas sociales. Antes de explotar dan <strong>señales</strong>: podés prevenirlos
      (cuartel, granero, biblioteca, mercado). Si explotan, los resuelve solo la subdivisión más chica que cubra
      la zona, pagando oro.
    </small>

    <template v-if="problemas.length">
      <h5>Problemas activos</h5>
      <div v-for="p in problemas" :key="p.id" class="problema">
        <strong>{{ nombreProblema(p.tipo) }}</strong>
        <small>
          en {{ lista(p.ciudades) }} · gravedad {{ p.gravedad }} ·
          lo resuelve {{ resolutor(p) }}
          <template v-if="p.rondasRestantes > 0">en {{ p.rondasRestantes }} ronda(s)</template>
          <template v-else>al cerrar la ronda, si hay oro</template>
          ({{ p.costoResolver }} de oro)
        </small>
      </div>
    </template>

    <template v-if="avisos.length">
      <h5>Señales de aviso</h5>
      <p v-for="s in avisos" :key="'a' + s.tipo" class="aviso">
        ⚠️ {{ FRASE_AVISO[s.tipo] }} {{ lista(s.ciudades) }}
      </p>
    </template>

    <template v-if="recuperaciones.length">
      <h5>Recuperación</h5>
      <p v-for="(s, i) in recuperaciones" :key="'r' + i" class="recuperacion">
        ✅ {{ FRASE_RECUPERACION[s.tipo] }} {{ lista(s.ciudades) }}
      </p>
    </template>

    <em v-if="!problemas.length && !avisos.length && !recuperaciones.length" class="tranquilo">
      Sin problemas a la vista.
    </em>
  </div>
</template>

<style scoped>
.problemas { display: flex; flex-direction: column; gap: 0.3rem; }
h5 { margin: 0.4rem 0 0; font-size: 0.8rem; text-transform: uppercase; opacity: 0.7; }
.problema { display: flex; flex-direction: column; border-left: 3px solid #e74c3c; padding-left: 0.5rem; }
.aviso { margin: 0; font-size: 0.82rem; color: #f1c40f; }
.recuperacion { margin: 0; font-size: 0.82rem; color: #2ecc71; }
.tranquilo { font-size: 0.75rem; font-style: normal; color: #2ecc71; }
small { opacity: 0.75; font-size: 0.75rem; }
</style>
