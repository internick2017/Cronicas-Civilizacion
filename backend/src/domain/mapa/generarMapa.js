import { entero, crearRng } from './rng.js';
import { crearRuido } from './ruido.js';
import { ReglaError } from './errores.js';

// Proporciones objetivo por bioma, como fraccion del total de casillas.
// Son CUANTILES, no umbrales absolutos: crearRuido con paso fijo genera pocos
// puntos de grilla gruesa cuando el mapa es chico, asi que el RANGO real de
// valores de un campo de ruido varia mucho de una semilla a otra (medido: en
// tamano 10, un umbral absoluto como 0.42 dejaba entre 5% y 79% de agua segun
// la semilla). Cortar por posicion en el arreglo ordenado en vez de por valor
// fijo garantiza la proporcion exacta sin importar el rango que haya salido,
// asi que el resultado es estable en cualquier tamano y semilla. La FORMA de
// las costas y de los biomas sigue saliendo del ruido; el cuantil solo decide
// donde cae el corte.
const PROPORCION_AGUA = 0.3;
const PROPORCION_MONTANA = 0.08;
const PROPORCION_COLINA = 0.15;

// Mismo problema de rango variable aplica a la humedad, asi que tambien se
// corta por cuantil.
const PROPORCION_HUMEDAD_DESIERTO = 0.35;
const PROPORCION_HUMEDAD_BOSQUE = 0.4;

// Valor en la posicion `proporcion` de un arreglo ya ordenado ascendentemente.
function cuantil(valoresOrdenados, proporcion) {
  const i = Math.min(
    valoresOrdenados.length - 1,
    Math.max(0, Math.floor(proporcion * valoresOrdenados.length))
  );
  return valoresOrdenados[i];
}

// Que recurso puede aparecer en cada terreno. El primero es el mas probable.
const RECURSO_POR_TERRENO = {
  mountains: ['stone', 'stone', 'gold'],
  hills: ['stone', 'gold'],
  forest: ['wood', 'wood', 'food'],
  plains: ['food', 'food', 'wood'],
  desert: ['gold'],
  water: []
};

const dentro = (x, y, tamano) => x >= 0 && x < tamano && y >= 0 && y < tamano;
const VECINOS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Traza rios desde puntos altos: se baja siempre al vecino de menor elevacion
// hasta tocar agua, el borde, o quedarse sin pendiente. "Terreno alto" se
// define por el mismo cuantil que decide colinas/montanas (cortes.colina),
// no por un umbral absoluto: el corte de colina ya es el punto de la
// distribucion de elevacion que separa "alto" de "bajo" en este mapa.
// Exportada para poder probar el trazado de rios de forma directa: es una
// funcion de dominio pura (sin I/O), asi que testearla aislada del ruido y
// de los cuantiles del mapa completo permite verificar sus propiedades reales
// (camino contiguo, nacimiento en terreno alto) con mapas y elevaciones
// sinteticas y controladas.
export function trazarRios(mapa, tamano, elevacion, umbralAlto, rng) {
  const cantidad = Math.max(1, Math.floor(tamano / 8));
  const largoMax = tamano * 2;

  for (let i = 0; i < cantidad; i++) {
    let x = entero(rng, tamano);
    let y = entero(rng, tamano);
    // Solo nacen en terreno alto; si el sorteo cayo bajo, se descarta el rio.
    if (elevacion(x, y) < umbralAlto) continue;

    const visitados = new Set();
    for (let paso = 0; paso < largoMax; paso++) {
      const clave = `${x},${y}`;
      if (visitados.has(clave)) break; // se mordio la cola
      visitados.add(clave);

      const tile = mapa[y * tamano + x];
      if (tile.terreno === 'water') break; // llego al mar
      tile.terreno = 'water';

      let mejor = null;
      let mejorElev = Infinity;
      for (const [dx, dy] of VECINOS) {
        const nx = x + dx, ny = y + dy;
        if (!dentro(nx, ny, tamano)) { mejor = null; break; } // llego al borde
        const e = elevacion(nx, ny);
        if (e < mejorElev) { mejorElev = e; mejor = { x: nx, y: ny }; }
      }
      if (!mejor || mejorElev >= elevacion(x, y)) break; // sin pendiente
      x = mejor.x;
      y = mejor.y;
    }
  }
}

// Siembra focos y los hace crecer por casillas contiguas del mismo recurso.
//
// El piso de focos es un MINIMO GARANTIZADO, no un numero de intentos: un
// intento que cae en agua o en un tile ya ocupado se descarta y se reintenta,
// en vez de perderse. Sin esto, en tamano 10 (100 tiles, 30% agua) el viejo
// piso de max(2, floor(tamano^2/40))=2 focos podia caer los dos en agua y
// dejar el mapa entero sin recursos: una partida rota, porque nadie puede
// producir. El piso de 6 se eligio para que, incluso perdiendo alguno por
// mala suerte de adyacencia, tamano 10 siga con varios yacimientos jugables;
// en tamanos grandes el termino tamano^2/40 ya lo supera y manda el.
function sembrarRecursos(mapa, tamano, rng) {
  const focosObjetivo = Math.max(6, Math.floor((tamano * tamano) / 40));
  // Tope de intentos generoso para no colgarse si el sorteo tiene mala
  // suerte reiterada (mapa casi todo agua, semilla desfavorable, etc).
  const intentosMax = focosObjetivo * 30;

  let colocados = 0;
  let intentos = 0;

  while (colocados < focosObjetivo && intentos < intentosMax) {
    intentos++;

    const x = entero(rng, tamano);
    const y = entero(rng, tamano);
    const semillaTile = mapa[y * tamano + x];
    if (semillaTile.recurso !== null) continue; // tile ya ocupado: reintentar

    const opciones = RECURSO_POR_TERRENO[semillaTile.terreno];
    if (!opciones || opciones.length === 0) continue; // agua o sin recurso: reintentar

    const recurso = opciones[entero(rng, opciones.length)];
    const tamanoYacimiento = 2 + entero(rng, 4); // 2 a 5 casillas
    const pendientes = [semillaTile];
    let puestos = 0;

    while (pendientes.length > 0 && puestos < tamanoYacimiento) {
      const actual = pendientes.shift();
      const permitidos = RECURSO_POR_TERRENO[actual.terreno] || [];
      if (actual.recurso !== null || !permitidos.includes(recurso)) continue;

      actual.recurso = recurso;
      puestos++;

      for (const [dx, dy] of VECINOS) {
        const nx = actual.x + dx, ny = actual.y + dy;
        if (dentro(nx, ny, tamano)) pendientes.push(mapa[ny * tamano + nx]);
      }
    }

    // La semilla del foco siempre pasa las validaciones de arriba, asi que
    // puestos >= 1 acá: el foco quedo efectivamente colocado.
    colocados++;
  }
}

function terrenoDe(elevacion, humedad, cortes) {
  if (elevacion < cortes.mar) return 'water';
  if (elevacion >= cortes.montana) return 'mountains';
  if (elevacion >= cortes.colina) return 'hills';
  if (humedad >= cortes.bosque) return 'forest';
  if (humedad < cortes.desierto) return 'desert';
  return 'plains';
}

export function generarMapa(semilla, tamano) {
  // Dos campos independientes: el relieve decide mar/colina/montana, la
  // humedad decide que crece en la tierra baja. Pasos distintos para que los
  // biomas no calquen la forma del relieve.
  const elevacion = crearRuido(`elev:${semilla}`, tamano, 4);
  const humedad = crearRuido(`humedad:${semilla}`, tamano, 6);

  const elevaciones = [];
  const humedades = [];
  for (let y = 0; y < tamano; y++) {
    for (let x = 0; x < tamano; x++) {
      elevaciones.push(elevacion(x, y));
      humedades.push(humedad(x, y));
    }
  }

  const elevacionesOrdenadas = [...elevaciones].sort((a, b) => a - b);
  const humedadesOrdenadas = [...humedades].sort((a, b) => a - b);

  const cortes = {
    mar: cuantil(elevacionesOrdenadas, PROPORCION_AGUA),
    montana: cuantil(elevacionesOrdenadas, 1 - PROPORCION_MONTANA),
    colina: cuantil(elevacionesOrdenadas, 1 - PROPORCION_MONTANA - PROPORCION_COLINA),
    desierto: cuantil(humedadesOrdenadas, PROPORCION_HUMEDAD_DESIERTO),
    bosque: cuantil(humedadesOrdenadas, 1 - PROPORCION_HUMEDAD_BOSQUE)
  };

  const mapa = [];
  let i = 0;
  for (let y = 0; y < tamano; y++) {
    for (let x = 0; x < tamano; x++) {
      mapa.push({
        x,
        y,
        terreno: terrenoDe(elevaciones[i], humedades[i], cortes),
        recurso: null,
        dueno: null,
        ciudad: null,
        ejercito: null,
        descubiertoPor: []
      });
      i++;
    }
  }

  const rng = crearRng(`mapa:${semilla}`);
  trazarRios(mapa, tamano, elevacion, cortes.colina, rng);
  sembrarRecursos(mapa, tamano, rng);
  return mapa;
}

export function posicionesIniciales(mapa, tamano, cantidad, rng) {
  const minDist = Math.floor(tamano / 4);
  const pos = [];
  for (let intentos = 0; intentos < 500 && pos.length < cantidad; intentos++) {
    const x = entero(rng, tamano);
    const y = entero(rng, tamano);
    const tile = mapa[y * tamano + x];
    if (tile.terreno === 'water' || tile.ciudad) continue;
    const noDuplicado = !pos.some(p => p.x === x && p.y === y);
    const lejos = pos.every(p => Math.abs(p.x - x) + Math.abs(p.y - y) >= minDist);
    if (noDuplicado && lejos) pos.push({ x, y });
  }
  if (pos.length < cantidad) {
    throw new ReglaError('MAPA_SIN_POSICIONES', `No hay ${cantidad} posiciones iniciales viables en este mapa`);
  }
  return pos;
}
