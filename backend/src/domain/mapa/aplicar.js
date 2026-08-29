import { tileEn, jugadorPorId } from './MapGame.js';
import { UNIDADES, RECURSOS_INICIALES, CUARTEL, PUERTO, esNaval } from './constantes.js';
import { vecinosOrtogonales } from './reglas/comun.js';
import { ReglaError } from './errores.js';

export function aplicar(estado, eventos) {
  for (const evento of eventos) {
    const { tipo, jugadorId, datos } = evento;
    switch (tipo) {
      case 'JugadorUnido':
        estado.jugadores.push({
          id: datos.id,
          nombre: datos.nombre,
          civilizacion: datos.civilizacion,
          recursos: { ...RECURSOS_INICIALES },
          rasgos: [],
          tecnologias: [],
          activo: true,
          esBot: Boolean(datos.esBot),
          dificultadIA: datos.dificultadIA ?? null,
        });
        break;

      case 'PartidaIniciada':
        estado.estado = 'jugando';
        estado.turno = 1;
        estado.indiceJugadorActual = 0;
        break;

      case 'CiudadFundada': {
        const t = tileEn(estado, datos.x, datos.y);
        t.ciudad = { nombre: datos.nombre, nivel: 1, poblacion: 500, edificios: [] };
        t.dueno = jugadorId;
        break;
      }

      case 'EdificioConstruido': {
        const t = tileEn(estado, datos.x, datos.y);
        t.ciudad.edificios.push(datos.edificio);
        break;
      }

      case 'RasgoAdoptado': {
        const j = jugadorPorId(estado, jugadorId);
        // Las partidas creadas antes de que existieran los rasgos no traen el
        // campo: se crea al vuelo en vez de romper.
        if (!j.rasgos) j.rasgos = [];
        j.rasgos.push(datos.rasgo);
        break;
      }

      case 'TecnologiaInvestigada': {
        const j = jugadorPorId(estado, jugadorId);
        if (!j.tecnologias) j.tecnologias = [];
        j.tecnologias.push(datos.tecnologia);
        break;
      }

      case 'CiudadMejorada': {
        const t = tileEn(estado, datos.x, datos.y);
        t.ciudad.nivel += 1;
        t.ciudad.poblacion += 250;
        break;
      }

      case 'RecursosGastados': {
        const j = jugadorPorId(estado, jugadorId);
        for (const [r, c] of Object.entries(datos.costo)) j.recursos[r] -= c;
        break;
      }

      case 'RecursosProducidos': {
        const j = jugadorPorId(estado, datos.jugadorId);
        for (const [r, c] of Object.entries(datos.produccion)) j.recursos[r] += c;
        break;
      }

      case 'UnidadReclutada': {
        const t = tileEn(estado, datos.x, datos.y);
        const def = UNIDADES[datos.tipo];
        // bonoMovimiento (del cuartel donde se reclutó, ver reglas/militar.js)
        // se guarda EN el ejercito, no solo se suma una vez: RondaCompletada
        // vuelve a llenar movimientoRestante cada ronda, y tiene que seguir
        // contando ese extra turno tras turno, no solo el primero.
        t.ejercito = {
          tipo: datos.tipo,
          dueno: jugadorId,
          salud: def.salud,
          movimientoRestante: def.movimiento + (datos.bonoMovimiento ?? 0),
          bonoMovimiento: datos.bonoMovimiento ?? 0,
        };
        break;
      }

      case 'EjercitoMovido': {
        const origen = tileEn(estado, datos.desde.x, datos.desde.y);
        const destino = tileEn(estado, datos.hasta.x, datos.hasta.y);
        const ejercito = origen.ejercito;
        ejercito.movimientoRestante -= 1;
        destino.ejercito = ejercito;
        origen.ejercito = null;
        break;
      }

      case 'TerritorioReclamado': {
        const t = tileEn(estado, datos.x, datos.y);
        t.dueno = jugadorId;
        break;
      }

      // Territorio que cambia de manos al caer una ciudad (ver
      // reglas/combate.js) o que vuelve solo a la ciudad vecina al cerrar la
      // ronda (ver reglas/fronteras.js). Van como UN evento con la lista y no
      // como N eventos sueltos, igual que TerritorioDescubierto: el log se lee
      // entero en varios lugares y no conviene inflarlo con una fila por casilla.
      case 'TerritorioRecuperado':
      case 'TerritorioAnexado':
        for (const { x, y } of datos.tiles) {
          const t = tileEn(estado, x, y);
          if (t) t.dueno = jugadorId;
        }
        break;

      case 'TerritorioDescubierto':
        for (const { x, y } of datos.tiles) {
          const t = tileEn(estado, x, y);
          if (t && !t.descubiertoPor.includes(jugadorId)) t.descubiertoPor.push(jugadorId);
        }
        break;

      case 'CombateResuelto': {
        const atacanteTile = tileEn(estado, datos.desde.x, datos.desde.y);
        const defensorTile = tileEn(estado, datos.hasta.x, datos.hasta.y);
        atacanteTile.ejercito.salud -= datos.danoAtacante;
        if (defensorTile.ejercito) defensorTile.ejercito.salud -= datos.danoDefensor;
        atacanteTile.ejercito.movimientoRestante = 0;
        break;
      }

      case 'UnidadDestruida': {
        const t = tileEn(estado, datos.x, datos.y);
        t.ejercito = null;
        break;
      }

      case 'CiudadCapturada': {
        const t = tileEn(estado, datos.x, datos.y);
        t.dueno = jugadorId;
        break;
      }

      // Un buque vencio a una ciudad costera indefensa y se llevo oro sin
      // tomarla (ver reglas/combate.js). El oro se TRANSFIERE: lo que pierde
      // uno lo gana el otro, que es lo que significa saquear. La ciudad, su
      // dueño y su territorio no se tocan.
      case 'CiudadSaqueada': {
        const victima = jugadorPorId(estado, datos.victima);
        const asaltante = jugadorPorId(estado, jugadorId);
        if (victima) victima.recursos.gold -= datos.oro;
        if (asaltante) asaltante.recursos.gold += datos.oro;
        break;
      }

      case 'TurnoAvanzado':
        estado.indiceJugadorActual = datos.indiceJugadorActual;
        estado.turno = datos.turno;
        break;

      case 'RondaCompletada':
        for (const t of estado.mapa) {
          if (!t.ejercito) continue;
          t.ejercito.movimientoRestante = UNIDADES[t.ejercito.tipo].movimiento + (t.ejercito.bonoMovimiento ?? 0);
          // Curacion: solo en una ciudad PROPIA con cuartel. `t.dueno` es
          // quien controla la ciudad, no necesariamente quien tiene el
          // ejercito parado ahi (nunca deberian diferir: no se puede pisar
          // una ciudad ajena sin conquistarla), pero se compara para no
          // curar por accidente una tropa que no es del dueño de la ciudad.
          if (t.ciudad && t.ciudad.edificios.includes('barracks') && t.ejercito.dueno === t.dueno) {
            const vidaMaxima = UNIDADES[t.ejercito.tipo].salud;
            t.ejercito.salud = Math.min(vidaMaxima, t.ejercito.salud + CUARTEL.curacionPorRonda);
          }

          // Astillero: el espejo naval del cuartel. Un buque no puede pararse
          // dentro de la ciudad (no pisa tierra), asi que se repara estando en
          // el mar CONTIGUO a una ciudad propia con puerto. Se compara el dueño
          // de la ciudad con el del buque por el mismo motivo que arriba: nadie
          // repara la flota ajena.
          if (esNaval(t.ejercito.tipo)) {
            const enPuertoPropio = vecinosOrtogonales(estado, t.x, t.y).some(v =>
              v.ciudad && v.ciudad.edificios.includes('port') && v.dueno === t.ejercito.dueno);
            if (enPuertoPropio) {
              const vidaMaxima = UNIDADES[t.ejercito.tipo].salud;
              t.ejercito.salud = Math.min(vidaMaxima, t.ejercito.salud + PUERTO.curacionPorRonda);
            }
          }
        }
        break;

      case 'JugadorEliminado': {
        const j = jugadorPorId(estado, datos.jugadorId);
        j.activo = false;
        // Su territorio SUELTO vuelve a ser tierra de nadie. Si no, queda a
        // nombre de alguien que ya no juega y se convierte en un muro
        // permanente: moverEjercito lo rechaza por ajeno, fundarCiudad por
        // ocupado, y atacar necesita un ejercito o una ciudad enemiga, que ahi
        // ya no hay. Nadie podria volver a pisarlo nunca, y esas casillas
        // siguen contando en el denominador de la victoria por dominacion, asi
        // que un jugador muerto podia dejar el 60% fuera de alcance para todos.
        // Las ciudades NO se liberan: como ciudad enemiga si se pueden atacar y
        // capturar (no son un muro), y dejarlas sin dueño obligaria a inventar
        // que significa una ciudad de nadie.
        for (const t of estado.mapa) {
          if (t.dueno === datos.jugadorId && !t.ciudad) t.dueno = null;
        }
        break;
      }

      case 'PartidaTerminada':
        estado.estado = 'terminado';
        estado.ganador = datos.ganador;
        break;

      default:
        throw new ReglaError('EVENTO_DESCONOCIDO', `Evento desconocido: ${tipo}`);
    }
  }
}
