import { crearRng } from './rng.js';

// Ruido de valor: se sortean valores en una grilla gruesa (cada `paso` casillas)
// y se interpolan. La interpolacion suavizada (smoothstep) evita los bordes
// rectos que deja la interpolacion lineal pura.
const suavizar = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

export function crearRuido(semilla, tamano, paso = 4) {
  const rng = crearRng(`ruido:${semilla}:${paso}`);
  const lado = Math.ceil(tamano / paso) + 2;
  const puntos = new Float64Array(lado * lado);
  for (let i = 0; i < puntos.length; i++) puntos[i] = rng();

  const puntoEn = (gx, gy) => {
    const cx = Math.min(Math.max(gx, 0), lado - 1);
    const cy = Math.min(Math.max(gy, 0), lado - 1);
    return puntos[cy * lado + cx];
  };

  return function ruido(x, y) {
    const gx = Math.floor(x / paso);
    const gy = Math.floor(y / paso);
    const tx = suavizar((x - gx * paso) / paso);
    const ty = suavizar((y - gy * paso) / paso);
    const arriba = lerp(puntoEn(gx, gy), puntoEn(gx + 1, gy), tx);
    const abajo = lerp(puntoEn(gx, gy + 1), puntoEn(gx + 1, gy + 1), tx);
    return lerp(arriba, abajo, ty);
  };
}
