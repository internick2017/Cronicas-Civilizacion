import { entero } from './rng.js';
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
