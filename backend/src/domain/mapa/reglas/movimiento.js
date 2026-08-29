import { tileEn } from '../MapGame.js';
import { esNaval } from '../constantes.js';
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

  // Cada unidad en su medio, y nunca en el otro. El rio no entra en esta
  // cuenta a proposito: es tierra vadeable, asi que lo cruza la tropa y NO lo
  // navega el buque (ver docs/adr/0001).
  const naval = esNaval(tileDesde.ejercito.tipo);
  const destinoEsMar = tileHasta.terreno === 'water';
  if (naval && !destinoEsMar) {
    throw new ReglaError('TERRENO_INTRANSITABLE', 'Un buque no puede entrar en tierra');
  }
  if (!naval && destinoEsMar) {
    throw new ReglaError('TERRENO_INTRANSITABLE', 'El mar es intransitable para la tropa de tierra');
  }

  // Solo hay que PELEAR por lo que esta defendido: un ejercito enemigo o una
  // ciudad enemiga. La tierra ajena suelta se disputa entrando, igual que la
  // tierra de nadie.
  //
  // Antes se rechazaba cualquier casilla con dueño ajeno, y eso volvia la
  // frontera un muro: como para atacar hay que estar pegado, una ciudad rodeada
  // por el territorio de su propio dueño quedaba fuera del alcance de todos.
  // Medido en partidas trabadas: en 3 de 4, TODAS las ciudades del mapa tenian
  // cero casillas desde donde atacarlas, asi que la guerra era imposible y la
  // partida no podia terminar.
  const estaDefendida =
    (tileHasta.ejercito && tileHasta.ejercito.dueno !== jugadorId) ||
    (tileHasta.ciudad && tileHasta.dueno !== jugadorId);
  if (estaDefendida) throw new ReglaError('OBJETIVO_INVALIDO', 'La casilla es enemiga; usá atacar');

  if (tileHasta.ejercito && tileHasta.ejercito.dueno === jugadorId) {
    throw new ReglaError('CASILLA_OCUPADA', 'Ya tenés un ejército en esa casilla');
  }

  const eventos = [
    evento('EjercitoMovido', estado, jugadorId, { desde: { x: desde.x, y: desde.y }, hasta: { x: hasta.x, y: hasta.y } }),
    evento('TerritorioDescubierto', estado, jugadorId, {
      tiles: radioAlrededor(hasta.x, hasta.y, radioVision(estado.jugadores.find(j => j.id === jugadorId)))
    }),
  ];

  // Se reclama tanto la tierra de nadie como la que era de otro: pisarla es
  // tomarla. Moverse dentro de lo propio no reclama nada.
  //
  // `duenoAnterior` (null si era tierra de nadie) viaja EN el evento porque el
  // evento tiene que contar lo que paso: quien lo lee despues ya no puede
  // averiguar de quien era la casilla, porque para entonces el dueño cambio.
  // Sin esto la cronica podia decir "avanzo sobre 4 casillas" pero nunca "le
  // arrebato 4 casillas a Nick", que es lo que el jugador necesita saber.
  //
  // El MAR se excluye explicitamente, y hace falta decirlo: el dueño del mar
  // siempre es `null`, asi que `null !== jugadorId` es verdadero y un buque
  // reclamaria cada casilla que navega. Que el mar no tenga dueño es una
  // decision de diseño, no un descuido (ver docs/adr/0002): si el oceano
  // contara, el umbral real de victoria dependeria de cuanto mar genero la
  // semilla, y todo el balance ya medido dejaria de valer.
  if (tileHasta.dueno !== jugadorId && !destinoEsMar) {
    eventos.push(evento('TerritorioReclamado', estado, jugadorId, {
      x: hasta.x, y: hasta.y, duenoAnterior: tileHasta.dueno ?? null,
    }));
  }

  return eventos;
}
