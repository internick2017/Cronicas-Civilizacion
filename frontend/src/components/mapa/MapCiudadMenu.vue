<!-- frontend/src/components/mapa/MapCiudadMenu.vue -->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  vista: { type: Object, required: true },
  jugadorId: { type: String, required: true },
  posicion: { type: Object, required: true },
  constantes: { type: Object, required: true } // {edificios: [...], unidades: [...]}
})
defineEmits(['construir', 'reclutar', 'cerrar'])

// Los costos NO se copian del backend: llegan por prop desde MapSession, que
// los pide a GET /api/map/constantes. Una sola fuente de verdad.
// Sirven solo para DESHABILITAR botones; el backend vuelve a validar todo.
const EDIFICIOS = computed(() => props.constantes.edificios || [])
const UNIDADES = computed(() => props.constantes.unidades || [])

const tile = computed(() =>
  props.vista.mapa[props.posicion.y * props.vista.config.tamanoMapa + props.posicion.x]
)
const recursos = computed(() =>
  props.vista.jugadores.find(j => j.id === props.jugadorId)?.recursos || {}
)
const tieneBarracks = computed(() => (tile.value?.ciudad?.edificios || []).includes('barracks'))
const yaConstruido = (edificio) => (tile.value?.ciudad?.edificios || []).includes(edificio)

const puedePagar = (costo) =>
  Object.entries(costo).every(([recurso, monto]) => (recursos.value[recurso] || 0) >= monto)

const textoCosto = (costo) =>
  Object.entries(costo).map(([r, m]) => `${m} ${r}`).join(', ')

const motivoEdificio = (ed) => {
  if (yaConstruido(ed.tipo)) return 'ya construido'
  if (!puedePagar(ed.costo)) return 'sin recursos'
  return null
}

const motivoUnidad = (u) => {
  if (tile.value?.ejercito) return 'casilla ocupada'
  if (u.requiereBarracks && !tieneBarracks.value) return 'requiere cuartel'
  if (!puedePagar(u.costo)) return 'sin recursos'
  return null
}
</script>

<template>
  <div class="ciudad-menu">
    <section>
      <h4>Construir</h4>
      <button
        v-for="ed in EDIFICIOS"
        :key="ed.tipo"
        class="btn-secundario"
        :disabled="motivoEdificio(ed) !== null"
        @click="$emit('construir', ed.tipo)"
      >
        <strong>{{ ed.nombre }}</strong>
        <small>{{ textoCosto(ed.costo) }}</small>
        <em v-if="motivoEdificio(ed)">{{ motivoEdificio(ed) }}</em>
      </button>
    </section>

    <section>
      <h4>Reclutar</h4>
      <button
        v-for="u in UNIDADES"
        :key="u.tipo"
        class="btn-secundario"
        :disabled="motivoUnidad(u) !== null"
        @click="$emit('reclutar', u.tipo)"
      >
        <strong>{{ u.nombre }}</strong>
        <small>ATQ {{ u.ataque }} · DEF {{ u.defensa }} · MOV {{ u.movimiento }}</small>
        <small>{{ textoCosto(u.costo) }}</small>
        <em v-if="motivoUnidad(u)">{{ motivoUnidad(u) }}</em>
      </button>
    </section>
  </div>
</template>

<style scoped>
.ciudad-menu { display: flex; flex-direction: column; gap: 1rem; }
h4 { margin: 0 0 0.4rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.7; }
section { display: flex; flex-direction: column; gap: 0.35rem; }
.btn-secundario {
  background: rgba(255, 255, 255, 0.1); color: #ecf0f1;
  border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 6px;
  padding: 0.5rem 0.8rem; cursor: pointer; text-align: left;
  display: flex; flex-direction: column; gap: 0.1rem;
}
.btn-secundario:hover:not(:disabled) { background: rgba(255, 255, 255, 0.2); }
.btn-secundario:disabled { opacity: 0.45; cursor: not-allowed; }
small { opacity: 0.7; font-size: 0.75rem; }
em { color: #e67e22; font-size: 0.72rem; font-style: normal; }
</style>
