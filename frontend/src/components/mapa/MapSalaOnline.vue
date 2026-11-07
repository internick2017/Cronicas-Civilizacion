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
    <summary>🌐 Online con amigos <small>{{ sala ? `sala ${sala.codigo}` : 'sin servidor' }}</small></summary>

    <div v-if="error" class="online-error" role="alert">{{ error }}</div>

    <template v-if="sala">
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
      <label class="field">
        Código de la sala
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
.online-error {
  color: rgb(var(--t-texto));
  background: rgb(var(--t-tinta) / 0.08);
  border-radius: 8px;
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.5rem;
}
</style>
