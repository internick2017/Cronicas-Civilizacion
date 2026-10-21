<script setup>
import { computed } from 'vue'

// La clave es la que entiende el backend (config.mecanicas); el nombre es solo la etiqueta.
const MECANICAS = [
  { clave: 'ciencia', icono: '🔬', nombre: 'Ciencia', ayuda: 'Tecnologías, biblioteca, universidad y subir de nivel las ciudades.' },
  { clave: 'cultura', icono: '🎭', nombre: 'Cultura', ayuda: 'Rasgos culturales.' },
  { clave: 'armada', icono: '⚓', nombre: 'Buques de guerra', ayuda: 'Solo los barcos que pelean. El transporte y las tropas de tierra siguen.' },
  { clave: 'alianzas', icono: '🤝', nombre: 'Alianzas', ayuda: 'Aliarse y regalarse recursos.' },
  { clave: 'moneda', icono: '💰', nombre: 'Moneda', ayuda: 'Nombre propio de la moneda y acuñar oro.' },
  { clave: 'capital', icono: '🏰', nombre: 'Capital', ayuda: 'La capital rinde y defiende más, y se puede mudar.' },
  { clave: 'gobierno', icono: '🏛️', nombre: 'Gobierno', ayuda: 'Tipos de gobierno, apoyo, elecciones, impuestos, Estado federal, subdivisiones y problemas sociales.' },
]

// Atajos para no tener que tocar siete casillas. "Solo guerra" es el juego de
// antes de que existieran las mecanicas elegibles.
const ATAJOS = [
  { nombre: 'Todas', prendidas: MECANICAS.map(m => m.clave) },
  { nombre: 'Solo guerra', prendidas: [] },
  { nombre: 'Economía', prendidas: ['ciencia', 'moneda', 'capital'] },
  { nombre: 'Política', prendidas: ['alianzas', 'gobierno', 'capital'] },
]

const mecanicas = defineModel({ type: Object, required: true })

const cambiar = (clave, prendida) => {
  mecanicas.value = { ...mecanicas.value, [clave]: prendida }
}

const aplicar = (atajo) => {
  mecanicas.value = Object.fromEntries(MECANICAS.map(m => [m.clave, atajo.prendidas.includes(m.clave)]))
}

const cantidad = computed(() => MECANICAS.filter(m => mecanicas.value[m.clave]).length)
const esAtajo = (atajo) =>
  MECANICAS.every(m => Boolean(mecanicas.value[m.clave]) === atajo.prendidas.includes(m.clave))
</script>

<template>
  <div class="mecanicas">
    <div class="atajos">
      <button
        v-for="a in ATAJOS"
        :key="a.nombre"
        type="button"
        class="atajo"
        :class="{ elegido: esAtajo(a) }"
        @click="aplicar(a)"
      >{{ a.nombre }}</button>
      <span class="contador">{{ cantidad }} de {{ MECANICAS.length }} prendidas</span>
    </div>
    <p class="nota">Cada casilla es por partida: apagar una no la borra del juego, solo no aparece en esta partida.</p>
    <label
      v-for="m in MECANICAS"
      :key="m.clave"
      class="tarjeta"
      :class="{ prendida: mecanicas[m.clave] }"
    >
      <input type="checkbox" :checked="mecanicas[m.clave]" @change="cambiar(m.clave, $event.target.checked)" />
      <span class="tarjeta-nombre">{{ m.icono }} {{ m.nombre }}</span>
      <small>{{ m.ayuda }}</small>
    </label>
  </div>
</template>

<style scoped>
.mecanicas { display: flex; flex-direction: column; gap: 0.4rem; }
.atajos { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; }
.atajo {
  background: rgba(255, 255, 255, 0.08);
  color: #ecf0f1;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  padding: 0.2rem 0.55rem;
  font-size: 0.78rem;
  cursor: pointer;
}
.atajo.elegido { border-color: #2ecc71; background: rgba(46, 204, 113, 0.18); }
.contador { margin-left: auto; font-size: 0.75rem; color: #95a5a6; }
.nota { margin: 0; font-size: 0.75rem; color: #95a5a6; }
.tarjeta {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 0.5rem;
  align-items: center;
  padding: 0.45rem 0.6rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.03);
  opacity: 0.6;
  cursor: pointer;
  font-size: 0.88rem;
}
.tarjeta.prendida { opacity: 1; border-color: rgba(46, 204, 113, 0.6); background: rgba(46, 204, 113, 0.1); }
.tarjeta-nombre { font-weight: 600; }
.tarjeta small { grid-column: 2; color: #95a5a6; }
</style>
