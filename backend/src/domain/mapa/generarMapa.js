import { entero } from './rng.js';
import { crearRuido } from './ruido.js';
import { ReglaError } from './errores.js';

// Umbrales sobre el campo de elevacion, en [0, 1]. Calibrados para dejar
// aproximadamente 25-35% de agua con costas irregulares.
const NIVEL_MAR = 0.42;
const NIVEL_COLINA = 0.62;
const NIVEL_MONTANA = 0.78;

// Umbrales sobre el campo de humedad para la tierra baja.
const HUMEDAD_BOSQUE = 0.6;
const HUMEDAD_DESIERTO = 0.35;

function terrenoDe(elevacion, humedad) {
  if (elevacion < NIVEL_MAR) return 'water';
  if (elevacion >= NIVEL_MONTANA) return 'mountains';
  if (elevacion >= NIVEL_COLINA) return 'hills';
  if (humedad >= HUMEDAD_BOSQUE) return 'forest';
  if (humedad < HUMEDAD_DESIERTO) return 'desert';
  return 'plains';
}

export function generarMapa(semilla, tamano) {
  // Dos campos independientes: el relieve decide mar/colina/montana, la
  // humedad decide que crece en la tierra baja. Pasos distintos para que los
  // biomas no calquen la forma del relieve.
  const elevacion = crearRuido(`elev:${semilla}`, tamano, 4);
  const humedad = crearRuido(`humedad:${semilla}`, tamano, 6);

  const mapa = [];
  for (let y = 0; y < tamano; y++) {
    for (let x = 0; x < tamano; x++) {
      mapa.push({
        x,
        y,
        terreno: terrenoDe(elevacion(x, y), humedad(x, y)),
        recurso: null,
        dueno: null,
        ciudad: null,
        ejercito: null,
        descubiertoPor: []
      });
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
