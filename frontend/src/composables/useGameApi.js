import axios from 'axios'

const API_BASE_URL = 'http://localhost:3000/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Request interceptor
api.interceptors.request.use(
  (config) => {
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`)
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response.data
  },
  (error) => {
    console.error('API Error:', error.response?.data || error.message)
    return Promise.reject(error.response?.data || error)
  }
)

export function useGameApi() {
  // Game endpoints
  const getGamesApi = async () => {
    return await api.get('/games')
  }

  const getGameByIdApi = async (gameId) => {
    return await api.get(`/games/${gameId}`)
  }

  const createGameApi = async (gameData) => {
    return await api.post('/games', gameData)
  }

  const joinGameApi = async (gameId, playerId, civilizationName) => {
    return await api.post(`/games/${gameId}/join`, {
      playerId,
      civilizationName
    })
  }

  const leaveGameApi = async (gameId, playerId) => {
    return await api.post(`/games/${gameId}/leave`, {
      playerId
    })
  }

  const startGameApi = async (gameId) => {
    return await api.post(`/games/${gameId}/start`)
  }

  const performActionApi = async (gameId, playerId, action) => {
    return await api.post(`/games/${gameId}/action`, {
      playerId,
      action
    })
  }

  const getGameStateApi = async (gameId) => {
    return await api.get(`/games/${gameId}/state`)
  }

  // Player endpoints
  const createPlayerApi = async (playerData) => {
    return await api.post('/players', playerData)
  }

  const getPlayerApi = async (playerId) => {
    return await api.get(`/players/${playerId}`)
  }

  const updatePlayerApi = async (playerId, updates) => {
    return await api.put(`/players/${playerId}`, updates)
  }

  const getPlayerStatsApi = async (playerId) => {
    return await api.get(`/players/${playerId}/stats`)
  }

  const getPlayerGamesApi = async (playerId) => {
    return await api.get(`/players/${playerId}/games`)
  }

  // Health check
  const healthCheckApi = async () => {
    return await api.get('/health')
  }

  return {
    // Game methods
    getGamesApi,
    getGameByIdApi,
    createGameApi,
    joinGameApi,
    leaveGameApi,
    startGameApi,
    performActionApi,
    getGameStateApi,
    
    // Player methods
    createPlayerApi,
    getPlayerApi,
    updatePlayerApi,
    getPlayerStatsApi,
    getPlayerGamesApi,
    
    // Utility
    healthCheckApi
  }
} 