import { ref } from 'vue'
import { io } from 'socket.io-client'
import config from '../config/env.js'

const socket = ref(null)

export function useMapSocket() {
  const conectar = () => {
    return new Promise((resolve, reject) => {
      if (!socket.value) {
        socket.value = io(config.socket.url, config.socket.options)
      }
      if (socket.value.connected) {
        resolve(socket.value)
        return
      }
      socket.value.once('connect', () => resolve(socket.value))
      socket.value.once('connect_error', (error) => reject(error))
      socket.value.connect()
    })
  }

  const desconectar = () => {
    if (socket.value) {
      socket.value.disconnect()
      socket.value = null
    }
  }

  const unirseAPartida = (gameId, jugadorId, token) => {
    return new Promise((resolve) => {
      if (!socket.value || !socket.value.connected) {
        resolve(false)
        return
      }
      socket.value.emit('map:join', gameId, jugadorId, token, resolve)
    })
  }

  const onEstado = (callback) => {
    if (socket.value) socket.value.on('estado', callback)
  }

  return { conectar, desconectar, unirseAPartida, onEstado }
}
