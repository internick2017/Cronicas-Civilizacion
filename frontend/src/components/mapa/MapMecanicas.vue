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
  { clave: 'gobierno', icono: '🏛️', nombre: 'Gobierno', ayuda: 'Tipos de gobierno, apoyo, elecciones, impuestos, Estado federal y subdivisiones.' },
  { clave: 'problemas', icono: '⚠️', nombre: 'Problemas sociales', ayuda: 'Las ciudades del Estado federal acumulan problemas que hay que resolver.', requiere: 'gobierno' },
  { clave: 'levantamientos', icono: '✊', nombre: 'Golpes y revoluciones', ayuda: 'Con poco apoyo, un grupo se puede alzar e imponer otro gobierno.', requiere: 'gobierno' },
  { clave: 'razas', icono: '🧝', nombre: 'Razas', ayuda: 'Cada jugador elige una raza con sus ventajas y desventajas.' },
  { clave: 'fronteras', icono: '🧱', nombre: 'Fronteras que se recuperan', ayuda: 'Las ciudades recuperan al cerrar la ronda la tierra que les tomaron alrededor.' },
  { clave: 'niebla', icono: '🌫️', nombre: 'Niebla', ayuda: 'Apagada, todos ven el mapa entero desde el principio.' },
]

// Atajos para no tener que tocar siete casillas. "Solo guerra" es el juego de
// antes de que existieran las mecanicas elegibles.
const BASE = ['razas', 'fronteras', 'niebla']
const ATAJOS = [
  { nombre: 'Todas', prendidas: MECANICAS.map(m => m.clave) },
  { nombre: 'Solo guerra', prendidas: BASE },
  { nombre: 'Economía', prendidas: [...BASE, 'ciencia', 'moneda', 'capital'] },
  { nombre: 'Política', prendidas: [...BASE, 'alianzas', 'gobierno', 'capital', 'problemas', 'levantamientos'] },
]

const mecanicas = defineModel({ type: Object, required: true })
// Que poderes existen en la partida. Solo se eligen con Gobierno prendido; el Ejecutivo no se apaga.
const poderes = defineModel('poderes', { type: Object, required: true })
const props = defineProps({ listaPoderes: { type: Array, default: () => [] } })
const elegibles = computed(() => props.listaPoderes.filter(p => p.clave !== 'ejecutivo'))
const visibles = computed(() => MECANICAS.filter(m => !m.requiere || mecanicas.value[m.requiere]))
const cambiarPoder = (clave, prendido) => {
  poderes.value = { ...poderes.value, [clave]: prendido }
}
const todosLosPoderes = (prendidos) => {
  poderes.value = Object.fromEntries(elegibles.value.map(p => [p.clave, prendidos]))
}
const poderesPrendidos = computed(() => elegibles.value.filter(p => poderes.value[p.clave] !== false).length)

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
      v-for="m in visibles"
      :key="m.clave"
      class="tarjeta"
      :class="{ prendida: mecanicas[m.clave] }"
    >
      <input type="checkbox" :checked="mecanicas[m.clave]" @change="cambiar(m.clave, $event.target.checked)" />
      <span class="tarjeta-nombre">{{ m.icono }} {{ m.nombre }}</span>
      <small>{{ m.ayuda }}</small>
    </label>
    <template v-if="mecanicas.gobierno && elegibles.length">
      <div class="atajos subtitulo">
        <strong>Poderes que existen</strong>
        <button type="button" class="atajo" @click="todosLosPoderes(true)">Todos</button>
        <button type="button" class="atajo" @click="todosLosPoderes(false)">Ninguno</button>
        <span class="contador">{{ poderesPrendidos }} de {{ elegibles.length }}</span>
      </div>
      <p class="nota">El Ejecutivo siempre existe. Un poder apagado no lo tiene ningún gobierno de esta partida.</p>
      <label
        v-for="p in elegibles"
        :key="p.clave"
        class="tarjeta"
        :class="{ prendida: poderes[p.clave] !== false }"
      >
        <input type="checkbox" :checked="poderes[p.clave] !== false" @change="cambiarPoder(p.clave, $event.target.checked)" />
        <span class="tarjeta-nombre">{{ p.nombre }}</span>
        <small>{{ p.funcion }}</small>
      </label>
    </template>
  </div>
</template>

<style scoped>
.mecanicas { display: flex; flex-direction: column; gap: 0.4rem; }
.atajos { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; }
.atajo {
  background: rgb(var(--t-tinta) / 0.08);
  color: rgb(var(--t-texto));
  border: 1px solid rgb(var(--t-tinta) / 0.15);
  border-radius: calc(var(--t-radio) * 6px);
  padding: 0.2rem 0.55rem;
  min-height: 44px;
  font-size: 0.75rem;
  cursor: pointer;
}
.atajo.elegido { border-color: rgb(var(--t-exito)); background: rgb(var(--t-exito) / 0.18); }
.subtitulo { margin-top: 0.5rem; font-size: 0.85rem; }
.contador { margin-left: auto; font-size: 0.75rem; color: rgb(var(--t-texto-tenue)); }
.nota { margin: 0; font-size: 0.75rem; color: rgb(var(--t-texto-tenue)); }
.tarjeta {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 0.5rem;
  align-items: center;
  padding: 0.45rem 0.6rem;
  border-radius: calc(var(--t-radio) * 8px);
  border: 1px solid rgb(var(--t-tinta) / 0.12);
  background: rgb(var(--t-tinta) / 0.03);
  opacity: 0.6;
  cursor: pointer;
  font-size: 0.88rem;
}
.tarjeta.prendida { opacity: 1; border-color: rgb(var(--t-exito) / 0.6); background: rgb(var(--t-exito) / 0.1); }
.tarjeta-nombre { font-weight: 600; }
.tarjeta small { grid-column: 2; color: rgb(var(--t-texto-tenue)); }
</style>
