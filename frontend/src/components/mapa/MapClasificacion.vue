<!-- frontend/src/components/mapa/MapClasificacion.vue -->
<!-- Tabla de poder: quien va mas fuerte. Los numeros los calcula el backend (reglas/poder.js);
     con niebla de guerra solo llega la fila propia. -->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  vista: { type: Object, required: true },
  jugadorId: { type: String, required: true },
})

const filas = computed(() => (props.vista.clasificacion ?? []).map(f => ({
  ...f,
  nombre: props.vista.jugadores.find(j => j.id === f.id)?.nombre ?? f.id,
})))
// Con una sola fila (niebla) no hay "ranking" que mostrar, solo los propios numeros.
const hayRanking = computed(() => filas.value.length > 1)
</script>

<template>
  <details v-if="filas.length" class="clasificacion">
    <summary>📊 Poder</summary>
    <table>
      <thead>
        <tr>
          <th v-if="hayRanking">#</th>
          <th>País</th>
          <th title="Economía + infraestructura + territorio">Poder</th>
          <th title="Lo que produce por ronda">Eco</th>
          <th title="Edificios + nivel de las ciudades">Infra</th>
          <th title="Casillas de tierra">Terr</th>
          <th title="(economía + infraestructura) / territorio">Efic</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(f, i) in filas" :key="f.id" :class="{ yo: f.id === jugadorId }">
          <td v-if="hayRanking">{{ i + 1 }}</td>
          <td>{{ f.nombre }}</td>
          <td><strong>{{ f.poder }}</strong></td>
          <td>{{ f.economia }}</td>
          <td>{{ f.infraestructura }}</td>
          <td>{{ f.territorio }}</td>
          <td>{{ f.eficiencia }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="!hayRanking" class="nota">Con niebla de guerra no ves los números de los rivales.</p>
  </details>
</template>

<style scoped>
.clasificacion { margin: 0.5rem 0; font-size: 0.85rem; }
summary { cursor: pointer; font-weight: 600; min-height: 32px; display: flex; align-items: center; }
table { width: 100%; border-collapse: collapse; margin-top: 0.35rem; }
th, td { padding: 0.2rem 0.35rem; text-align: right; }
th:nth-child(1), td:nth-child(1), th:nth-child(2), td:nth-child(2) { text-align: left; }
th { color: rgb(var(--t-texto-suave)); font-weight: 500; }
tr.yo { background: rgb(var(--t-tinta) / 0.08); }
.nota { color: rgb(var(--t-texto-suave)); margin: 0.35rem 0 0; }
</style>
