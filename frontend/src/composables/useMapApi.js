import axios from 'axios'
import config from '../config/env.js'
import { transporteActivo } from '../online/transporte.js'

const api = axios.create({
  baseURL: `${config.api.baseUrl}/api/map`,
  // Una accion (sobre todo pasar el turno, que juega a los bots) hace varias consultas a la
  // base; en el servidor gratis puede pasar de los 10 s generales y el navegador la cortaba.
  timeout: 60000,
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
  const crearPartida = ({ nombre, contraIA, dificultadIA, bots, config }) =>
    api.post('/', { nombre, contraIA, dificultadIA, bots, config })

  const unirse = (idOCodigo, { id, nombre, civilizacion, raza, cargos }) =>
    api.post(`/${idOCodigo}/unirse`, { id, nombre, civilizacion, raza, cargos })

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

  // En el modo online (ver online/transporte.js) las mismas llamadas viajan por WebRTC al
  // navegador del anfitrion; el resto de la interfaz no se entera.
  const via = (metodo, http) => (...args) => {
    const t = transporteActivo()
    return t ? t.llamar(metodo, args) : http(...args)
  }

  return {
    crearPartida: via('crearPartida', crearPartida),
    unirse: via('unirse', unirse),
    iniciar: via('iniciar', iniciar),
    accion: via('accion', accion),
    vista: via('vista', vista),
    listarPartidas: via('listarPartidas', listarPartidas),
    obtenerConstantes: via('obtenerConstantes', obtenerConstantes),
  }
}
