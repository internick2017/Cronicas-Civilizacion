import { jugadorPorId, tileEn } from './MapGame.js';
import { aplicar } from './aplicar.js';
import { evento } from './reglas/comun.js';
import { formaEstadoDe } from './reglas/gobierno.js';
import { mecanicaActiva } from './reglas/modo.js';
import {
  crearSubdivision, asignarCiudades, quitarSubdivision, subdivisionesDe, subdivisionDeCiudad, territorioDe,
  cabeceraDe, elegirCabecera,
} from './reglas/subdivisiones.js';
import { IA_ORGANIZA_SUBDIVISIONES } from './constantes.js';

// Como la maquina arma su Estado federal (pedido del usuario: "la IA crea subdivisiones").
// Se organiza sola, sin que nadie se lo pida:
//   - con 2 ciudades o mas pasa a federal y NO vuelve a unitario;
//   - usa los 6 niveles: Pais (virtual) > Provincia > Distrito > Condado > Municipio > Freguesia;
//   - una ciudad suelta entra a la Freguesia mas cercana con lugar (hasta 3 ciudades); si no
//     hay, agrupa las sueltas por cercania en Freguesias nuevas;
//   - cada contenedor admite hasta 3 hijas (la Provincia, sin tope). Cuando uno se llena se abre
//     otro del mismo nivel, colgado del contenedor de arriba que tenga lugar, y asi hacia arriba.
// Una subdivision elige su padre al crearse y no se reubica, por eso la cadena se arma de arriba
// hacia abajo: al crear una Freguesia ya existe todo lo que la contiene.
// Trabaja sobre una COPIA y devuelve los eventos (como administrarSubdivisiones).
const CIUDADES_PARA_FEDERAL = 2;
const CIUDADES_POR_FREGUESIA = 3;
const DISTANCIA_ENEMIGO = 3;

// Cada contenedor, su nombre y el contenedor de arriba. HIJAS_MAXIMAS coincide con
// CAPACIDAD_CIUDADES_POR_NIVEL (3 x 3 ciudades = 9, x 3 = 27, x 3 = 81).
const CONTENEDORES = {
  municipio: { superior: 'condado', hijasMaximas: 3, nombre: 'Municipio' },
  condado: { superior: 'distrito', hijasMaximas: 3, nombre: 'Condado' },
  distrito: { superior: 'provincia', hijasMaximas: 3, nombre: 'Distrito' },
  provincia: { superior: null, hijasMaximas: Infinity, nombre: 'Provincia' },
};

const distancia = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const distanciaMinima = (desde, hasta) =>
  Math.min(...desde.flatMap(a => hasta.map(b => distancia(a, b))), Infinity);

// Grupos de hasta `tamano` elementos cercanos entre si; determinista (desempates por orden).
function agruparCercanos(lista, tamano) {
  const libres = [...lista];
  const grupos = [];
  while (libres.length > 0) {
    const base = libres.shift();
    const grupo = [base];
    while (grupo.length < tamano && libres.length > 0) {
      let mejor = 0;
      for (let i = 1; i < libres.length; i++) {
        if (distancia(libres[i], base) < distancia(libres[mejor], base)) mejor = i;
      }
      grupo.push(libres.splice(mejor, 1)[0]);
    }
    grupos.push(grupo);
  }
  return grupos;
}

function hayEnemigoCerca(estado, ciudades, jugadorId) {
  return estado.mapa.some(t =>
    t.ejercito && t.ejercito.dueno !== jugadorId && ciudades.some(c => distancia(t, c) <= DISTANCIA_ENEMIGO));
}

export function organizarSubdivisionesIA(estado, jugadorId, { activa = IA_ORGANIZA_SUBDIVISIONES } = {}) {
  if (!activa) return [];
  // Sin gobierno no hay Estado federal: la maquina se queda unitaria, como todos.
  if (!mecanicaActiva(estado, 'gobierno')) return [];
  const original = jugadorPorId(estado, jugadorId);
  if (!original || !original.esBot) return [];
  const propias = (est) => est.mapa.filter(t => t.ciudad && t.dueno === jugadorId).map(t => ({ x: t.x, y: t.y }));
  if (formaEstadoDe(original) !== 'federal' && propias(estado).length < CIUDADES_PARA_FEDERAL) return [];

  const copia = structuredClone(estado);
  const eventos = [];
  const emitir = (evs) => { aplicar(copia, evs); eventos.push(...evs); };
  const jugador = () => jugadorPorId(copia, jugadorId);

  if (formaEstadoDe(jugador()) !== 'federal') {
    emitir([evento('FormaEstadoCambiada', copia, jugadorId, { formaEstado: 'federal' })]);
  }

  // Primero se quitan las subdivisiones que quedaron vacias (sin ciudades ni hijas): las ciudades
  // perdidas se van de su lista (ver aplicar.js) y sin esto se acumulaban para siempre, ocupando
  // lugar en el Municipio y haciendo crecer el arbol.
  for (let vuelta = 0; vuelta < 50; vuelta++) {
    const subs = subdivisionesDe(jugador());
    const vacia = subs.find(s => s.ciudades.length === 0 && !subs.some(h => h.padreId === s.id));
    if (!vacia) break;
    emitir(quitarSubdivision(copia, jugadorId, { id: vacia.id }));
  }

  // Cada subdivision con ciudades y sin cabecera valida (nueva, o la perdio) se
  // encabeza con su ciudad de mayor nivel; en un empate, la primera del mapa.
  const ponerCabeceras = () => {
    for (const sub of subdivisionesDe(jugador())) {
      if (cabeceraDe(copia, jugador(), sub)) continue;
      const [mayor] = territorioDe(jugador(), sub)
        .map(c => tileEn(copia, c.x, c.y))
        .filter(t => t?.ciudad && t.dueno === jugadorId)
        .sort((a, b) => b.ciudad.nivel - a.ciudad.nivel || a.y - b.y || a.x - b.x);
      if (mayor) emitir(elegirCabecera(copia, jugadorId, { subdivisionId: sub.id, x: mayor.x, y: mayor.y }));
    }
    return eventos;
  };

  const sueltas = propias(copia)
    .filter(c => !subdivisionDeCiudad(jugador(), c.x, c.y))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  if (sueltas.length === 0) return ponerCabeceras();

  const cantidad = (tipo) => subdivisionesDe(jugador()).filter(s => s.tipo === tipo).length;
  const crear = (datos) => {
    const evs = crearSubdivision(copia, jugadorId, datos);
    emitir(evs);
    return evs[0].datos.id;
  };

  // Antes de abrir una Freguesia nueva, las sueltas llenan las que tienen lugar (la mas cercana).
  const restantes = [];
  for (const ciudad of sueltas) {
    const conLugar = subdivisionesDe(jugador())
      .filter(s => s.tipo === 'freguesia' && s.ciudades.length < CIUDADES_POR_FREGUESIA)
      .map(s => ({ s, d: distanciaMinima([ciudad], territorioDe(jugador(), s)) }))
      .sort((a, b) => a.d - b.d || a.s.id.localeCompare(b.s.id));
    if (conLugar.length === 0) { restantes.push(ciudad); continue; }
    emitir(asignarCiudades(copia, jugadorId, { id: conLugar[0].s.id, ciudades: [ciudad] }));
  }

  // El contenedor de ese tipo donde cabe una hija mas, el mas cercano a `ciudades`; si todos
  // estan llenos (o no hay ninguno) se crea uno nuevo, y su padre se busca igual, hacia arriba.
  function contenedorPara(tipo, ciudades) {
    const { superior, hijasMaximas, nombre } = CONTENEDORES[tipo];
    const subs = subdivisionesDe(jugador());
    const conLugar = subs
      .filter(s => s.tipo === tipo && subs.filter(h => h.padreId === s.id).length < hijasMaximas)
      .map(s => ({ s, d: distanciaMinima(ciudades, territorioDe(jugador(), s)) }))
      .sort((a, b) => a.d - b.d || a.s.id.localeCompare(b.s.id));
    if (conLugar.length > 0) return conLugar[0].s.id;
    const padreId = superior ? contenedorPara(superior, ciudades) : null;
    return crear({ nombre: `${nombre} ${cantidad(tipo) + 1}`, tipoSubdivision: tipo, padreId });
  }

  for (const grupo of agruparCercanos(restantes, CIUDADES_POR_FREGUESIA)) {
    const padreId = contenedorPara('municipio', grupo);
    // Defensa si hay enemigos cerca; si no, alterna economia y comida.
    const prioridad = hayEnemigoCerca(copia, grupo, jugadorId)
      ? 'defensa'
      : (cantidad('freguesia') % 2 === 0 ? 'economia' : 'comida');
    crear({
      nombre: `Freguesia ${cantidad('freguesia') + 1}`, tipoSubdivision: 'freguesia',
      padreId, prioridad, ciudades: grupo,
    });
  }
  return ponerCabeceras();
}
