<!-- frontend/src/components/mapa/MapCiudadano.vue -->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  vista: { type: Object, required: true },
  jugadorId: { type: String, required: true },
  constantes: { type: Object, required: true }
})
const emit = defineEmits(['manifestarse'])

const GRUPOS = [
  { clave: 'pueblo', nombre: 'Pueblo' },
  { clave: 'lideres', nombre: 'Líderes' },
  { clave: 'militares', nombre: 'Militares' },
]

const yo = computed(() => props.vista.jugadores.find(j => j.id === props.jugadorId))
const umbral = computed(() => props.constantes.umbralesGobierno?.levantamiento ?? 25)
const puntos = computed(() => props.constantes.puntosManifestacion ?? 3)
const apoyoDe = (grupo) => yo.value?.apoyo?.[grupo] ?? 0
const hayRiesgo = computed(() => GRUPOS.some(g => apoyoDe(g.clave) < umbral.value))
const yaSaliste = computed(() => yo.value?.manifestoEnRonda === props.vista.turno)
const jugando = computed(() => props.vista.estado === 'jugando')
</script>

<template>
  <div class="ciudadano">
    <p class="intro">La máquina gobierna {{ yo?.civilizacion }}. Vos vivís acá y podés hacerte oír una vez por ronda.</p>

    <ul class="apoyos">
      <li v-for="g in GRUPOS" :key="g.clave">
        <span>{{ g.nombre }}</span>
        <span class="barra"><span :class="['lleno', { bajo: apoyoDe(g.clave) < umbral }]" :style="{ width: `${apoyoDe(g.clave)}%` }"></span></span>
        <strong>{{ apoyoDe(g.clave) }}</strong>
      </li>
    </ul>

    <em v-if="hayRiesgo" class="alerta">Se huele un levantamiento: un grupo está por debajo de {{ umbral }}.</em>

    <div class="botones">
      <button class="btn-apoyar" :disabled="yaSaliste || !jugando" @click="emit('manifestarse', 'apoyar')">
        👏 Apoyar (+{{ puntos }})
      </button>
      <button class="btn-protestar" :disabled="yaSaliste || !jugando" @click="emit('manifestarse', 'protestar')">
        ✊ Protestar (-{{ puntos }})
      </button>
    </div>
    <small v-if="yaSaliste">Ya saliste a la calle en esta ronda.</small>
  </div>
</template>

<style scoped>
.ciudadano { display: flex; flex-direction: column; gap: 0.6rem; max-width: 26rem; }
.intro { margin: 0; font-size: 0.85rem; line-height: 1.45; }
.apoyos { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.85rem; }
.apoyos li { display: grid; grid-template-columns: 5rem 1fr 2rem; align-items: center; gap: 0.5rem; }
.apoyos strong { text-align: right; }
.barra { height: 8px; border-radius: calc(var(--t-radio) * 4px); background: rgb(var(--t-tinta) / 0.12); overflow: hidden; }
.lleno { display: block; height: 100%; background: rgb(var(--t-exito)); }
.lleno.bajo { background: rgb(var(--t-peligro)); }
.alerta { color: rgb(var(--t-alerta)); font-size: 0.75rem; font-style: normal; }
.botones { display: flex; gap: 0.5rem; }
.botones button {
  flex: 1; min-height: 44px; border-radius: calc(var(--t-radio) * 6px); cursor: pointer; font-size: 0.85rem; font-weight: bold;
  color: rgb(var(--t-texto)); border: 1px solid rgb(var(--t-tinta) / 0.2);
}
.btn-apoyar { background: rgb(var(--t-exito-fuerte)); }
.btn-protestar { background: rgb(var(--t-peligro-fuerte)); }
.botones button:disabled { opacity: 0.6; cursor: not-allowed; }
small { opacity: 0.8; font-size: 0.75rem; }
</style>
