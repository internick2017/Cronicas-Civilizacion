import { Peer } from 'peerjs'
import { MapGameService } from '@backend/services/MapGameService.js'
import { constantesPublicas } from '@backend/domain/mapa/constantesPublicas.js'
import { ReglaError } from '@backend/domain/mapa/errores.js'
import { esSalaAbandonada } from '@backend/domain/mapa/salas.js'
import { narrarRonda } from '@backend/domain/mapa/narradorLocal.js'
import { MemoriaRepo } from './MemoriaRepo.js'
import { PREFIJO, codigoDeSala } from './sala.js'

// Mismo formato de error que el servidor HTTP (manejarError en mapRoutes.js): la interfaz
// lee `err.mensaje` y `err.codigo`.
const MUTAN = new Set(['crearPartida', 'unirse', 'iniciar', 'accion'])

function aErrorPlano(err) {
  if (err instanceof ReglaError) return { codigo: err.codigo, mensaje: err.message }
  console.error('Error en el anfitrion:', err)
  return { codigo: 'ERROR_INTERNO', mensaje: 'Error interno del anfitrión' }
}

// Registra un id con el broker; si el codigo ya esta tomado, prueba otro.
// Con `fijo` (un anfitrion de reemplazo) se reclama ESE codigo, sin probar otros.
function abrirPeer(fijo) {
  return new Promise((resolve, reject) => {
    const intentar = (n) => {
      const codigo = fijo ?? codigoDeSala()
      const peer = new Peer(PREFIJO + codigo)
      const alError = (e) => {
        peer.destroy()
        if (e.type === 'unavailable-id' && !fijo && n < 5) intentar(n + 1)
        else reject({ codigo: 'SIN_BROKER', mensaje: 'No se pudo abrir la sala online. Revisá tu conexión a internet.' })
      }
      peer.on('error', alError)
      peer.on('open', () => {
        peer.off('error', alError) // despues de abrir, un error suelto no debe destruir la sala
        peer.on('error', (e) => console.warn('PeerJS:', e.type))
        resolve({ peer, codigo })
      })
    }
    intentar(0)
  })
}

/**
 * Convierte ESTE navegador en el servidor de la partida. Corre el mismo MapGameService
 * del backend, con un repositorio en memoria, y atiende a los demas jugadores por WebRTC.
 * Devuelve un transporte (ver transporte.js) para que la interfaz del anfitrion tambien
 * juegue a traves de el, sin red.
 */
export async function crearAnfitrion({ codigo: fijo, copia } = {}) {
  const { peer, codigo } = await abrirPeer(fijo)
  const repo = new MemoriaRepo()
  if (copia) repo.importar(copia)
  // `${gameId}:${jugadorId}` -> funcion que recibe (evento, payload). Es el equivalente
  // de las salas de socket.io `map:${id}:${jugadorId}` del servidor: cada jugador recibe
  // SOLO su vista.
  const suscriptores = new Map()

  // Respaldo: tras cada cambio (con una pausa para juntar varios) cada amigo recibe una copia
  // completa. `ordenes` dice quienes siguen conectados; el de menor orden retoma si el anfitrion cae.
  const conexiones = new Map() // conn -> orden
  let proximoOrden = 1
  let pausa = null
  const difundirCopia = () => {
    clearTimeout(pausa)
    pausa = setTimeout(() => {
      const ordenes = [...conexiones.values()]
      const datos = repo.exportar()
      conexiones.forEach((orden, conn) => { if (conn.open) conn.send({ k: 'copia', orden, ordenes, datos }) })
    }, 400)
  }
  const servicio = new MapGameService({
    repo,
    narrador: (eventos, jugadores) => narrarRonda(eventos, jugadores),
    emitir: (gameId, jugadorId, evento, payload) => {
      suscriptores.get(`${gameId}:${jugadorId}`)?.(evento, payload)
      difundirCopia()
    },
  })

  // Lo UNICO que un amigo puede pedirle al anfitrion. Mismos argumentos que useMapApi.
  const metodos = {
    crearPartida: ({ nombre, contraIA, dificultadIA, bots, config }) =>
      servicio.crearPartida({ nombre, config, contraIA: Boolean(contraIA), dificultadIA, bots }),
    unirse: (id, { id: jugadorId, nombre, civilizacion, raza, cargos }) =>
      servicio.unirse(id, { id: jugadorId, nombre, civilizacion, raza, cargos }),
    iniciar: (id) => servicio.iniciar(id),
    accion: (id, jugadorId, token, { tipo, ...datos }) => servicio.accion(id, jugadorId, { tipo, ...datos }, token),
    vista: (id, jugadorId, token) => servicio.vista(id, jugadorId, token),
    listarPartidas: async () => (await repo.listarActivas())
      .filter(p => !esSalaAbandonada(p))
      .map(p => ({ ...p, actualizado: p.actualizado.toISOString() })),
    obtenerConstantes: async () => constantesPublicas(),
  }

  const ejecutar = async (metodo, args = []) => {
    const fn = Object.hasOwn(metodos, metodo) ? metodos[metodo] : null
    if (!fn) throw { codigo: 'METODO_DESCONOCIDO', mensaje: 'Operación no permitida' }
    try {
      const r = await fn(...args)
      if (MUTAN.has(metodo)) difundirCopia()
      return r
    } catch (err) { throw aErrorPlano(err) }
  }

  // Un amigo se conecta: atiende sus llamadas y le empuja los cambios de su vista.
  peer.on('connection', (conn) => {
    const mias = new Map() // clave -> funcion registrada por ESTA conexion
    conexiones.set(conn, proximoOrden++)
    conn.on('open', difundirCopia)
    conn.on('data', async (m) => {
      if (m?.k === 'rpc') {
        try { conn.send({ k: 'res', n: m.n, ok: true, datos: await ejecutar(m.metodo, m.args) }) }
        catch (error) { conn.send({ k: 'res', n: m.n, ok: false, error }) }
      } else if (m?.k === 'seguir') {
        try { await servicio.verificarToken(m.gameId, m.jugadorId, m.token) }
        catch { conn.send({ k: 'res', n: m.n, ok: true, datos: false }); return }
        const clave = `${m.gameId}:${m.jugadorId}`
        const enviar = (evento, payload) => { if (conn.open) conn.send({ k: 'push', evento, payload }) }
        suscriptores.set(clave, enviar)
        mias.set(clave, enviar)
        conn.send({ k: 'res', n: m.n, ok: true, datos: true })
      }
    })
    // Solo se borra lo que registro ESTA conexion: si el jugador ya volvio con otra, queda la nueva.
    conn.on('close', () => {
      conexiones.delete(conn)
      mias.forEach((fn, clave) => { if (suscriptores.get(clave) === fn) suscriptores.delete(clave) })
    })
  })

  const propias = []
  return {
    codigo,
    anfitrion: true,
    llamar: ejecutar,
    seguir(gameId, jugadorId, token, { alEstado, alNarrativa, alUnirse }) {
      servicio.verificarToken(gameId, jugadorId, token).then(() => {
        const clave = `${gameId}:${jugadorId}`
        propias.push(clave)
        suscriptores.set(clave, (evento, payload) => (evento === 'estado' ? alEstado(payload) : alNarrativa(payload)))
        alUnirse()
      }).catch(() => {})
    },
    dejar() { propias.splice(0).forEach(c => suscriptores.delete(c)) },
    cerrar() { clearTimeout(pausa); suscriptores.clear(); peer.destroy() },
  }
}
