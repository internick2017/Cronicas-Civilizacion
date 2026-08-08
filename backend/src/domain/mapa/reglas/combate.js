import { tileEn } from '../MapGame.js';
import { UNIDADES, bonoDefensa, defensaCiudad, BONO_DEFENSA_CIUDAD } from '../constantes.js';
import { ReglaError } from '../errores.js';
import { tirada } from '../rng.js';
import { validarTurno, evento } from './comun.js';

export function atacar(estado, jugadorId, { desde, hasta }, rng) {
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

  const ejercitoEnemigo =
    tileHasta.ejercito && tileHasta.ejercito.dueno !== jugadorId ? tileHasta.ejercito : null;
  const ciudadEnemiga = tileHasta.ciudad && tileHasta.dueno !== jugadorId ? tileHasta.ciudad : null;

  if (!ejercitoEnemigo && !ciudadEnemiga) {
    throw new ReglaError('OBJETIVO_INVALIDO', 'No hay un objetivo enemigo en esa casilla');
  }

  const atacante = UNIDADES[tileDesde.ejercito.tipo];
  const base = ejercitoEnemigo ? UNIDADES[ejercitoEnemigo.tipo].defensa : defensaCiudad(ciudadEnemiga.nivel);
  const ciudadPropia = Boolean(tileHasta.ciudad);

  const poderAtaque = atacante.ataque * tirada(rng);
  const poderDefensa = base * tirada(rng) * bonoDefensa(tileHasta.terreno) * (ciudadPropia ? BONO_DEFENSA_CIUDAD : 1);

  const ganador = poderAtaque > poderDefensa ? 'atacante' : 'defensor';
  const damageMultiplier = Math.abs(poderAtaque - poderDefensa) / Math.max(poderAtaque, poderDefensa);
  const dano = Math.max(10, Math.round(50 * damageMultiplier));

  const danoAtacante = ganador === 'defensor' ? dano : 0;
  const danoDefensor = ganador === 'atacante' ? dano : 0;

  const eventos = [
    evento('CombateResuelto', estado, jugadorId, {
      desde: { x: desde.x, y: desde.y },
      hasta: { x: hasta.x, y: hasta.y },
      ganador,
      danoAtacante,
      danoDefensor,
    }),
  ];

  if (ganador === 'atacante') {
    if (ejercitoEnemigo) {
      if (ejercitoEnemigo.salud - danoDefensor <= 0) {
        eventos.push(evento('UnidadDestruida', estado, jugadorId, { x: hasta.x, y: hasta.y }));
      }
    } else {
      eventos.push(evento('CiudadCapturada', estado, jugadorId, { x: hasta.x, y: hasta.y }));
    }
  }

  return eventos;
}
