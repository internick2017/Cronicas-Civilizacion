import { crearRng, entero } from './rng.js';
import { TERRENOS, RECURSOS_DE_TILE } from './constantes.js';
import { ReglaError } from './errores.js';

const TIERRA = TERRENOS.filter(t => t !== 'water');

export function generarMapa(semilla, tamano) {
  const rng = crearRng(`mapa:${semilla}`);
  const mapa = [];
  let agua = 0;
  const maxAgua = Math.floor(tamano * tamano * 0.15);
  for (let y = 0; y < tamano; y++) {
    for (let x = 0; x < tamano; x++) {
      let terreno = TERRENOS[entero(rng, TERRENOS.length)];
      if (terreno === 'water') {
        agua++;
        if (agua > maxAgua) terreno = TIERRA[entero(rng, TIERRA.length)];
      }
      const recurso = rng() < 0.3 ? RECURSOS_DE_TILE[entero(rng, RECURSOS_DE_TILE.length)] : null;
      mapa.push({ x, y, terreno, recurso, dueno: null, ciudad: null, ejercito: null, descubiertoPor: [] });
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
