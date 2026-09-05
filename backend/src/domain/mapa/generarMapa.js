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
// Cuanta agua lleva un mapa de ISLAS. Sin subirla, encender el modo islas casi
// no hacia nada: medido sobre 40 semillas, con el 30% de siempre solo 10 mapas
// tenian dos masas de tierra lo bastante grandes como para repartir capitales,
// asi que 3 de cada 4 partidas "de islas" arrancaban como una partida normal.
// Con 50% son 36 de 40. Es mucha agua a proposito: un archipielago tiene que
// parecer un archipielago, y el transporte solo tiene sentido si hay que cruzar.
const PROPORCION_AGUA_ISLAS = 0.5;
// Cuanto pesa la MASCARA DE ISLAS contra el ruido al armar la elevacion del
// modo islas. Con 0 el mapa vuelve a ser el de antes (un solo continente
// inundado); con 1 salen islas circulares de videojuego viejo. El ruido tiene
// que seguir mandando en la FORMA de la costa, y la mascara solo en DONDE hay
// tierra, asi que la mascara pesa un poco mas de la mitad.
//
// Barrido medido en 20x20, 150 mapas por valor (archipielago real = ninguna
// masa con mas del 60% de la tierra):
//
//   peso 0.55 -> 37% | 0.62 -> 40% | 0.70 -> 41% | 0.80 -> 45% | 0.90 -> 49%
//
// Subirlo rinde poco y cuesta redondez: de 0.62 a 0.90 se ganan 9 puntos y las
// islas empiezan a verse dibujadas con compas. Si alguna vez se quiere mas
// separacion a costa de la forma, la perilla es esta y esta es la tabla.
const PESO_MASCARA_ISLAS = 0.62;

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

// Campo de "islas": K focos repartidos por el mapa, cada uno con una caida
// radial suave. Se SUMA a la elevacion del ruido en el modo islas.
//
// Por que hace falta. El generador arma un solo campo de ruido suave y corta
// por cuantil, asi que subir el agua al 50% no crea islas: inunda los bordes
// del mismo continente. Medido sobre 450 mapas: solo ~22% de los mapas de
// islas eran un archipielago de verdad (ninguna masa con mas del 60% de la
// tierra), y en la mediana la masa mayor se quedaba con el 79%. "Mapa de
// islas" era un pedido, no una garantia.
//
// La mascara invierte el orden causal: primero se decide donde van las islas,
// despues el ruido les da forma de costa. El corte por cuantil sigue igual, o
// sea que la proporcion de agua no cambia; lo que cambia es como se reparte.
function crearMascaraIslas(semilla, tamano) {
  const rng = crearRng(`islas:${semilla}`);
  // Cuantas islas. Crece con el lado del mapa, no con el area: lo que importa
  // es que haya lugar para separarlas. Piso de 3 para que siempre haya mas
  // islas que jugadores (hoy son 2) y el reparto tenga de donde elegir.
  const cantidad = Math.max(2, Math.round(tamano / 7));
  // El radio NO es un factor inventado: sale de la tierra que va a haber. El
  // corte por cuantil deja PROPORCION_AGUA_ISLAS de agua, o sea que la tierra
  // es (1 - esa proporcion) del mapa, repartida entre `cantidad` islas. De
  // area = pi*r^2 por isla se despeja el radio. Si el radio se elige mas
  // grande que eso, las mascaras se solapan, el cuantil no llega a separarlas
  // y vuelve el continente dominante: fue exactamente lo que paso al primer
  // intento (funcionaba en 28x28 y no movia nada en 20x20 ni 14x14).
  const tierraPorIsla = (1 - PROPORCION_AGUA_ISLAS) * tamano * tamano / cantidad;
  const radio = Math.sqrt(tierraPorIsla / Math.PI);
  // Separacion minima entre centros: dos radios, o sea que dos islas vecinas
  // apenas se tocan en el peor caso. Con menos se funden.
  const separacionMin = radio * 2;

  const centros = [];
  const objetivo = cantidad;
  const intentosMax = objetivo * 60;
  for (let intentos = 0; centros.length < objetivo && intentos < intentosMax; intentos++) {
    // Margen para que el centro no caiga pegado al borde y quede media isla
    // fuera del mapa.
    const margen = radio * 0.45;
    const x = margen + rng() * (tamano - 2 * margen);
    const y = margen + rng() * (tamano - 2 * margen);
    const lejos = centros.every(c => Math.hypot(c.x - x, c.y - y) >= separacionMin);
    if (lejos) centros.push({ x, y });
  }

  return function mascara(x, y) {
    let mejor = 0;
    for (const c of centros) {
      const d = Math.hypot(c.x - x, c.y - y) / radio;
      if (d >= 1) continue;
      // Caida suave (smoothstep invertida): borde difuso, para que la costa la
      // termine de decidir el ruido y no se vea el circulo.
      const t = 1 - d;
      const v = t * t * (3 - 2 * t);
      if (v > mejor) mejor = v;
    }
    return mejor;
  };
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
export function generarMapa(semilla, tamano, { rios = true, islas = false } = {}) {
  // Dos campos independientes: el relieve decide mar/colina/montana, la
  // humedad decide que crece en la tierra baja. Pasos distintos para que los
  // biomas no calquen la forma del relieve.
  const ruidoElevacion = crearRuido(`elev:${semilla}`, tamano, 4);
  const humedad = crearRuido(`humedad:${semilla}`, tamano, 6);

  // En el modo islas la elevacion no es solo ruido: se le suma una mascara que
  // decide DONDE van las islas (ver crearMascaraIslas). Fuera del modo islas el
  // mapa se genera exactamente como antes.
  const elevacion = islas
    ? (() => {
        const mascara = crearMascaraIslas(semilla, tamano);
        return (x, y) => ruidoElevacion(x, y) * (1 - PESO_MASCARA_ISLAS) + mascara(x, y) * PESO_MASCARA_ISLAS;
      })()
    : ruidoElevacion;

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
    mar: cuantil(elevacionesOrdenadas, islas ? PROPORCION_AGUA_ISLAS : PROPORCION_AGUA),
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

// Todas las masas de tierra conectadas por vecinos ortogonales, de la mas
// grande a la mas chica. El rio cuenta como tierra (ver ADR 0001), asi que un
// arroyo ya no parte un continente en dos.
export function masasDeTierra(mapa, tamano) {
  const visitado = new Uint8Array(tamano * tamano);
  const masas = [];

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

    masas.push(componente);
  }

  return masas.sort((a, b) => b.size - a.size);
}

// La masa de tierra mas grande. Es donde se reparten las capitales cuando la
// partida NO usa islas: sin transportes, un jugador en otra isla no podria ser
// alcanzado ni alcanzar a nadie, y la partida no podria terminar.
export function masaPrincipal(mapa, tamano) {
  return masasDeTierra(mapa, tamano)[0] ?? new Set();
}

// Que fraccion de la tierra tiene que tener una masa para que valga la pena
// empezar una civilizacion ahi. Con menos, el jugador amanece en un peñasco sin
// lugar para fundar una segunda ciudad: tendria partida perdida antes de mover.
const FRACCION_MINIMA_MASA = 0.10;

/**
 * Donde arranca cada jugador.
 *
 * Con `islas: false` (el default historico) todas las capitales caen en la masa
 * de tierra mas grande. Con `islas: true` se reparten entre las masas que sean
 * lo bastante grandes como para jugar en ellas, y ahi el transporte deja de ser
 * decorativo: la unica forma de llegar al rival es cruzar.
 *
 * Si la semilla no da suficientes masas grandes, se CAE al comportamiento de
 * siempre en vez de repartir a la fuerza. Es a proposito: el modo islas puede
 * no estar disponible en un mapa dado, y eso es preferible a arrancar una
 * partida donde alguien nace en un peñasco de cuatro casillas.
 */
export function posicionesIniciales(mapa, tamano, cantidad, rng, { islas = false } = {}) {
  const masa = masaPrincipal(mapa, tamano);
  let porMasa = null;

  if (islas) {
    const tierra = mapa.filter(t => t.terreno !== 'water').length;
    const grandes = masasDeTierra(mapa, tamano)
      .filter(m => m.size >= tierra * FRACCION_MINIMA_MASA);
    // Hacen falta al menos dos masas jugables para que "islas" signifique algo.
    if (grandes.length >= 2) porMasa = grandes;
  }

  if (porMasa) {
    // Una capital por masa, dando la vuelta si hay mas jugadores que masas.
    const pos = [];
    for (let i = 0; i < cantidad; i++) {
      const candidatos = [...porMasa[i % porMasa.length]]
        .filter(idx => !mapa[idx].ciudad && !pos.some(p => p.x === idx % tamano && p.y === Math.floor(idx / tamano)));
      if (candidatos.length === 0) { pos.length = 0; break; }
      const idx = candidatos[entero(rng, candidatos.length)];
      pos.push({ x: idx % tamano, y: Math.floor(idx / tamano) });
    }
    if (pos.length === cantidad) return pos;
    // Si no se pudo, sigue de largo al reparto de siempre.
  }

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
