import { jugadorPorId } from './MapGame.js';
import { aplicar } from './aplicar.js';
import { evento } from './reglas/comun.js';
import { formaEstadoDe } from './reglas/gobierno.js';
import {
  crearSubdivision, quitarSubdivision, subdivisionesDe, subdivisionDeCiudad, territorioDe,
} from './reglas/subdivisiones.js';
import { IA_ORGANIZA_SUBDIVISIONES } from './constantes.js';

// Como la maquina arma su Estado federal (pedido del usuario: "la IA crea subdivisiones").
// Se organiza sola, sin que nadie se lo pida:
//   - con 3 ciudades o mas pasa a federal y NO vuelve a unitario;
//   - agrupa las ciudades sueltas por cercania en Freguesias de hasta 3;
//   - mete cada Freguesia en el Municipio mas cercano que tenga lugar (hasta 3), o
//     crea uno nuevo;
//   - a partir de 4 Municipios sin padre, los nuevos cuelgan de un Departamento (hasta 4).
// No hay "reubicar": una subdivision no cambia de padre, asi que los primeros Municipios
// quedan directos bajo el Pais.
// Trabaja sobre una COPIA y devuelve los eventos (como administrarSubdivisiones).
const CIUDADES_PARA_FEDERAL = 3;
const CIUDADES_POR_FREGUESIA = 3;
const FREGUESIAS_POR_MUNICIPIO = 3;
const MUNICIPIOS_SIN_PADRE_MAXIMOS = 4;
const MUNICIPIOS_POR_DEPARTAMENTO = 4;
const DISTANCIA_ENEMIGO = 3;

const distancia = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

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

  const sueltas = propias(copia)
    .filter(c => !subdivisionDeCiudad(jugador(), c.x, c.y))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  if (sueltas.length === 0) return eventos;

  const cantidad = (tipo) => subdivisionesDe(jugador()).filter(s => s.tipo === tipo).length;
  const crear = (datos) => {
    const evs = crearSubdivision(copia, jugadorId, datos);
    emitir(evs);
    return evs[0].datos.id;
  };

  // El Municipio donde cabe la Freguesia: el mas cercano a sus ciudades con lugar libre.
  function municipioPara(ciudades) {
    const subs = subdivisionesDe(jugador());
    const conLugar = subs
      .filter(s => s.tipo === 'municipio' && subs.filter(f => f.padreId === s.id).length < FREGUESIAS_POR_MUNICIPIO)
      .map(s => ({ s, d: Math.min(...ciudades.flatMap(c => territorioDe(jugador(), s).map(t => distancia(t, c))), Infinity) }))
      .sort((a, b) => a.d - b.d || a.s.id.localeCompare(b.s.id));
    if (conLugar.length > 0 && Number.isFinite(conLugar[0].d)) return conLugar[0].s.id;
    // Uno nuevo. Pasados los primeros, cuelga de un Departamento (uno con lugar, o uno nuevo).
    const sinPadre = subs.filter(s => s.tipo === 'municipio' && !s.padreId).length;
    let padreId = null;
    if (sinPadre >= MUNICIPIOS_SIN_PADRE_MAXIMOS) {
      const deptos = subs.filter(s => s.tipo === 'departamento')
        .filter(d => subs.filter(m => m.padreId === d.id).length < MUNICIPIOS_POR_DEPARTAMENTO);
      padreId = deptos.length > 0
        ? deptos[0].id
        : crear({ nombre: `Departamento ${cantidad('departamento') + 1}`, tipoSubdivision: 'departamento' });
    }
    return crear({ nombre: `Municipio ${cantidad('municipio') + 1}`, tipoSubdivision: 'municipio', padreId });
  }

  for (const grupo of agruparCercanos(sueltas, CIUDADES_POR_FREGUESIA)) {
    const padreId = municipioPara(grupo);
    // Defensa si hay enemigos cerca; si no, alterna economia y comida.
    const prioridad = hayEnemigoCerca(copia, grupo, jugadorId)
      ? 'defensa'
      : (cantidad('freguesia') % 2 === 0 ? 'economia' : 'comida');
    crear({
      nombre: `Freguesia ${cantidad('freguesia') + 1}`, tipoSubdivision: 'freguesia',
      padreId, prioridad, ciudades: grupo,
    });
  }
  return eventos;
}
