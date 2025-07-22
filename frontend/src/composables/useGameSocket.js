import { ref } from 'vue'
import { io } from 'socket.io-client'

const socket = ref(null)
const isConnected = ref(false)

export function useGameSocket() {
  const connectSocket = () => {
    if (!socket.value) {
      socket.value = io('http://localhost:3000', {
        transports: ['websocket'],
        autoConnect: false
      })

      socket.value.on('connect', () => {
        isConnected.value = true
        console.log('Connected to game server')
      })

      socket.value.on('disconnect', () => {
        isConnected.value = false
        console.log('Disconnected from game server')
      })

      socket.value.on('connect_error', (error) => {
        console.error('Connection error:', error)
      })
    }

    if (!socket.value.connected) {
      socket.value.connect()
    }
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
    socket: socket.value,
    isConnected,
    connectSocket,
    disconnectSocket,
    emit,
    on,
    off
  }
} 