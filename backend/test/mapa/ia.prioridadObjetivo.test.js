import { describe, it, expect } from 'vitest';
import { crearEstado, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { jugarTurnoIA } from '../../src/domain/mapa/ia.js';
import { crearRng } from '../../src/domain/mapa/rng.js';

// Cruz de 3x3 alrededor del ejercito del bot en (1,1): arriba y abajo se pueden
// poner objetivos distintos para ver CUAL elige. El orden en que decidirMilitar
// mira los vecinos es [arriba, abajo, izquierda, derecha], asi que poner el
// objetivo "malo" ARRIBA prueba que la eleccion es por prioridad y no por orden.
function cruz({ arriba, abajo, dificultadIA = 'dificil' } = {}) {
  const e = crearEstado({ nombre: 'T', semilla: 'objetivo' });
  aplicar(e, unirse(e, { id: 'bot', nombre: 'M', civilizacion: 'A', esBot: true, dificultadIA }));
  aplicar(e, unirse(e, { id: 'riv', nombre: 'R', civilizacion: 'B' }));
  aplicar(e, iniciar(e));
  e.config.tamanoMapa = 3;
  const tile = (x, y, extra) => ({ x, y, terreno: 'plains', recurso: null, dueno: null, ciudad: null, ejercito: null, descubiertoPor: ['bot', 'riv'], ...extra });
  e.mapa = [];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) e.mapa.push(tile(x, y));

  // Ciudad propia (para que no lo eliminen) y el ejercito atacante al lado.
  tileEn(e, 0, 1).dueno = 'bot';
  tileEn(e, 0, 1).ciudad = { nombre: 'B1', nivel: 1, poblacion: 500, edificios: [] };
  tileEn(e, 1, 1).dueno = 'bot';
  tileEn(e, 1, 1).ejercito = { tipo: 'cavalry', dueno: 'bot', salud: 120, movimientoRestante: 3, bonoMovimiento: 0 };

  const poner = (x, y, que) => {
    const t = tileEn(e, x, y);
    t.dueno = 'riv';
    if (que === 'ciudad') t.ciudad = { nombre: 'R', nivel: 1, poblacion: 500, edificios: [] };
    if (que === 'ciudadDefendida') {
      t.ciudad = { nombre: 'R', nivel: 1, poblacion: 500, edificios: [] };
      t.ejercito = { tipo: 'warrior', dueno: 'riv', salud: 100, movimientoRestante: 0, bonoMovimiento: 0 };
    }
    if (que === 'ejercito') t.ejercito = { tipo: 'warrior', dueno: 'riv', salud: 100, movimientoRestante: 0, bonoMovimiento: 0 };
  };
  if (arriba) poner(1, 0, arriba);
  if (abajo) poner(1, 2, abajo);
  e.jugadores.find(j => j.id === 'bot').recursos = { food: 0, gold: 0, wood: 0, stone: 0, science: 0, culture: 0 };
  return e;
}

const atacoA = (eventos) => {
  const combate = eventos.find(ev => ev.tipo === 'CombateResuelto');
  return combate ? `${combate.datos.hasta.x},${combate.datos.hasta.y}` : null;
};

describe('contra que ataca la IA cuando tiene varias opciones', () => {
  it('prefiere la ciudad indefensa sobre el ejercito en campo abierto', () => {
    // El ejercito enemigo esta ARRIBA (el primero que mira) y la ciudad ABAJO.
    const e = cruz({ arriba: 'ejercito', abajo: 'ciudad' });
    expect(atacoA(jugarTurnoIA(e, 'bot', crearRng('obj-1')))).toBe('1,2');
  });

  it('prefiere la ciudad aunque este defendida: matar la guarnicion es el paso previo', () => {
    const e = cruz({ arriba: 'ejercito', abajo: 'ciudadDefendida' });
    expect(atacoA(jugarTurnoIA(e, 'bot', crearRng('obj-2')))).toBe('1,2');
  });

  it('entre dos ciudades, prefiere la que NO tiene defensor: es la unica que se captura', () => {
    const e = cruz({ arriba: 'ciudadDefendida', abajo: 'ciudad' });
    expect(atacoA(jugarTurnoIA(e, 'bot', crearRng('obj-3')))).toBe('1,2');
  });

  it('si solo hay un ejercito enemigo, lo ataca igual', () => {
    const e = cruz({ arriba: 'ejercito' });
    expect(atacoA(jugarTurnoIA(e, 'bot', crearRng('obj-4')))).toBe('1,0');
  });

  it('no fuerza un ataque que su margen desaconseja: con un guerrero contra una ciudad, no ataca', () => {
    const e = cruz({ abajo: 'ciudad' });
    // Guerrero (ataque 10) contra ciudad nivel 1 (10 x 1.5 = 15): perdida segura.
    tileEn(e, 1, 1).ejercito = { tipo: 'warrior', dueno: 'bot', salud: 100, movimientoRestante: 2, bonoMovimiento: 0 };
    expect(atacoA(jugarTurnoIA(e, 'bot', crearRng('obj-5')))).toBe(null);
  });
});
