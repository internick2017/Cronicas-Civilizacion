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
  water: [],
  river: ['food']
};

const dentro = (x, y, tamano) => x >= 0 && x < tamano && y >= 0 && y < tamano;
const VECINOS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Traza rios desde puntos altos: se baja siempre al vecino de menor elevacion
// hasta tocar el mar, el borde, o quedarse sin pendiente. "Terreno alto" se
// define por el mismo cuantil que decide colinas/montanas (cortes.colina),
// no por un umbral absoluto: el corte de colina ya es el punto de la
// distribucion de elevacion que separa "alto" de "bajo" en este mapa.
// Exportada para poder probar el trazado de rios de forma directa: es una
// funcion de dominio pura (sin I/O), asi que testearla aislada del ruido y
// de los cuantiles del mapa completo permite verificar sus propiedades reales
// (camino contiguo, nacimiento en terreno alto) con mapas y elevaciones
// sinteticas y controladas.
export function trazarRios(mapa, tamano, elevacion, umbralAlto, rng) {
  // El objetivo es un MINIMO GARANTIZADO, no un numero de intentos: mismo
  // patron que sembrarRecursos mas abajo, y por el mismo motivo. Antes esto
  // era un `for` de `cantidad` vueltas donde un nacimiento sorteado en terreno
  // bajo se PERDIA en vez de reintentarse, y como el umbral de terreno alto es
  // el cuantil 0.77 de elevacion, casi 8 de cada 10 sorteos se tiraban a la
  // basura. Medido con 40 semillas por tamano: en tamano 30 solo 20 de 40
  // mapas tenian algun rio, con un promedio de 2 casillas de rio en 900. O sea
  // que el rio existia en el codigo y no en las partidas.
  const objetivo = Math.max(1, Math.floor(tamano / 8));
  const largoMax = tamano * 2;
  // Tope generoso para no colgarse si la semilla tiene mala suerte reiterada
  // (mapa sin terreno alto, elevacion pareja, etc).
  const intentosMax = objetivo * 30;

  let trazados = 0;
  let intentos = 0;

  while (trazados < objetivo && intentos < intentosMax) {
    intentos++;

    let x = entero(rng, tamano);
    let y = entero(rng, tamano);
    // Solo nacen en terreno alto; si el sorteo cayo bajo, se REINTENTA.
    if (elevacion(x, y) < umbralAlto) continue;

    trazados++;
    const visitados = new Set();
    for (let paso = 0; paso < largoMax; paso++) {
      const clave = `${x},${y}`;
      if (visitados.has(clave)) break; // se mordio la cola
      visitados.add(clave);

      const tile = mapa[y * tamano + x];
      if (tile.terreno === 'water') break; // llego al mar
      // 'river', no 'water': el rio es tierra vadeable (ver constantes.js).
      // Si el descenso cae sobre otro rio no se corta, se sigue bajando: los
      // afluentes se juntan, que es lo que hacen los rios.
      tile.terreno = 'river';

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

// El parametro `rios` es opcional (default true) para no romper la firma
// existente. Se usa desde los tests para aislar el efecto del trazado de
// rios sobre la conectividad del terreno, comparando el mismo mapa base con
// y sin ese paso.
export function generarMapa(semilla, tamano, { rios = true } = {}) {
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
  if (rios) trazarRios(mapa, tamano, elevacion, cortes.colina, rng);
  sembrarRecursos(mapa, tamano, rng);
  return mapa;
}

// Todas las masas de tierra conectadas por vecinos ortogonales. Devuelve la
// mas grande. Es la unica zona donde se pueden repartir capitales: sin
// unidades navales, un jugador en otra isla nunca podria ser alcanzado ni
// alcanzar a nadie, y la partida no podria terminar.
export function masaPrincipal(mapa, tamano) {
  const visitado = new Uint8Array(tamano * tamano);
  let mayor = new Set();

  for (let i = 0; i < mapa.length; i++) {
    if (visitado[i] || mapa[i].terreno === 'water') continue;

    const componente = new Set();
    const cola = [i];
    visitado[i] = 1;

    while (cola.length > 0) {
      const idx = cola.pop();
      componente.add(idx);
      const x = idx % tamano;
      const y = Math.floor(idx / tamano);

      for (const [dx, dy] of VECINOS) {
        const nx = x + dx, ny = y + dy;
        if (!dentro(nx, ny, tamano)) continue;
        const vecino = ny * tamano + nx;
        if (visitado[vecino] || mapa[vecino].terreno === 'water') continue;
        visitado[vecino] = 1;
        cola.push(vecino);
      }
    }

    if (componente.size > mayor.size) mayor = componente;
  }

  return mayor;
}

export function posicionesIniciales(mapa, tamano, cantidad, rng) {
  const masa = masaPrincipal(mapa, tamano);
  const candidatos = [...masa].filter(idx => !mapa[idx].ciudad);
  if (candidatos.length < cantidad) {
    throw new ReglaError('MAPA_SIN_POSICIONES', `No hay ${cantidad} posiciones iniciales viables en este mapa`);
  }

  // Se intenta la separacion ideal y se va aflojando. Antes eran 500 intentos
  // ciegos con una distancia fija: en mapas ajustados fallaba de mas.
  const distancias = [
    Math.floor(tamano / 4),
    Math.floor(tamano / 5),
    Math.floor(tamano / 6),
    2,
    0
  ];

  for (const minDist of distancias) {
    const pos = [];
    for (let intentos = 0; intentos < 2000 && pos.length < cantidad; intentos++) {
      const idx = candidatos[entero(rng, candidatos.length)];
      const x = idx % tamano;
      const y = Math.floor(idx / tamano);
      const noDuplicado = !pos.some(p => p.x === x && p.y === y);
      const lejos = pos.every(p => Math.abs(p.x - x) + Math.abs(p.y - y) >= minDist);
      if (noDuplicado && lejos) pos.push({ x, y });
    }
    if (pos.length === cantidad) return pos;
  }

  throw new ReglaError('MAPA_SIN_POSICIONES', `No hay ${cantidad} posiciones iniciales viables en este mapa`);
}
