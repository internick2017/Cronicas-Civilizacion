import { hashToken } from './crypto-navegador.js'

// Repositorio en memoria con la misma interfaz que backend/src/db/MapGameRepo.js.
// Lo usa el anfitrion del modo online: la partida vive en SU navegador, no en Neon.
// Se guarda JSON (no el objeto) para que cada lectura sea una copia aislada, igual que con la base.
export class MemoriaRepo {
  constructor() {
    this.partidas = new Map() // id -> { codigo, json, actualizado }
    this.eventos = new Map() // gameId -> [{ turno, tipo, jugadorId, datos }]
    this.narrativas = new Map() // gameId -> Map(turno -> texto)
    this.tokens = new Map() // `${gameId}:${jugadorId}` -> hash
  }

  // Copia completa en JSON plano: el anfitrion se la reparte a los amigos para que, si se cae,
  // otro pueda retomar la partida (ver anfitrion.js y cliente.js).
  exportar() {
    return {
      partidas: [...this.partidas].map(([id, f]) => [id, { codigo: f.codigo, json: f.json, actualizado: f.actualizado.toISOString() }]),
      eventos: [...this.eventos],
      narrativas: [...this.narrativas].map(([id, m]) => [id, [...m]]),
      tokens: [...this.tokens],
    }
  }

  importar(copia) {
    this.partidas = new Map(copia.partidas.map(([id, f]) => [id, { ...f, actualizado: new Date(f.actualizado) }]))
    this.eventos = new Map(copia.eventos)
    this.narrativas = new Map(copia.narrativas.map(([id, m]) => [id, new Map(m)]))
    this.tokens = new Map(copia.tokens)
  }

  guardar(estado, codigo) {
    this.partidas.set(estado.id, { codigo, json: JSON.stringify(estado), actualizado: new Date() })
  }

  cargar(id) {
    const fila = this.partidas.get(id)
    return fila ? JSON.parse(fila.json) : null
  }

  cargarPorCodigo(codigo) {
    for (const fila of this.partidas.values()) if (fila.codigo === codigo) return JSON.parse(fila.json)
    return null
  }

  agregarEventos(gameId, eventos) {
    const lista = this.eventos.get(gameId) ?? []
    for (const e of eventos) lista.push({ turno: e.turno, tipo: e.tipo, jugadorId: e.jugadorId ?? null, datos: structuredClone(e.datos) })
    this.eventos.set(gameId, lista)
  }

  contarEventos(gameId) {
    return (this.eventos.get(gameId) ?? []).length
  }

  eventosDeRonda(gameId, turno) {
    return (this.eventos.get(gameId) ?? []).filter(e => e.turno === turno).map(e => structuredClone(e))
  }

  guardarNarrativa(gameId, turno, texto) {
    const porTurno = this.narrativas.get(gameId) ?? new Map()
    porTurno.set(turno, texto)
    this.narrativas.set(gameId, porTurno)
  }

  narrativasDe(gameId, limite = 5) {
    const porTurno = this.narrativas.get(gameId) ?? new Map()
    return [...porTurno.entries()].sort((a, b) => a[0] - b[0]).map(([ronda, texto]) => ({ ronda, texto })).slice(-limite)
  }

  listarActivas() {
    return [...this.partidas.entries()].map(([id, f]) => {
      const e = JSON.parse(f.json)
      return { id, codigo: f.codigo, nombre: e.nombre, estado: e.estado, actualizado: f.actualizado }
    })
  }

  guardarToken(gameId, jugadorId, tokenHash) {
    this.tokens.set(`${gameId}:${jugadorId}`, tokenHash)
  }

  verificarToken(gameId, jugadorId, tokenPlano) {
    return this.tokens.get(`${gameId}:${jugadorId}`) === hashToken(tokenPlano)
  }
}
