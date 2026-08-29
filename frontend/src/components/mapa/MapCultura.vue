<!-- frontend/src/components/mapa/MapCultura.vue -->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  constantes: { type: Object, default: null },
  recursos: { type: Object, default: () => ({}) },
  rasgos: { type: Array, default: () => [] },
  esTuTurno: { type: Boolean, default: false }
})
const emit = defineEmits(['adoptar'])

const ICONO = {
  gastronomia: '🍲', idioma: '🗣️', teatro: '🎭', arte: '🏺',
  creenciasYReligion: '🙏', valoresYNormas: '⚖️', organizacionSocial: '🏘️',
  saberes: '📜', artesanias: '🧺', tradicionesYCostumbres: '🎉', vestimenta: '👘'
}

const cultura = computed(() => props.recursos?.culture ?? 0)

const disponibles = computed(() =>
  (props.constantes?.rasgosCulturales || []).map(rasgo => {
    const costo = rasgo.costo?.culture ?? 0
    const adoptado = props.rasgos.includes(rasgo.tipo)
    return {
      ...rasgo,
      costo,
      adoptado,
      // El motivo se calcula aca y se muestra siempre: un boton gris sin
      // explicacion hace pensar al jugador que le faltan recursos cuando en
      // realidad puede ser otra cosa.
      motivo: adoptado ? 'ya lo tenés'
        : !props.esTuTurno ? 'esperá tu turno'
          : cultura.value < costo ? `te faltan ${costo - cultura.value} de cultura`
            : null
    }
  })
)

const efecto = (rasgo) => {
  const partes = []
  for (const [recurso, cantidad] of Object.entries(rasgo.produccionCiudad || {})) {
    const nombre = { food: 'comida', culture: 'cultura', gold: 'oro', wood: 'madera', stone: 'piedra', science: 'ciencia' }[recurso] || recurso
    partes.push(`+${cantidad} ${nombre} por ciudad`)
  }
  if (rasgo.visionExtra) partes.push(`+${rasgo.visionExtra} de alcance al explorar`)
  if (rasgo.bonoDefensaCiudad) partes.push(`+${Math.round(rasgo.bonoDefensaCiudad * 100)}% de defensa en tus ciudades`)
  return partes.join(' · ')
}
</script>

<template>
  <div class="cultura">
    <p class="cultura-total">Tenés <strong>🎭 {{ cultura }}</strong> de cultura.</p>
    <p class="cultura-nota">
      Los rasgos son de tu civilización, no de una ciudad: se adoptan una vez y
      valen para siempre, también para las ciudades que fundes después.
    </p>

    <button
      v-for="rasgo in disponibles"
      :key="rasgo.tipo"
      class="rasgo"
      :class="{ adoptado: rasgo.adoptado }"
      :disabled="rasgo.motivo !== null"
      @click="emit('adoptar', rasgo.tipo)"
    >
      <span class="rasgo-titulo">
        {{ ICONO[rasgo.tipo] || '✨' }} {{ rasgo.nombre }}
        <small>{{ rasgo.adoptado ? '✔ adoptado' : `🎭 ${rasgo.costo}` }}</small>
      </span>
      <small class="rasgo-efecto">{{ efecto(rasgo) }}</small>
      <small class="rasgo-desc">{{ rasgo.descripcion }}</small>
      <em v-if="rasgo.motivo && !rasgo.adoptado" class="rasgo-motivo">{{ rasgo.motivo }}</em>
    </button>
  </div>
</template>

<style scoped>
.cultura { display: flex; flex-direction: column; gap: 0.5rem; }
.cultura-total { margin: 0; }
.cultura-nota { margin: 0 0 0.3rem; opacity: 0.7; font-size: 0.8rem; line-height: 1.4; }

.rasgo {
  display: flex; flex-direction: column; gap: 0.15rem;
  background: rgba(255, 255, 255, 0.08); color: #ecf0f1;
  border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 8px;
  padding: 0.5rem 0.7rem; cursor: pointer; text-align: left;
}
.rasgo:hover:not(:disabled) { background: rgba(52, 152, 219, 0.3); }
.rasgo:disabled { cursor: not-allowed; opacity: 0.6; }
.rasgo.adoptado { border-color: rgba(46, 204, 113, 0.5); opacity: 0.85; }

.rasgo-titulo { display: flex; justify-content: space-between; gap: 0.6rem; font-weight: 600; }
.rasgo-titulo small { font-weight: 400; opacity: 0.85; }
.rasgo-efecto { color: #2ecc71; font-size: 0.78rem; }
.rasgo-desc { opacity: 0.6; font-size: 0.76rem; font-style: italic; }
.rasgo-motivo { color: #e67e22; font-size: 0.75rem; font-style: normal; }
</style>
