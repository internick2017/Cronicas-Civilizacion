import { tileEn } from '../MapGame.js';
import {
  UNIDADES, bonoDefensa, defensaCiudad, BONO_DEFENSA_CIUDAD, CUARTEL,
  DANO_COMBATE, FACTOR_REPLICA, DANO_MINIMO, REPLICA_MINIMA
} from '../constantes.js';
import { ReglaError } from '../errores.js';
import { tirada } from '../rng.js';
import { validarTurno, evento, radio1 } from './comun.js';
import { bonoDefensaPorRasgos } from './cultura.js';
import { bonoAtaquePorTecnologias, bonoDefensaUnidadPorTecnologias } from './tecnologia.js';

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
  // El cuartel suma defensa PLANA a la ciudad donde esta construido (no a
  // los ejercitos: eso es fortificacion, la tecnologia). Se resuelve aca, no
  // en defensaCiudad(nivel), porque esa formula es pura y solo conoce el
  // nivel; el cuartel es un dato de ESE tile puntual, no de la ciudad en si.
  const bonoCuartel = ciudadEnemiga && tileHasta.ciudad.edificios.includes('barracks')
    ? CUARTEL.bonoDefensaCiudad : 0;
  const base = ejercitoEnemigo
    ? UNIDADES[ejercitoEnemigo.tipo].defensa
    : defensaCiudad(ciudadEnemiga.nivel) + bonoCuartel;
  const ciudadPropia = Boolean(tileHasta.ciudad);

  // Metalurgia y fortificacion (tecnologia) son bonos PLANOS a unidades, no
  // multiplicadores: se suman antes de aplicar los multiplicadores de
  // terreno/ciudad, que siguen siendo exclusivos de la defensa.
  const propio = estado.jugadores.find(j => j.id === jugadorId);
  const ataqueBase = atacante.ataque + bonoAtaquePorTecnologias(propio);

  // El rasgo cultural del arte solo cuenta si se defiende una ciudad, y es la
  // del DUEÑO de esa casilla, no la del atacante. Fortificacion, al reves,
  // solo cuenta si se defiende con un EJERCITO: una ciudad no es "una
  // unidad", asi que su formula de defensa (defensaCiudad(nivel)) no la usa.
  const defensor = estado.jugadores.find(j => j.id === tileHasta.dueno);
  const bonoCiudad = ciudadPropia ? BONO_DEFENSA_CIUDAD * bonoDefensaPorRasgos(defensor) : 1;
  const defensaBase = base + (ejercitoEnemigo ? bonoDefensaUnidadPorTecnologias(defensor) : 0);

  const poderAtaque = ataqueBase * tirada(rng);
  const poderDefensa = defensaBase * tirada(rng) * bonoDefensa(tileHasta.terreno) * bonoCiudad;

  const ganador = poderAtaque > poderDefensa ? 'atacante' : 'defensor';

  // Cada lado pega segun su peso relativo en el combate, no segun quien gano:
  // el que domina hace mas dano, pero el otro igual araña algo. El golpe del
  // perdedor va a la mitad (FACTOR_REPLICA) para que atacar siga conviniendo.
  const poderTotal = poderAtaque + poderDefensa;
  const golpe = (poder, esDelGanador) => {
    const bruto = DANO_COMBATE * (poder / poderTotal) * (esDelGanador ? 1 : FACTOR_REPLICA);
    return Math.max(esDelGanador ? DANO_MINIMO : REPLICA_MINIMA, Math.round(bruto));
  };

  const danoDefensor = golpe(poderAtaque, ganador === 'atacante');
  const danoAtacante = golpe(poderDefensa, ganador === 'defensor');

  const eventos = [
    evento('CombateResuelto', estado, jugadorId, {
      desde: { x: desde.x, y: desde.y },
      hasta: { x: hasta.x, y: hasta.y },
      ganador,
      danoAtacante,
      danoDefensor,
    }),
  ];

  // Con dano mutuo cualquiera de los dos puede caer, incluso el que gano: la
  // muerte depende de la salud que tenia, no de quien se llevo el combate.
  const atacanteCae = tileDesde.ejercito.salud - danoAtacante <= 0;
  const defensorCae = Boolean(ejercitoEnemigo) && ejercitoEnemigo.salud - danoDefensor <= 0;

  if (defensorCae) {
    eventos.push(evento('UnidadDestruida', estado, jugadorId, { x: hasta.x, y: hasta.y }));
  }
  if (atacanteCae) {
    eventos.push(evento('UnidadDestruida', estado, jugadorId, { x: desde.x, y: desde.y }));
  }

  // Solo se toma la ciudad si queda alguien en pie para tomarla.
  if (ganador === 'atacante' && !ejercitoEnemigo && !atacanteCae) {
    eventos.push(evento('CiudadCapturada', estado, jugadorId, { x: hasta.x, y: hasta.y }));

    // Al caer la ciudad cae tambien el territorio que administraba. Sin esto el
    // territorio ajeno era INCONQUISTABLE (moverEjercito rechaza casilla ajena,
    // atacar exige ejercito o ciudad, y capturar volteaba solo la casilla de la
    // ciudad), asi que con el mapa repartido la partida no podia avanzar mas.
    //
    // Se anexa solo lo que era del DUEÑO ANTERIOR: un tercero no paga por una
    // guerra ajena, y la tierra de nadie sigue de nadie (se gana caminandola,
    // como siempre). Tampoco se anexan casillas con CIUDAD: si una ciudad vecina
    // cayera de arrastre, una sola batalla podria encadenar un imperio entero.
    //
    // El dueño anterior se lee ACA y no en aplicar.js porque para cuando el
    // evento se aplique, CiudadCapturada ya le cambio el dueño a la casilla.
    const duenoAnterior = tileHasta.dueno;
    const anexadas = radio1(hasta.x, hasta.y)
      .map(({ x, y }) => tileEn(estado, x, y))
      .filter(t => t && t.dueno === duenoAnterior && !t.ciudad)
      .map(t => ({ x: t.x, y: t.y }));
    if (anexadas.length > 0) {
      eventos.push(evento('TerritorioAnexado', estado, jugadorId, {
        tiles: anexadas, duenoAnterior,
      }));
    }
  }

  return eventos;
}
