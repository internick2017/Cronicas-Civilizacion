import { tileEn, jugadorPorId } from './MapGame.js';
import { UNIDADES, RECURSOS_INICIALES } from './constantes.js';
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
        t.ejercito = {
          tipo: datos.tipo,
          dueno: jugadorId,
          salud: def.salud,
          movimientoRestante: def.movimiento,
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

      case 'TurnoAvanzado':
        estado.indiceJugadorActual = datos.indiceJugadorActual;
        estado.turno = datos.turno;
        break;

      case 'RondaCompletada':
        for (const t of estado.mapa) {
          if (t.ejercito) t.ejercito.movimientoRestante = UNIDADES[t.ejercito.tipo].movimiento;
        }
        break;

      case 'JugadorEliminado': {
        const j = jugadorPorId(estado, datos.jugadorId);
        j.activo = false;
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
