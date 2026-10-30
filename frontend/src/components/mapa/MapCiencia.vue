<!-- frontend/src/components/mapa/MapCiencia.vue -->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  constantes: { type: Object, default: null },
  recursos: { type: Object, default: () => ({}) },
  tecnologias: { type: Array, default: () => [] },
  esTuTurno: { type: Boolean, default: false }
})
const emit = defineEmits(['investigar'])

const ICONO = {
  metalurgia: '⚔️', fortificacion: '🛡️', irrigacion: '🌾',
  mineria: '⛏️', formacionMilitar: '🏇', filosofia: '📜',
  carpinteria: '🪵', canteria: '🪨', escritura: '✍️', literatura: '📚',
  acero: '🗡️', murallas: '🏰'
}

const ciencia = computed(() => props.recursos?.science ?? 0)

const disponibles = computed(() =>
  (props.constantes?.tecnologias || []).map(tec => {
    const costo = tec.costo?.science ?? 0
    const investigada = props.tecnologias.includes(tec.tipo)
    return {
      ...tec,
      costo,
      investigada,
      // Mismo criterio que en cultura: el motivo se muestra SIEMPRE, no solo
      // cuando falta ciencia, para que un boton gris nunca se lea como "no
      // tengo suficiente" cuando en realidad es otra cosa (no es tu turno).
      motivo: investigada ? 'ya la tenés'
        : !props.esTuTurno ? 'esperá tu turno'
          : ciencia.value < costo ? `te faltan ${costo - ciencia.value} de ciencia`
            : null
    }
  })
)

const NOMBRE_RECURSO = { food: 'comida', gold: 'oro', wood: 'madera', stone: 'piedra', culture: 'cultura', science: 'ciencia' }

const efecto = (tec) => {
  const partes = []
  if (tec.bonoAtaqueUnidades) partes.push(`+${tec.bonoAtaqueUnidades} de ataque a todas tus unidades`)
  if (tec.bonoDefensaUnidades) partes.push(`+${tec.bonoDefensaUnidades} de defensa a todas tus unidades`)
  for (const [recurso, fraccion] of Object.entries(tec.produccionPorcentual || {})) {
    partes.push(`+${Math.round(fraccion * 100)}% de ${NOMBRE_RECURSO[recurso] || recurso}`)
  }
  if (tec.desbloqueaUnidad) partes.push('desbloquea una unidad nueva')
  if (tec.desbloqueaEdificio) partes.push('desbloquea un edificio nuevo')
  return partes.join(' · ')
}
</script>

<template>
  <div class="ciencia">
    <p class="ciencia-total">Tenés <strong>🔬 {{ ciencia }}</strong> de ciencia.</p>
    <p class="ciencia-nota">
      Las tecnologías son de tu civilización, no de una ciudad: se investigan
      una vez y valen para siempre. No hay requisitos entre ellas: comprá la
      que quieras cuando te alcance.
    </p>

    <button
      v-for="tec in disponibles"
      :key="tec.tipo"
      class="tecnologia"
      :class="{ investigada: tec.investigada }"
      :disabled="tec.motivo !== null"
      @click="emit('investigar', tec.tipo)"
    >
      <span class="tecnologia-titulo">
        {{ ICONO[tec.tipo] || '🔬' }} {{ tec.nombre }}
        <small>{{ tec.investigada ? '✔ investigada' : `🔬 ${tec.costo}` }}</small>
      </span>
      <small class="tecnologia-efecto">{{ efecto(tec) }}</small>
      <small class="tecnologia-desc">{{ tec.descripcion }}</small>
      <em v-if="tec.motivo && !tec.investigada" class="tecnologia-motivo">{{ tec.motivo }}</em>
    </button>
  </div>
</template>

<style scoped>
.ciencia { display: flex; flex-direction: column; gap: 0.5rem; }
.ciencia-total { margin: 0; }
.ciencia-nota { margin: 0 0 0.3rem; opacity: 0.7; font-size: 0.8rem; line-height: 1.4; }

.tecnologia {
  display: flex; flex-direction: column; gap: 0.15rem;
  background: rgb(var(--t-tinta) / 0.08); color: rgb(var(--t-texto));
  border: 1px solid rgb(var(--t-tinta) / 0.12); border-radius: calc(var(--t-radio) * 8px);
  padding: 0.5rem 0.7rem; cursor: pointer; text-align: left;
}
.tecnologia:hover:not(:disabled) { background: rgb(var(--t-info) / 0.3); }
.tecnologia:disabled { cursor: not-allowed; opacity: 0.6; }
.tecnologia.investigada { border-color: rgb(var(--t-exito) / 0.5); opacity: 0.85; }

.tecnologia-titulo { display: flex; justify-content: space-between; gap: 0.6rem; font-weight: 600; }
.tecnologia-titulo small { font-weight: 400; opacity: 0.85; }
.tecnologia-efecto { color: rgb(var(--t-exito)); font-size: 0.78rem; }
.tecnologia-desc { opacity: 0.6; font-size: 0.76rem; font-style: italic; }
.tecnologia-motivo { color: rgb(var(--t-alerta)); font-size: 0.75rem; font-style: normal; }
</style>
