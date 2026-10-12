<!-- frontend/src/components/mapa/MapAlianzas.vue -->
<script setup>
import { computed, reactive } from 'vue'
import { aliadosDe } from './alianzas.js'

const props = defineProps({
  vista: { type: Object, required: true },
  jugadorId: { type: String, required: true },
  // Lo ultimo que paso con una propuesta (la maquina contesta en el acto).
  aviso: { type: String, default: '' }
})
// Una accion del backend ya armada: { tipo, ...datos }.
const emit = defineEmits(['accion'])

const NOMBRE_RECURSO = {
  food: 'Comida', gold: 'Oro', wood: 'Madera', stone: 'Piedra', science: 'Ciencia', culture: 'Cultura'
}

const yo = computed(() => props.vista.jugadores.find(j => j.id === props.jugadorId))
const misAliados = computed(() => aliadosDe(props.vista, props.jugadorId))
const activos = computed(() => props.vista.jugadores.filter(j => j.activo))
// Los aliados ganan juntos, asi que con dos jugadores no puede haber alianza.
const hayLugarParaAlianzas = computed(() => activos.value.length > 2)

const recursos = computed(() => {
  const activosEnElModo = props.vista.reglas?.recursosActivos
  return Object.keys(yo.value?.recursos ?? {}).filter(r => !activosEnElModo || activosEnElModo.includes(r))
})

const estadoCon = (otro) => {
  if (misAliados.value.includes(otro.id)) return 'aliado'
  const propuestas = props.vista.propuestasAlianza ?? []
  if (propuestas.some(p => p.de === otro.id && p.para === props.jugadorId)) return 'me-propuso'
  if (propuestas.some(p => p.de === props.jugadorId && p.para === otro.id)) return 'le-propuse'
  if ((props.vista.treguas ?? []).some(t => t.con === otro.id)) return 'tregua'
  return 'nada'
}

const otros = computed(() =>
  activos.value.filter(j => j.id !== props.jugadorId).map(j => ({ ...j, estado: estadoCon(j) }))
)

// Un regalo por aliado: que recurso y cuanto.
const regalos = reactive({})
const regaloPara = (id) => (regalos[id] ??= { recurso: 'gold', cantidad: 10 })
const tengo = (recurso) => yo.value?.recursos?.[recurso] ?? 0
const cantidadValida = (id) => {
  const { recurso, cantidad } = regaloPara(id)
  return Number.isInteger(cantidad) && cantidad > 0 && cantidad <= tengo(recurso)
}
const regalar = (id) => {
  const { recurso, cantidad } = regaloPara(id)
  emit('accion', { tipo: 'regalarRecursos', para: id, recurso, cantidad })
}
</script>

<template>
  <div class="alianzas">
    <p class="explicacion">
      Los aliados <strong>ganan juntos</strong>: su territorio se suma para llegar al objetivo. No se
      atacan, ven lo mismo, pasan por la tierra del otro sin quitársela y se pueden regalar recursos.
    </p>
    <p v-if="!hayLugarParaAlianzas" class="aviso">
      Con dos jugadores no hay alianzas: tiene que quedar al menos un rival afuera.
    </p>
    <p v-if="aviso" class="aviso">{{ aviso }}</p>

    <ul class="lista">
      <li v-for="j in otros" :key="j.id" class="fila">
        <div class="quien">
          <span v-if="j.esBot" title="Jugador controlado por la máquina">🤖</span>
          <strong>{{ j.nombre }}</strong> <small>({{ j.civilizacion }})</small>
        </div>

        <template v-if="j.estado === 'aliado'">
          <span class="estado aliado">🤝 Aliado</span>
          <div class="regalo">
            <select v-model="regaloPara(j.id).recurso" aria-label="Recurso a regalar">
              <option v-for="r in recursos" :key="r" :value="r">{{ NOMBRE_RECURSO[r] || r }} ({{ tengo(r) }})</option>
            </select>
            <input v-model.number="regaloPara(j.id).cantidad" type="number" min="1" :max="tengo(regaloPara(j.id).recurso)" aria-label="Cantidad" />
            <button class="btn" :disabled="!cantidadValida(j.id)" @click="regalar(j.id)">Regalar</button>
          </div>
        </template>

        <template v-else-if="j.estado === 'me-propuso'">
          <span class="estado">Te propone una alianza</span>
          <div class="botones">
            <button class="btn btn-si" @click="emit('accion', { tipo: 'responderAlianza', de: j.id, aceptar: true })">Aceptar</button>
            <button class="btn" @click="emit('accion', { tipo: 'responderAlianza', de: j.id, aceptar: false })">Rechazar</button>
          </div>
        </template>

        <span v-else-if="j.estado === 'le-propuse'" class="estado">Esperando su respuesta…</span>

        <template v-else>
          <span v-if="j.estado === 'tregua'" class="estado">Tregua hasta la próxima ronda</span>
          <button
            class="btn"
            :disabled="!hayLugarParaAlianzas"
            @click="emit('accion', { tipo: 'proponerAlianza', para: j.id })"
          >
            Proponer alianza
          </button>
        </template>
      </li>
    </ul>

    <div v-if="misAliados.length" class="romper">
      <p>
        Si salís de la alianza hay <strong>tregua hasta que termine esta ronda</strong>: recién en la
        siguiente se pueden atacar.
      </p>
      <button class="btn btn-romper" @click="emit('accion', { tipo: 'romperAlianza' })">Salir de la alianza</button>
    </div>
  </div>
</template>

<style scoped>
.alianzas { display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.9rem; max-width: 520px; }
.explicacion, .romper p { margin: 0; line-height: 1.45; }
.aviso { margin: 0; color: #f1c40f; }
.lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.fila {
  display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.75rem;
  padding: 0.6rem; border-radius: 8px; background: rgba(255, 255, 255, 0.06);
}
.quien { flex: 1 1 140px; }
.quien small { opacity: 0.7; }
.estado { color: #bdc3c7; }
.estado.aliado { color: #2ecc71; font-weight: bold; }
.regalo, .botones { display: flex; flex-wrap: wrap; gap: 0.4rem; flex-basis: 100%; }
.regalo select, .regalo input {
  background: #34495e; color: #ecf0f1; border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px; padding: 0.45rem;
}
.regalo input { width: 5.5rem; }
.btn {
  background: rgba(255, 255, 255, 0.1); color: #ecf0f1; min-height: 40px;
  border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 6px; padding: 0.45rem 0.8rem; cursor: pointer;
}
.btn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.2); }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
.btn-si { background: #27ae60; border-color: #27ae60; }
.btn-romper { border-color: #e74c3c; color: #ffb3a8; }
.romper { display: flex; flex-direction: column; gap: 0.5rem; border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 0.75rem; }
</style>
