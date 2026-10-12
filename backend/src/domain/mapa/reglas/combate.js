import { tileEn } from '../MapGame.js';
import {
  UNIDADES, bonoDefensa, defensaCiudad, BONO_DEFENSA_CIUDAD, CUARTEL,
  DANO_COMBATE, FACTOR_REPLICA, DANO_MINIMO, REPLICA_MINIMA, esNaval, puedeAtacar
} from '../constantes.js';
import { penalizacionDefensa } from './efectosProblemas.js';
import { ReglaError } from '../errores.js';
import { tirada } from '../rng.js';
import { botinDe, saqueadaHasta } from './saqueo.js';
import { validarTurno, evento, radio1 } from './comun.js';
import { sonAliados, enPaz } from './bandos.js';
import { bonoDefensaPorRasgos } from './cultura.js';
import { bonoAtaquePorTecnologias, bonoDefensaUnidadPorTecnologias } from './tecnologia.js';
import {
  bonoAtaquePorRaza, bonoDefensaUnidadPorRaza, multiplicadorDefensaCiudadPorRaza
} from './razas.js';

// La defensa PLANA de una ciudad: su nivel, mas el cuartel, menos lo que le quitan los
// problemas sociales activos de su dueño (inseguridad, infraestructura). Nunca baja de 1.
// Exportada para poder probarla sin armar un combate entero.
export function defensaDeCiudad(estado, tile) {
  const bonoCuartel = tile.ciudad.edificios.includes('barracks') ? CUARTEL.bonoDefensaCiudad : 0;
  const duenoJugador = estado.jugadores.find(j => j.id === tile.dueno);
  return Math.max(1, defensaCiudad(tile.ciudad.nivel) + bonoCuartel - penalizacionDefensa(duenoJugador, tile.x, tile.y));
}

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

  // El transporte es la primera unidad del juego que no pelea (ataque 0). Sin
  // esta guarda podria "atacar" con poder cero y perder siempre, que es una
  // accion que el jugador nunca quiso: es carne, y esa es su gracia.
  if (!puedeAtacar(tileDesde.ejercito.tipo)) {
    throw new ReglaError('UNIDAD_NO_ATACA', 'Esa unidad no puede atacar');
  }

  const ejercitoEnemigo =
    tileHasta.ejercito && tileHasta.ejercito.dueno !== jugadorId ? tileHasta.ejercito : null;
  const ciudadEnemiga = tileHasta.ciudad && tileHasta.dueno !== jugadorId ? tileHasta.ciudad : null;

  if (!ejercitoEnemigo && !ciudadEnemiga) {
    throw new ReglaError('OBJETIVO_INVALIDO', 'No hay un objetivo enemigo en esa casilla');
  }

  // A un aliado no se lo ataca, y a un ex aliado tampoco hasta que venza la tregua.
  for (const duenoObjetivo of [ejercitoEnemigo?.dueno, ciudadEnemiga ? tileHasta.dueno : null]) {
    if (!duenoObjetivo || !enPaz(estado, jugadorId, duenoObjetivo)) continue;
    throw sonAliados(estado, jugadorId, duenoObjetivo)
      ? new ReglaError('ES_ALIADO', 'No podés atacar a un aliado')
      : new ReglaError('EN_TREGUA', 'Hay tregua con ese jugador hasta la próxima ronda');
  }

  const atacante = UNIDADES[tileDesde.ejercito.tipo];
  // El cuartel suma defensa PLANA a la ciudad donde esta construido (no a
  // los ejercitos: eso es fortificacion, la tecnologia). Se resuelve aca, no
  // en defensaCiudad(nivel), porque esa formula es pura y solo conoce el
  // nivel; el cuartel es un dato de ESE tile puntual, no de la ciudad en si.
  const base = ejercitoEnemigo
    ? UNIDADES[ejercitoEnemigo.tipo].defensa
    : defensaDeCiudad(estado, tileHasta);
  const ciudadPropia = Boolean(tileHasta.ciudad);

  // Metalurgia y fortificacion (tecnologia) son bonos PLANOS a unidades, no
  // multiplicadores: se suman antes de aplicar los multiplicadores de
  // terreno/ciudad, que siguen siendo exclusivos de la defensa.
  const propio = estado.jugadores.find(j => j.id === jugadorId);
  // La raza suma lo suyo al mismo bono plano (puede ser negativo).
  const ataqueBase = atacante.ataque + bonoAtaquePorTecnologias(propio) + bonoAtaquePorRaza(propio);

  // El rasgo cultural del arte solo cuenta si se defiende una ciudad, y es la
  // del DUEÑO de esa casilla, no la del atacante. Fortificacion, al reves,
  // solo cuenta si se defiende con un EJERCITO: una ciudad no es "una
  // unidad", asi que su formula de defensa (defensaCiudad(nivel)) no la usa.
  const defensor = estado.jugadores.find(j => j.id === tileHasta.dueno);
  const bonoCiudad = ciudadPropia
    ? BONO_DEFENSA_CIUDAD * bonoDefensaPorRasgos(defensor) * multiplicadorDefensaCiudadPorRaza(defensor)
    : 1;
  // Los bonos de UNIDAD son de quien manda el ejercito, no de quien es dueno de
  // la casilla: un ejercito que defiende en tierra libre o ajena (el dueno de la
  // casilla es otro, o nadie) igual pelea con su fortificacion y su raza.
  const duenoDelEjercito = ejercitoEnemigo
    ? estado.jugadores.find(j => j.id === ejercitoEnemigo.dueno)
    : null;
  const defensaBase = base + (ejercitoEnemigo
    ? bonoDefensaUnidadPorTecnologias(duenoDelEjercito) + bonoDefensaUnidadPorRaza(duenoDelEjercito)
    : 0);

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

  // `naval` viaja EN el evento por el mismo motivo que `duenoAnterior` en
  // TerritorioReclamado: el narrador recibe la lista de eventos y los
  // jugadores, nunca el mapa, asi que no tiene forma de averiguar despues si
  // esto paso en el mar. Sin este campo, hundir una flota se contaria como
  // "los ejercitos chocaron", y la cronica es justamente lo que diferencia a
  // este juego de un juego de estrategia cualquiera.
  const atacanteEsNaval = esNaval(tileDesde.ejercito.tipo);
  const combateNaval = atacanteEsNaval || Boolean(ejercitoEnemigo && esNaval(ejercitoEnemigo.tipo));

  const eventos = [
    evento('CombateResuelto', estado, jugadorId, {
      desde: { x: desde.x, y: desde.y },
      hasta: { x: hasta.x, y: hasta.y },
      ganador,
      danoAtacante,
      danoDefensor,
      naval: combateNaval,
    }),
  ];

  // Con dano mutuo cualquiera de los dos puede caer, incluso el que gano: la
  // muerte depende de la salud que tenia, no de quien se llevo el combate.
  const atacanteCae = tileDesde.ejercito.salud - danoAtacante <= 0;
  const defensorCae = Boolean(ejercitoEnemigo) && ejercitoEnemigo.salud - danoDefensor <= 0;

  // Tambien lleva `naval`, y por unidad: un buque se HUNDE y un soldado cae.
  // Los dos lados pueden morir en el mismo combate, y no tienen por que ser
  // del mismo medio (una catapulta en la costa puede hundir un buque y caer
  // ella misma), asi que el flag se calcula por separado para cada uno.
  if (defensorCae) {
    eventos.push(evento('UnidadDestruida', estado, jugadorId, {
      x: hasta.x, y: hasta.y, naval: esNaval(ejercitoEnemigo.tipo),
    }));
  }
  if (atacanteCae) {
    eventos.push(evento('UnidadDestruida', estado, jugadorId, {
      x: desde.x, y: desde.y, naval: atacanteEsNaval,
    }));
  }

  // Solo se toma la ciudad si queda alguien en pie para tomarla.
  if (ganador === 'atacante' && !ejercitoEnemigo && !atacanteCae) {
    // Un buque vence pero NO toma: no pisa tierra. Sin esta rama la regla
    // quedaba muerta, porque las ciudades no tienen vida y lo unico que podia
    // pasar al ganarle a una ciudad indefensa era capturarla. El saqueo es lo
    // que le da sentido a "hostiga" contra una costa desguarnecida (ver
    // docs/adr/0003).
    if (esNaval(tileDesde.ejercito.tipo)) {
      // Si la victima no tiene oro el saqueo no da oro, pero el combate ocurrio
      // igual y el buque pudo haberse llevado dano. Hostigar nunca es gratis.
      eventos.push(evento('CiudadSaqueada', estado, jugadorId, {
        x: hasta.x, y: hasta.y, victima: tileHasta.dueno,
        oro: botinDe(defensor?.recursos?.gold ?? 0),
        saqueadaHasta: saqueadaHasta(estado.turno),
      }));
      return eventos;
    }

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
