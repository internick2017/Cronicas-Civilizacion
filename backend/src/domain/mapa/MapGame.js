import { randomUUID } from 'crypto';
import { generarMapa } from './generarMapa.js';
import { RECURSOS } from './constantes.js';
import { ReglaError } from './errores.js';

const CONFIG_DEFAULT = { tamanoMapa: 20, maxJugadores: 4, modoTurno: 'secuencial' };

export function crearEstado({ nombre, semilla, config = {} }) {
  const cfg = { ...CONFIG_DEFAULT, ...config };
  return {
    id: randomUUID(),
    nombre,
    estado: 'esperando',
    versionEsquema: 1,
    semilla: String(semilla),
    turno: 0,
    indiceJugadorActual: 0,
    config: cfg,
    jugadores: [],
    mapa: generarMapa(semilla, cfg.tamanoMapa),
    ganador: null,
  };
}

// El estado ya es un objeto plano serializable; estas funciones fijan el contrato.
export const toJSON = (estado) => structuredClone(estado);
export const fromJSON = (json) => structuredClone(json);

export function tileEn(estado, x, y) {
  const t = estado.config.tamanoMapa;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= t || y < 0 || y >= t) return null;
  return estado.mapa[y * t + x];
}

export const jugadorPorId = (estado, id) => estado.jugadores.find(j => j.id === id) ?? null;

export function puedePagar(jugador, costo) {
  for (const [recurso, cantidad] of Object.entries(costo)) {
    if (!RECURSOS.includes(recurso)) {
      throw new ReglaError('RECURSO_DESCONOCIDO', `Recurso desconocido: ${recurso}`);
    }
    if ((jugador.recursos[recurso] ?? 0) < cantidad) return false;
  }
  return true;
}
