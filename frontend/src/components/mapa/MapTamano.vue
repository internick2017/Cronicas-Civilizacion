<script setup>
import { computed } from 'vue'

// Tamaño libre del mapa: deslizador + numero + atajos. Los limites vienen del
// backend (es una regla del juego, no de la pantalla).
const props = defineProps({
  min: { type: Number, default: 10 },
  max: { type: Number, default: 60 },
})
const tamano = defineModel({ type: Number, required: true })

const ATAJOS = [
  { valor: 10, etiqueta: 'Mini' },
  { valor: 14, etiqueta: 'Chico' },
  { valor: 20, etiqueta: 'Mediano' },
  { valor: 28, etiqueta: 'Grande' },
  { valor: 36, etiqueta: 'Enorme' },
  { valor: 60, etiqueta: 'Gigante' },
]

const AVISO_DESDE = 36

const casillas = computed(() => (tamano.value * tamano.value).toLocaleString('es'))

// Al escribir se acepta cualquier cosa; al salir del campo se corrige al rango.
const fijar = (crudo) => {
  const n = Math.round(Number(crudo))
  tamano.value = Number.isFinite(n) ? Math.min(props.max, Math.max(props.min, n)) : 20
}
</script>

<template>
  <div class="tamano">
    <div class="tamano-fila">
      <input
        class="tamano-rango"
        type="range"
        :min="min"
        :max="max"
        :value="tamano"
        aria-label="Tamaño del mapa"
        @input="fijar($event.target.value)"
      />
      <input
        class="tamano-numero"
        type="number"
        :min="min"
        :max="max"
        :value="tamano"
        aria-label="Tamaño del mapa en casillas por lado"
        @change="fijar($event.target.value); $event.target.value = tamano"
      />
    </div>
    <p class="tamano-resumen">{{ tamano }}×{{ tamano }} = {{ casillas }} casillas ({{ min }} a {{ max }})</p>
    <!-- Medido con maquinas dificiles (300 rondas): en 36 terminó 1 de 2 partidas y en 60 ninguna. -->
    <p v-if="tamano >= AVISO_DESDE" class="tamano-aviso">
      Mapa grande: la partida puede durar cientos de rondas. Conviene bajar la
      dominación para ganar o poner un límite de rondas (más abajo).
    </p>
    <div class="tamano-atajos">
      <button
        v-for="a in ATAJOS"
        :key="a.valor"
        type="button"
        class="atajo"
        :class="{ elegido: tamano === a.valor }"
        @click="fijar(a.valor)"
      >{{ a.etiqueta }} {{ a.valor }}</button>
    </div>
  </div>
</template>

<style scoped>
.tamano-fila { display: flex; align-items: center; gap: 0.6rem; }
.tamano-rango { flex: 1; }
.tamano-numero {
  width: 4.5rem;
  background: rgb(var(--t-tinta) / 0.1);
  border: 1px solid rgb(var(--t-tinta) / 0.15);
  border-radius: calc(var(--t-radio) * 6px);
  padding: 0.4rem;
  color: rgb(var(--t-texto));
  text-align: center;
}
.tamano-resumen { margin: 0.35rem 0; font-size: 0.8rem; color: rgb(var(--t-texto-tenue)); }
.tamano-aviso { margin: 0 0 0.4rem; font-size: 0.78rem; color: rgb(var(--t-aviso)); }
.tamano-atajos { display: flex; flex-wrap: wrap; gap: 0.3rem; }
.atajo {
  background: rgb(var(--t-tinta) / 0.08);
  color: rgb(var(--t-texto));
  border: 1px solid rgb(var(--t-tinta) / 0.15);
  border-radius: calc(var(--t-radio) * 6px);
  padding: 0.2rem 0.5rem;
  min-height: 44px;
  font-size: 0.75rem;
  cursor: pointer;
}
.atajo.elegido { border-color: rgb(var(--t-exito)); background: rgb(var(--t-exito) / 0.18); }
</style>
