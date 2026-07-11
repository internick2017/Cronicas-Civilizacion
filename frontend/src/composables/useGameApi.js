import axios from 'axios'
import config from '../config/env.js'

const api = axios.create({
  baseURL: `${config.api.baseUrl}/api`,
  timeout: config.api.timeout,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Request interceptor
api.interceptors.request.use(
  (config) => {
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

  const deleteGameApi = async (gameId) => {
    return await api.delete(`/games/${gameId}`)
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
    deleteGameApi,
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