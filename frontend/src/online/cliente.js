import { Peer } from 'peerjs'
import { PREFIJO, normalizarCodigo } from './sala.js'
import { crearAnfitrion } from './anfitrion.js'

const CORTE = { codigo: 'SIN_CONEXION', mensaje: 'Se perdió la conexión con el anfitrión. Si cerró la página, la partida terminó.' }

const RECONECTANDO = { codigo: 'RECONECTANDO', mensaje: 'Se cayó el anfitrión. Reconectando con la sala…' }
const ESPERA_TOTAL = 60000 // pasado esto, la sala se da por perdida

/**
 * Se conecta al navegador de un amigo que es el anfitrion de una sala. Devuelve un
 * transporte (ver transporte.js) con la misma forma que el del anfitrion, pero que
 * manda cada llamada por WebRTC.
 */
export function conectarAAnfitrion(codigoCrudo) {
  const codigo = normalizarCodigo(codigoCrudo)
  return new Promise((resolve, reject) => {
    const peer = new Peer()
    let listo = false
    const fallo = (mensaje) => {
      if (listo) return
      clearTimeout(timer)
      peer.destroy()
      reject({ codigo: 'SIN_CONEXION', mensaje })
    }
    const timer = setTimeout(() => fallo('No se pudo conectar con el anfitrión. Revisá el código y que siga con la página abierta.'), 20000)
    peer.on('error', (e) => {
      if (listo) return console.warn('PeerJS:', e.type)
      fallo(e.type === 'peer-unavailable' ? 'No existe una sala con ese código.' : 'No se pudo conectar con el anfitrión.')
    })
    peer.on('open', () => {
      const conn = peer.connect(PREFIJO + codigo, { reliable: true })
      conn.on('error', () => fallo('No se pudo conectar con el anfitrión.'))
      conn.on('open', () => {
        listo = true
        clearTimeout(timer)
        resolve(armarTransporte(peer, conn, codigo))
      })
    })
  })
}

function armarTransporte(peer, conn0, codigo) {
  let n = 0
  let conn = conn0
  let cortado = false
  let reconectando = false
  let handlers = null
  let ultimoSeguir = null // [gameId, jugadorId, token], para volver a suscribirse tras reconectar
  let copia = null // ultima copia de la partida que mando el anfitrion
  let delegado = null // transporte de anfitrion, si este navegador tuvo que asumir
  let temporizadores = []
  const pendientes = new Map() // n -> { resolve, reject }

  const pedir = (mensaje) => new Promise((resolve, reject) => {
    if (cortado) return reject(CORTE)
    if (reconectando) return reject(RECONECTANDO)
    const id = ++n
    pendientes.set(id, { resolve, reject })
    conn.send({ ...mensaje, n: id })
  })

  const suscribir = () => {
    if (!ultimoSeguir) return
    const [gameId, jugadorId, token] = ultimoSeguir
    pedir({ k: 'seguir', gameId, jugadorId, token }).then((unido) => { if (unido) handlers?.alUnirse() }).catch(() => {})
  }

  const apagar = () => { temporizadores.forEach(clearTimeout); temporizadores = [] }
  const luego = (fn, ms) => temporizadores.push(setTimeout(fn, ms))

  // El anfitrion se cayo: se reintenta entrar a la misma sala y, segun el turno de cada uno,
  // alguien abre la sala de reemplazo con la ultima copia. Los demas la encuentran por el mismo codigo.
  const alPerderAnfitrion = () => {
    pendientes.forEach(p => p.reject(RECONECTANDO))
    pendientes.clear()
    if (cortado || delegado) return
    reconectando = true
    const limite = Date.now() + ESPERA_TOTAL

    const reintentar = () => {
      if (cortado || delegado || !reconectando) return
      if (Date.now() > limite) { reconectando = false; cortado = true; return }
      const c = peer.connect(PREFIJO + codigo, { reliable: true })
      let abierta = false
      c.on('open', () => {
        abierta = true
        if (!reconectando) return c.close()
        apagar()
        reconectando = false
        conn = c
        enlazar(c)
        suscribir()
      })
      luego(() => { if (!abierta) { c.close(); reintentar() } }, 3000)
    }

    const asumir = async () => {
      if (cortado || delegado || !reconectando) return
      try {
        const t = await crearAnfitrion({ codigo, copia: copia.datos })
        if (cortado || delegado) return t.cerrar()
        apagar()
        reconectando = false
        delegado = t
        peer.destroy()
        if (ultimoSeguir && handlers) t.seguir(...ultimoSeguir, handlers)
      } catch { /* otro ya es anfitrion: se sigue reintentando conectarse a el */ }
    }

    reintentar()
    if (copia) {
      // Turno por orden de entrada: el primero espera a que el broker libere el codigo, los demas mas.
      const puesto = [...copia.ordenes].sort((a, b) => a - b).indexOf(copia.orden)
      luego(asumir, 2000 + 4000 * Math.max(puesto, 0))
    }
  }

  const enlazar = (c) => {
    c.on('data', (m) => {
      if (m?.k === 'res') {
        const p = pendientes.get(m.n)
        if (!p) return
        pendientes.delete(m.n)
        if (m.ok) p.resolve(m.datos)
        else p.reject(m.error)
      } else if (m?.k === 'push' && handlers) {
        if (m.evento === 'estado') handlers.alEstado(m.payload)
        else if (m.evento === 'narrativa') handlers.alNarrativa(m.payload)
      } else if (m?.k === 'copia') {
        copia = m
      }
    })
    c.on('close', () => { if (c === conn) alPerderAnfitrion() })
  }
  enlazar(conn)

  return {
    codigo,
    get anfitrion() { return Boolean(delegado) },
    llamar: (metodo, args) => (delegado ? delegado.llamar(metodo, args) : pedir({ k: 'rpc', metodo, args })),
    seguir(gameId, jugadorId, token, h) {
      handlers = h
      ultimoSeguir = [gameId, jugadorId, token]
      if (delegado) delegado.seguir(gameId, jugadorId, token, h)
      else suscribir()
    },
    dejar() { handlers = null; ultimoSeguir = null; delegado?.dejar() },
    cerrar() { cortado = true; apagar(); delegado?.cerrar(); peer.destroy() },
  }
}
