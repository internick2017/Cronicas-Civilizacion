import { tileEn } from '../MapGame.js';
import { ReglaError } from '../errores.js';
import { validarTurno, evento, radioAlrededor } from './comun.js';
import { radioVision } from './cultura.js';

export function moverEjercito(estado, jugadorId, { desde, hasta }) {
  validarTurno(estado, jugadorId);

  const tileDesde = tileEn(estado, desde.x, desde.y);
  const tileHasta = tileEn(estado, hasta.x, hasta.y);
  if (!tileDesde || !tileHasta) throw new ReglaError('POSICION_INVALIDA', 'Posición inválida');

  if (!tileDesde.ejercito || tileDesde.ejercito.dueno !== jugadorId) {
    throw new ReglaError('SIN_EJERCITO', 'No tenés un ejército propio en esa casilla');
  }

  const distancia = Math.abs(hasta.x - desde.x) + Math.abs(hasta.y - desde.y);
  if (distancia !== 1) throw new ReglaError('DESTINO_NO_ADYACENTE', 'El destino no es adyacente');

  if (tileDesde.ejercito.movimientoRestante <= 0) {
    throw new ReglaError('UNIDAD_SIN_MOVIMIENTO', 'La unidad no tiene movimiento restante');
  }

  if (tileHasta.terreno === 'water') {
    throw new ReglaError('TERRENO_INTRANSITABLE', 'El agua es intransitable');
  }

  const esEnemigo =
    (tileHasta.dueno && tileHasta.dueno !== jugadorId) ||
    (tileHasta.ejercito && tileHasta.ejercito.dueno !== jugadorId) ||
    (tileHasta.ciudad && tileHasta.dueno !== jugadorId);
  if (esEnemigo) throw new ReglaError('OBJETIVO_INVALIDO', 'La casilla es enemiga; usá atacar');

  if (tileHasta.ejercito && tileHasta.ejercito.dueno === jugadorId) {
    throw new ReglaError('CASILLA_OCUPADA', 'Ya tenés un ejército en esa casilla');
  }

  const eventos = [
    evento('EjercitoMovido', estado, jugadorId, { desde: { x: desde.x, y: desde.y }, hasta: { x: hasta.x, y: hasta.y } }),
    evento('TerritorioDescubierto', estado, jugadorId, {
      tiles: radioAlrededor(hasta.x, hasta.y, radioVision(estado.jugadores.find(j => j.id === jugadorId)))
    }),
  ];

  if (!tileHasta.dueno) {
    eventos.push(evento('TerritorioReclamado', estado, jugadorId, { x: hasta.x, y: hasta.y }));
  }

  return eventos;
}
