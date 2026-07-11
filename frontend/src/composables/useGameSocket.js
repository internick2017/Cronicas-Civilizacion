import { ref } from 'vue'
import { io } from 'socket.io-client'
import config from '../config/env.js'

const socket = ref(null)
const isConnected = ref(false)

export function useGameSocket() {
  const connectSocket = () => {
    return new Promise((resolve, reject) => {
      if (!socket.value) {
        socket.value = io(config.socket.url, {
          ...config.socket.options
        })

        socket.value.on('connect', () => {
          isConnected.value = true
          console.log('Connected to game server')
          resolve(socket.value)
        })

        socket.value.on('disconnect', () => {
          isConnected.value = false
          console.log('Disconnected from game server')
        })

        socket.value.on('connect_error', (error) => {
          console.error('Connection error:', error)
          reject(error)
        })
      }

      if (socket.value.connected) {
        resolve(socket.value)
      } else {
        socket.value.connect()
      }
    })
  }

  const disconnectSocket = () => {
    if (socket.value) {
      socket.value.disconnect()
      socket.value = null
      isConnected.value = false
    }
  }

  const emit = (event, data) => {
    if (socket.value && socket.value.connected) {
      socket.value.emit(event, data)
    }
  }

  const on = (event, callback) => {
    if (socket.value) {
      socket.value.on(event, callback)
    }
  }

  const off = (event, callback) => {
    if (socket.value) {
      socket.value.off(event, callback)
    }
  }

  return {
    socket,
    isConnected,
    connectSocket,
    disconnectSocket,
    emit,
    on,
    off
  }
} 