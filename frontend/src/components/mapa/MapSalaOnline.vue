<!-- frontend/src/components/mapa/MapSalaOnline.vue -->
<!-- Jugar online entre amigos SIN servidor: uno es el anfitrion (su navegador corre la
     partida) y los demas entran con el codigo. Ver online/anfitrion.js y online/cliente.js. -->
<script setup>
import { ref } from 'vue'
import { crearAnfitrion } from '../../online/anfitrion.js'
import { conectarAAnfitrion } from '../../online/cliente.js'
import { transporteActivo, usarTransporte } from '../../online/transporte.js'

const emit = defineEmits(['cambio'])

const previo = transporteActivo()
const sala = ref(previo ? { codigo: previo.codigo, anfitrion: Boolean(previo.anfitrion) } : null)
const codigo = ref('')
const trabajando = ref(false)
const error = ref('')

// No se cierra el transporte al desmontar: este panel se va cuando empieza la partida,
// y la partida sigue usando la misma conexion.
const abrir = async (obtener) => {
  trabajando.value = true
  error.value = ''
  try {
    const t = await obtener()
    usarTransporte(t)
    sala.value = { codigo: t.codigo, anfitrion: Boolean(t.anfitrion) }
    emit('cambio')
  } catch (err) {
    error.value = err.mensaje || 'No se pudo abrir la sala online.'
  } finally {
    trabajando.value = false
  }
}

const salir = () => {
  usarTransporte(null)
  sala.value = null
  emit('cambio')
}
</script>

<template>
  <details class="panel plegable" :open="Boolean(sala)">
    <summary>🌐 Online con amigos <small>{{ sala ? (sala.codigo ? `sala ${sala.codigo}` : 'sin conexión') : 'sin servidor' }}</small></summary>

    <div v-if="error" class="online-error" role="alert">{{ error }}</div>

    <template v-if="sala && !sala.codigo">
      <p class="ayuda">
        Jugando sin conexión: tu navegador es el servidor y no hace falta internet. Si recargás o cerrás la página, la partida se pierde.
      </p>
      <button class="btn-secondary" @click="salir">Volver al servidor</button>
    </template>

    <template v-else-if="sala">
      <p class="ayuda">
        <template v-if="sala.anfitrion">
          Sos el anfitrión. Pasales este código a tus amigos. <strong>Mientras tengas esta página abierta,
          tu navegador es el servidor</strong>: si la cerrás, la partida termina para todos.
        </template>
        <template v-else>Conectado a la sala del anfitrión. Creá o unite a una partida abajo.</template>
      </p>
      <p class="codigo">{{ sala.codigo }}</p>
      <button class="btn-secondary" @click="salir">Salir de la sala online</button>
    </template>

    <template v-else>
      <p class="ayuda">
        Sin servidor: uno de ustedes hospeda la partida en su navegador y los demás se conectan directo con un código.
      </p>
      <button class="btn-primary" :disabled="trabajando" :aria-busy="trabajando" @click="abrir(crearAnfitrion)">
        {{ trabajando ? 'Abriendo…' : 'Ser el anfitrión' }}
      </button>
      <button class="btn-secondary" :disabled="trabajando" @click="abrir(() => crearAnfitrion({ local: true }))">
        Jugar sin conexión
      </button>
      <label class="field">
        Código de la sala de tu amigo (anfitrión)
        <input v-model="codigo" type="text" maxlength="6" placeholder="ABC123" />
      </label>
      <button
        class="btn-secondary"
        :disabled="trabajando || codigo.trim().length < 6"
        :aria-busy="trabajando"
        @click="abrir(() => conectarAAnfitrion(codigo))"
      >
        {{ trabajando ? 'Conectando…' : 'Conectarme a un amigo' }}
      </button>
    </template>
  </details>
</template>

<style scoped>
/* Los estilos de MapLobby son "scoped": no llegan a los hijos (salvo a su elemento raiz), asi que
   lo que este panel usa por dentro se repite aqui. */
summary {
  display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
  min-height: 44px; padding: 0.4rem 0; cursor: pointer; font-weight: 600;
}
summary small { color: rgb(var(--t-texto-suave)); font-weight: 400; margin-left: auto; }
.ayuda { color: rgb(var(--t-texto-suave)); font-size: 0.85rem; margin: 0.25rem 0 0.75rem; }
.codigo {
  font-size: 2rem; font-weight: bold; letter-spacing: 0.3rem;
  color: rgb(var(--t-info)); margin: 0.5rem 0; text-align: center;
}
.field { display: flex; flex-direction: column; gap: 0.35rem; margin: 0.75rem 0; font-size: 0.9rem; }
.field input {
  background: rgb(var(--t-control)); border: 1px solid rgb(var(--t-tinta) / 0.15);
  border-radius: calc(var(--t-radio) * 6px); padding: 0.5rem; min-height: 44px; color: rgb(var(--t-texto));
}
.btn-primary, .btn-secondary {
  display: block; width: 100%; margin-bottom: 0.5rem; min-height: 44px; padding: 0.5rem 1rem;
  border-radius: calc(var(--t-radio) * 6px); cursor: pointer;
}
.btn-primary { background: rgb(var(--t-cta)); color: rgb(var(--t-sobre-cta)); border: none; }
.btn-secondary { background: rgb(var(--t-tinta) / 0.1); color: rgb(var(--t-texto)); border: 1px solid rgb(var(--t-tinta) / 0.15); }
.btn-primary:disabled, .btn-secondary:disabled { opacity: 0.6; cursor: not-allowed; }
.online-error {
  color: rgb(var(--t-texto));
  background: rgb(var(--t-tinta) / 0.08);
  border-radius: 8px;
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.5rem;
}
</style>
