import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

// El frontend no tiene tests: esto vive aca para que un tema nuevo no pueda dejar
// un boton ilegible. Medir pantallas abiertas se salteaba los dialogos.
const css = readFileSync(new URL('../../../frontend/src/mapa/temas.css', import.meta.url), 'utf8');

const bloqueDe = (selector, hasta) => css.slice(css.indexOf(selector), css.indexOf(hasta));
const TEMAS = {
  mando: bloqueDe(':root {', ":root[data-tema='campana']"),
  campana: bloqueDe(":root[data-tema='campana']", ":root[data-tema='mesa'] {"),
  mesa: bloqueDe(":root[data-tema='mesa'] {", '.map-session, .map-lobby'),
};

const colorDe = (tema, nombre) => {
  const m = TEMAS[tema].match(new RegExp(`--t-${nombre}: (\\d+) (\\d+) (\\d+);`));
  return m.slice(1).map(Number);
};
const luminancia = (rgb) => {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

// [texto, fondo]: las parejas que usan los componentes.
const PAREJAS = [
  ['texto', 'fondo'], ['texto', 'panel'], ['texto', 'control'], ['texto-suave', 'panel'], ['texto-tenue', 'panel'],
  ['exito', 'panel'], ['aviso', 'panel'], ['alerta', 'panel'], ['peligro', 'panel'], ['info', 'panel'],
  ['sobre-cta', 'cta'], ['sobre-cta', 'alerta'], ['sobre', 'exito-fuerte'], ['sobre', 'peligro-fuerte'],
];

describe('contraste de los temas', () => {
  for (const tema of Object.keys(TEMAS)) {
    it.each(PAREJAS)(`${tema}: %s sobre %s llega a 4,5`, (texto, fondo) => {
      expect(contraste(colorDe(tema, texto), colorDe(tema, fondo))).toBeGreaterThanOrEqual(4.5);
    });
  }
});
