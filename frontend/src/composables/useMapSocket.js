import { ref } from 'vue'
import { io } from 'socket.io-client'
import config from '../config/env.js'

const socket = ref(null)

export function useMapSocket() {
  // El servidor olvida en que sala estaba un socket apenas se corta, y
  // socket.io-client se reconecta solo pero NO vuelve a entrar a ninguna. Por
  // eso unirse va colgado de CADA 'connect', no una sola vez al montar: un
  // celular que bloquea la pantalla o una WiFi que parpadea dejaba al jugador
  // conectado y sordo, sin ver las jugadas del rival hasta apretar F5.
  //
  // `alUnirse` avisa cada vez que se entro a la sala, para que quien llama
  // pida la vista de nuevo: lo que el servidor emitio durante el corte no se
  // reenvia.
  const seguirPartida = (gameId, jugadorId, token, { alEstado, alNarrativa, alUnirse }) => {
    if (!socket.value) {
      socket.value = io(config.socket.url, config.socket.options)
    }
    const s = socket.value
    s.on('connect', () => {
      s.emit('map:join', gameId, jugadorId, token, (unido) => {
        if (unido) alUnirse()
      })
    })
    s.on('estado', alEstado)
    s.on('narrativa', alNarrativa)
    s.connect()
  }

  const desconectar = () => {
    if (socket.value) {
      socket.value.disconnect()
      socket.value = null
    }
  }

  return { seguirPartida, desconectar }
}
