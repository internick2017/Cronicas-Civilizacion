import { tileEn, jugadorPorId } from './MapGame.js';
import { UNIDADES, RECURSOS_INICIALES, CUARTEL, PUERTO, esNaval } from './constantes.js';
import { vecinosOrtogonales } from './reglas/comun.js';
import { ReglaError } from './errores.js';

export function aplicar(estado, eventos) {
  for (const evento of eventos) {
    const { tipo, jugadorId, datos, turno: evento_turno } = evento;
    switch (tipo) {
      case 'JugadorUnido':
        estado.jugadores.push({
          id: datos.id,
          nombre: datos.nombre,
          civilizacion: datos.civilizacion,
          raza: datos.raza ?? null,
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

      case 'CiudadRenombrada': {
        tileEn(estado, datos.x, datos.y).ciudad.nombre = datos.nombre;
        break;
      }

      case 'GobiernoCambiado':
        jugadorPorId(estado, jugadorId).gobierno = datos.gobierno;
        break;

      case 'VotacionFallida':
        jugadorPorId(estado, jugadorId).cambioBloqueadoHasta = datos.hastaTurno;
        break;

      case 'FormaEstadoCambiada': {
        const j = jugadorPorId(estado, jugadorId);
        j.formaEstado = datos.formaEstado;
        // Los problemas sociales son del Estado federal: al pasar a unitario se cierran en el
        // acto (sin costo), no al fin de la ronda; los medidores quedan congelados.
        if (datos.formaEstado === 'unitario') j.problemas = [];
        break;
      }

      case 'ApoyoActualizado':
        jugadorPorId(estado, jugadorId).apoyo = { ...datos.apoyo };
        break;

      // Cada ciudad pertenece a UNA sola subdivision directa: al asignarla a otra
      // se la saca de la anterior. Las subdivisiones guardadas antes de la
      // jerarquia no traen tipo/padreId/prioridad: se leen con default (ver
      // reglas/subdivisiones.js), aca solo se toca lo que el evento trae.
      case 'SubdivisionCreada': {
        const j = jugadorPorId(estado, jugadorId);
        if (!j.subdivisiones) j.subdivisiones = [];
        const quitar = new Set(datos.ciudades.map(c => `${c.x},${c.y}`));
        for (const s of j.subdivisiones) s.ciudades = s.ciudades.filter(c => !quitar.has(`${c.x},${c.y}`));
        j.subdivisiones.push({
          id: datos.id, nombre: datos.nombre, tipo: datos.tipo ?? 'municipio',
          padreId: datos.padreId ?? null, prioridad: datos.prioridad ?? null,
          ciudades: datos.ciudades.map(({ x, y }) => ({ x, y })),
        });
        break;
      }

      case 'SubdivisionRenombrada': {
        const sub = (jugadorPorId(estado, jugadorId).subdivisiones ?? []).find(s => s.id === datos.id);
        if (sub) sub.nombre = datos.nombre;
        break;
      }

      case 'CiudadesAsignadas': {
        const j = jugadorPorId(estado, jugadorId);
        const destino = (j.subdivisiones ?? []).find(s => s.id === datos.id);
        if (!destino) break;
        const mover = new Set(datos.ciudades.map(c => `${c.x},${c.y}`));
        for (const s of j.subdivisiones) s.ciudades = s.ciudades.filter(c => !mover.has(`${c.x},${c.y}`));
        for (const { x, y } of datos.ciudades) destino.ciudades.push({ x, y });
        break;
      }

      case 'CiudadesDesasignadas': {
        const j = jugadorPorId(estado, jugadorId);
        const lista = j.subdivisiones ?? [];
        const sub = lista.find(s => s.id === datos.id);
        if (!sub) break;
        const quitar = new Set(datos.ciudades.map(c => `${c.x},${c.y}`));
        sub.ciudades = sub.ciudades.filter(c => !quitar.has(`${c.x},${c.y}`));
        const padre = lista.find(s => s.id === (sub.padreId ?? null)) ?? null;
        if (padre) {
          for (const c of datos.ciudades) {
            if (!padre.ciudades.some(p => p.x === c.x && p.y === c.y)) padre.ciudades.push({ x: c.x, y: c.y });
          }
        }
        break;
      }

      // Quitar REUBICA: las hijas y las ciudades directas pasan al padre.
      case 'SubdivisionQuitada': {
        const j = jugadorPorId(estado, jugadorId);
        const lista = j.subdivisiones ?? [];
        const quitada = lista.find(s => s.id === datos.id);
        if (!quitada) break;
        const padre = lista.find(s => s.id === (quitada.padreId ?? null)) ?? null;
        for (const hija of lista) if ((hija.padreId ?? null) === quitada.id) hija.padreId = padre ? padre.id : null;
        if (padre) {
          for (const c of quitada.ciudades) {
            if (!padre.ciudades.some(p => p.x === c.x && p.y === c.y)) padre.ciudades.push({ x: c.x, y: c.y });
          }
        }
        j.subdivisiones = lista.filter(s => s.id !== datos.id);
        break;
      }

      // --- Problemas sociales (reglas/problemas.js) ---
      case 'MedidoresActualizados': {
        const j = jugadorPorId(estado, jugadorId);
        j.medidores = structuredClone(datos.medidores);
        j.problemasRonda = datos.ronda; // ultima ronda procesada: da idempotencia
        break;
      }

      case 'ProblemaSurgido': {
        const j = jugadorPorId(estado, jugadorId);
        if (!j.problemas) j.problemas = [];
        j.problemas.push(structuredClone(datos.problema));
        j.contadorProblemas = Math.max(j.contadorProblemas ?? 0, Number(datos.problema.id.slice(2)));
        break;
      }

      case 'ProblemaAgravado': {
        const p = (jugadorPorId(estado, jugadorId).problemas ?? []).find(x => x.id === datos.id);
        if (p) p.gravedad = datos.gravedad;
        break;
      }

      case 'ProblemaResuelto': {
        const j = jugadorPorId(estado, jugadorId);
        j.problemas = (j.problemas ?? []).filter(p => p.id !== datos.id);
        // Se recuerdan los ultimos para mostrar la señal de recuperacion.
        j.problemasResueltos = [...(j.problemasResueltos ?? []),
          { tipo: datos.tipo, ciudades: structuredClone(datos.ciudades), ronda: evento_turno }].slice(-10);
        break;
      }

      // Salud: la ciudad pierde poblacion, con piso de 100.
      case 'PoblacionAjustada': {
        const t = tileEn(estado, datos.x, datos.y);
        if (t?.ciudad) t.ciudad.poblacion = Math.max(100, t.ciudad.poblacion + datos.delta);
        break;
      }

      case 'ProblemasDescartados': {
        const j = jugadorPorId(estado, jugadorId);
        j.problemas = (j.problemas ?? []).filter(p => !datos.ids.includes(p.id));
        break;
      }

      case 'PoderPerdido':
        jugadorPorId(estado, jugadorId).enPoder = false;
        break;

      case 'PoderRecuperado':
        jugadorPorId(estado, jugadorId).enPoder = true;
        break;

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
        // Corrupcion o inmigracion pueden dar una produccion NEGATIVA: se cobra de lo que
        // hay, pero los recursos nunca quedan por debajo de cero.
        for (const [r, c] of Object.entries(datos.produccion)) j.recursos[r] = Math.max(0, j.recursos[r] + c);
        if (datos.resto) j.restoProduccion = { ...datos.resto };
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

      // La tropa deja de existir como ejercito en su casilla y pasa a viajar
      // DENTRO del transporte, conservando su salud: si se guardara solo el
      // tipo, embarcar seria una curacion gratis mas barata que un cuartel.
      //
      // Se guarda tambien su movimiento en cero: embarcar consume el turno de
      // la tropa (no el del barco, que sigue pudiendo navegar), y RondaCompletada
      // se lo va a devolver al cerrar la ronda, igual que a cualquier unidad.
      case 'TropaEmbarcada': {
        const origen = tileEn(estado, datos.desde.x, datos.desde.y);
        const barco = tileEn(estado, datos.hasta.x, datos.hasta.y).ejercito;
        if (!barco.carga) barco.carga = [];
        barco.carga.push({ ...origen.ejercito, movimientoRestante: 0 });
        origen.ejercito = null;
        break;
      }

      case 'TropaDesembarcada': {
        const barco = tileEn(estado, datos.desde.x, datos.desde.y).ejercito;
        const destino = tileEn(estado, datos.hasta.x, datos.hasta.y);
        const tropa = barco.carga.pop();
        destino.ejercito = { ...tropa, movimientoRestante: 0 };
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
        // La ciudad se va con su dueño anterior: sus problemas, medidores y su lugar en el arbol
        // de subdivisiones desaparecen en el acto, no al proximo cierre de ronda.
        const anterior = t.dueno && t.dueno !== jugadorId ? jugadorPorId(estado, t.dueno) : null;
        if (anterior) {
          const mismo = (c) => c.x === datos.x && c.y === datos.y;
          anterior.problemas = (anterior.problemas ?? []).filter(p => !p.ciudades.some(mismo));
          if (anterior.medidores) delete anterior.medidores[`${datos.x},${datos.y}`];
          for (const s of anterior.subdivisiones ?? []) s.ciudades = s.ciudades.filter(c => !mismo(c));
        }
        t.dueno = jugadorId;
        break;
      }

      // Un buque vencio a una ciudad costera indefensa y se llevo oro sin
      // tomarla (ver reglas/combate.js). El oro se TRANSFIERE: lo que pierde
      // uno lo gana el otro, que es lo que significa saquear. La ciudad, su
      // dueño y su territorio no se tocan, pero la ciudad queda sin producir
      // hasta `saqueadaHasta`. Se queda con el mayor para que reaplicar el
      // evento, o una racha de saqueos, renueve el cerco sin alargarlo.
      case 'CiudadSaqueada': {
        const victima = jugadorPorId(estado, datos.victima);
        const asaltante = jugadorPorId(estado, jugadorId);
        if (victima) victima.recursos.gold -= datos.oro;
        if (asaltante) asaltante.recursos.gold += datos.oro;
        const ciudad = tileEn(estado, datos.x, datos.y)?.ciudad;
        if (ciudad) ciudad.saqueadaHasta = Math.max(ciudad.saqueadaHasta ?? 0, datos.saqueadaHasta);
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
          // La tropa que viaja adentro de un transporte tambien recupera su
          // movimiento: si no, una unidad embarcada quedaria en cero para
          // siempre y no podria volver a bajar nunca.
          for (const tropa of t.ejercito.carga ?? []) {
            tropa.movimientoRestante = UNIDADES[tropa.tipo].movimiento + (tropa.bonoMovimiento ?? 0);
          }
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
