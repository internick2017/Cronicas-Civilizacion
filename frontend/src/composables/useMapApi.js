import axios from 'axios'
import config from '../config/env.js'

const api = axios.create({
  baseURL: `${config.api.baseUrl}/api/map`,
  timeout: config.api.timeout,
  headers: { 'Content-Type': 'application/json' }
})

api.interceptors.response.use(
  (response) => response.data,
  (error) => Promise.reject(error.response?.data || error)
)

export function useMapApi() {
  // `config` lleva los parametros que se eligen en el lobby (objetivo de
  // territorio, tamaño del mapa, limite de rondas). El backend los valida y los
  // guarda en la partida; la interfaz despues los lee de la vista, no de las
  // constantes globales, porque cada partida puede tener los suyos.
  const crearPartida = ({ nombre, contraIA, dificultadIA, config }) =>
    api.post('/', { nombre, contraIA, dificultadIA, config })

  const unirse = (idOCodigo, { id, nombre, civilizacion }) =>
    api.post(`/${idOCodigo}/unirse`, { id, nombre, civilizacion })

  const iniciar = (id) => api.post(`/${id}/iniciar`)

  const accion = (id, jugadorId, token, { tipo, ...datos }) =>
    api.post(`/${id}/accion`, { jugadorId, tipo, ...datos }, {
      headers: { 'X-Jugador-Token': token }
    })

  const vista = (id, jugadorId, token) =>
    api.get(`/${id}`, {
      params: { jugadorId },
      headers: { 'X-Jugador-Token': token }
    })

  const listarPartidas = () => api.get('/')

  const obtenerConstantes = () => api.get('/constantes')

  return { crearPartida, unirse, iniciar, accion, vista, listarPartidas, obtenerConstantes }
}
