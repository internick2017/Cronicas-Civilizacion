import { describe, it, expect } from 'vitest';
import { generarMapa, posicionesIniciales, trazarRios, masaPrincipal } from '../../src/domain/mapa/generarMapa.js';
import { crearRng } from '../../src/domain/mapa/rng.js';
import { ReglaError } from '../../src/domain/mapa/errores.js';

const contarTerreno = (mapa, terreno) => mapa.filter(t => t.terreno === terreno).length;

describe('generarMapa', () => {
  it('misma semilla => mismo mapa', () => {
    expect(generarMapa('s1', 20)).toEqual(generarMapa('s1', 20));
  });

  it('semilla distinta => mapa distinto', () => {
    expect(JSON.stringify(generarMapa('a', 20))).not.toBe(JSON.stringify(generarMapa('b', 20)));
  });

  it('tiene tamano*tamano tiles con indice y*t+x correcto', () => {
    const m = generarMapa('s', 10);
    expect(m).toHaveLength(100);
    expect(m[3 * 10 + 7]).toMatchObject({ x: 7, y: 3 });
  });

  it('tiles nacen sin dueno, sin ciudad, sin ejercito, sin descubrir', () => {
    for (const t of generarMapa('s', 10)) {
      expect(t.dueno).toBeNull();
      expect(t.ciudad).toBeNull();
      expect(t.ejercito).toBeNull();
      expect(t.descubiertoPor).toEqual([]);
    }
  });

  it('solo usa terrenos conocidos', () => {
    const validos = new Set(['plains', 'forest', 'mountains', 'desert', 'water', 'hills']);
    for (const t of generarMapa('s', 20)) expect(validos.has(t.terreno)).toBe(true);
  });

  // El agua tiene que ser suficiente para que se lean costas, pero no tanta
  // como para ahogar el mapa jugable. Se prueban varios tamanos (incluidos los
  // extremos permitidos por la config) porque el bug real era que el ruido en
  // grillas chicas tiene poca variedad de puntos y un umbral absoluto podia
  // dejar mapas de 10x10 con hasta 79% de agua: un test que solo miraba un
  // tamano no lo detectaba.
  const SEMILLAS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const TAMANOS = [10, 20, 30, 60];

  it('la proporcion de agua queda entre 15% y 45% en varios tamanos y semillas', () => {
    for (const tamano of TAMANOS) {
      for (const semilla of SEMILLAS) {
        const m = generarMapa(semilla, tamano);
        const proporcion = contarTerreno(m, 'water') / m.length;
        expect(proporcion).toBeGreaterThan(0.15);
        expect(proporcion).toBeLessThan(0.45);
      }
    }
  });

  it('todos los tipos de tierra aparecen en un mapa grande', () => {
    const m = generarMapa('variado', 40);
    for (const terreno of ['plains', 'forest', 'mountains', 'desert', 'hills']) {
      expect(contarTerreno(m, terreno)).toBeGreaterThan(0);
    }
  });

  // Esta es LA propiedad que separa el mundo nuevo del viejo: las casillas de
  // un mismo terreno se agrupan en manchones en vez de estar salpicadas.
  it('el terreno se agrupa: la mayoria de las casillas comparte terreno con un vecino', () => {
    const t = 30;
    const m = generarMapa('agrupado', t);
    let conVecinoIgual = 0;
    for (const tile of m) {
      const vecinos = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .map(([dx, dy]) => m[(tile.y + dy) * t + (tile.x + dx)])
        .filter((v, i) => {
          const nx = tile.x + [[1, 0], [-1, 0], [0, 1], [0, -1]][i][0];
          const ny = tile.y + [[1, 0], [-1, 0], [0, 1], [0, -1]][i][1];
          return nx >= 0 && nx < t && ny >= 0 && ny < t && v;
        });
      if (vecinos.some(v => v.terreno === tile.terreno)) conVecinoIgual++;
    }
    expect(conVecinoIgual / m.length).toBeGreaterThan(0.85);
  });

  it('funciona en los tamanos limite permitidos por la config (10 y 60)', () => {
    expect(generarMapa('chico', 10)).toHaveLength(100);
    expect(generarMapa('grande', 60)).toHaveLength(3600);
  });
});

describe('masaPrincipal', () => {
  it('devuelve un unico componente conectado de tierra', () => {
    const t = 30;
    const m = generarMapa('masa', t);
    const masa = masaPrincipal(m, t);
    expect(masa.size).toBeGreaterThan(0);

    // Recorriendo desde cualquier indice de la masa se alcanzan todos los demas.
    const inicio = [...masa][0];
    const vistos = new Set([inicio]);
    const cola = [inicio];
    while (cola.length) {
      const idx = cola.pop();
      const x = idx % t, y = Math.floor(idx / t);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= t || ny < 0 || ny >= t) continue;
        const vecino = ny * t + nx;
        if (masa.has(vecino) && !vistos.has(vecino)) {
          vistos.add(vecino);
          cola.push(vecino);
        }
      }
    }
    expect(vistos.size).toBe(masa.size);
  });

  it('nunca incluye agua', () => {
    const t = 25;
    const m = generarMapa('masa2', t);
    for (const idx of masaPrincipal(m, t)) expect(m[idx].terreno).not.toBe('water');
  });

  it('es la masa mas grande: contiene mas de la mitad de la tierra en mapas normales', () => {
    const t = 30;
    const m = generarMapa('masa3', t);
    const tierra = m.filter(x => x.terreno !== 'water').length;
    expect(masaPrincipal(m, t).size / tierra).toBeGreaterThan(0.5);
  });
});

describe('posicionesIniciales', () => {
  it('devuelve la cantidad pedida, en tierra, separadas', () => {
    const m = generarMapa('s', 20);
    const pos = posicionesIniciales(m, 20, 4, crearRng('pos'));
    expect(pos).toHaveLength(4);
    for (const p of pos) expect(m[p.y * 20 + p.x].terreno).not.toBe('water');
  });

  // El invariante que evita partidas imposibles de terminar.
  it('todas las capitales caen en la MISMA masa de tierra', () => {
    for (const semilla of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const t = 25;
      const m = generarMapa(semilla, t);
      const masa = masaPrincipal(m, t);
      const pos = posicionesIniciales(m, t, 4, crearRng(`pos-${semilla}`));
      for (const p of pos) expect(masa.has(p.y * t + p.x)).toBe(true);
    }
  });

  it('nunca devuelve posiciones duplicadas', () => {
    for (const semilla of ['a', 'b', 'c', 'd', 'e']) {
      const m = generarMapa(semilla, 20);
      const pos = posicionesIniciales(m, 20, 4, crearRng(`pos-${semilla}`));
      expect(new Set(pos.map(p => `${p.x},${p.y}`)).size).toBe(pos.length);
    }
  });

  it('sirve al maximo de jugadores permitido (8) en un mapa grande', () => {
    const m = generarMapa('ocho', 40);
    expect(posicionesIniciales(m, 40, 8, crearRng('ocho'))).toHaveLength(8);
  });

  // La combinacion mas ajustada del rango permitido: tamano minimo (10) con
  // la cantidad maxima de jugadores (8). Un mapa de 100 casillas, ~30% agua,
  // deja poco margen para separar 8 capitales dentro de una sola masa de
  // tierra. Se prueban varias semillas porque el caso limite es de peor
  // caso, no de promedio: sin este test, alguien podria ajustar los
  // umbrales de terreno o el algoritmo de posicionesIniciales y romper
  // silenciosamente el extremo mas apretado del rango soportado.
  it('sirve al maximo de jugadores (8) en el tamano minimo (10x10)', () => {
    const t = 10;
    for (const semilla of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const m = generarMapa(`chico8-${semilla}`, t);
      const masa = masaPrincipal(m, t);
      const pos = posicionesIniciales(m, t, 8, crearRng(`chico8-${semilla}`));

      expect(pos).toHaveLength(8);
      expect(new Set(pos.map(p => `${p.x},${p.y}`)).size).toBe(8);
      for (const p of pos) expect(masa.has(p.y * t + p.x)).toBe(true);
    }
  });

  it('lanza MAPA_SIN_POSICIONES si es imposible', () => {
    const todoAgua = generarMapa('s', 8).map(t => ({ ...t, terreno: 'water' }));
    expect(() => posicionesIniciales(todoAgua, 8, 2, crearRng('x')))
      .toThrowError(expect.objectContaining({ codigo: 'MAPA_SIN_POSICIONES' }));
  });
});

describe('generarMapa: recursos en yacimientos', () => {
  it('solo usa recursos de tile validos, y nunca en agua', () => {
    const validos = new Set(['food', 'gold', 'wood', 'stone']);
    for (const t of generarMapa('rec', 30)) {
      if (t.recurso === null) continue;
      expect(validos.has(t.recurso)).toBe(true);
      expect(t.terreno).not.toBe('water');
    }
  });

  it('hay recursos, pero no en todas partes', () => {
    const m = generarMapa('rec', 30);
    const conRecurso = m.filter(t => t.recurso !== null).length;
    expect(conRecurso).toBeGreaterThan(10);
    expect(conRecurso / m.length).toBeLessThan(0.35);
  });

  // La diferencia contra el 30% independiente del algoritmo viejo: los
  // recursos vienen en yacimientos, no salpicados uno por uno.
  it('los recursos se agrupan: la mayoria toca otro tile del mismo recurso', () => {
    const t = 30;
    const m = generarMapa('yacimiento', t);
    const conRecurso = m.filter(x => x.recurso !== null);
    let acompanados = 0;
    for (const tile of conRecurso) {
      const pega = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nx = tile.x + dx, ny = tile.y + dy;
        if (nx < 0 || nx >= t || ny < 0 || ny >= t) return false;
        return m[ny * t + nx].recurso === tile.recurso;
      });
      if (pega) acompanados++;
    }
    expect(acompanados / conRecurso.length).toBeGreaterThan(0.6);
  });

  it('el recurso es coherente con el terreno', () => {
    const permitido = {
      mountains: ['stone', 'gold'],
      hills: ['stone', 'gold'],
      forest: ['wood', 'food'],
      plains: ['food', 'wood'],
      desert: ['gold']
    };
    for (const t of generarMapa('coherente', 40)) {
      if (t.recurso === null) continue;
      expect(permitido[t.terreno]).toContain(t.recurso);
    }
  });

  it('los recursos son deterministas por semilla', () => {
    const a = generarMapa('det', 20).map(t => t.recurso);
    const b = generarMapa('det', 20).map(t => t.recurso);
    expect(a).toEqual(b);
  });

  // Bug real medido: en tamano 10, focos=max(2, floor(100/40))=2, y si los
  // dos sorteos caen en agua o en terreno sin recurso valido, el mapa entero
  // queda sin recursos jugables. Se prueban varios tamanos y semillas porque
  // el problema es de peor caso, no de promedio.
  it('siempre hay una cantidad minima de recursos, en cualquier tamano y semilla', () => {
    const SEMILLAS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const TAMANOS = [10, 20, 30, 60];
    for (const tamano of TAMANOS) {
      for (const semilla of SEMILLAS) {
        const m = generarMapa(`min-${semilla}`, tamano);
        const conRecurso = m.filter(t => t.recurso !== null).length;
        expect(conRecurso).toBeGreaterThanOrEqual(5);
      }
    }
  });
});

// Mapa sintetico de tierra pareja, sin agua previa: aisla el trazado de rios
// del ruido y los cuantiles del mapa real, para poder verificar sus
// propiedades geometricas de forma directa y controlada.
function mapaSintetico(tamano) {
  const mapa = [];
  for (let y = 0; y < tamano; y++) {
    for (let x = 0; x < tamano; x++) {
      mapa.push({ x, y, terreno: 'plains', recurso: null });
    }
  }
  return mapa;
}

describe('generarMapa: rios', () => {
  it('el rio traza un camino de casillas contiguas, no puntos sueltos', () => {
    const tamano = 12;
    const mapa = mapaSintetico(tamano);
    // Elevacion en forma de cono con pico en el centro: garantiza una
    // pendiente clara y monotonamente descendente hacia afuera, asi el
    // descenso por gradiente produce un camino largo y determinista.
    const cx = tamano / 2, cy = tamano / 2;
    const elevacion = (x, y) => -(Math.abs(x - cx) + Math.abs(y - cy));
    // Umbral muy bajo: el nacimiento nunca se descarta por altura, asi el
    // test se enfoca solo en la forma del camino.
    trazarRios(mapa, tamano, elevacion, -1000, crearRng('camino'));

    const agua = mapa.filter(t => t.terreno === 'water');
    expect(agua.length).toBeGreaterThan(1);
    for (const tile of agua) {
      const tieneVecinoDeAgua = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const vecino = mapa.find(t => t.x === tile.x + dx && t.y === tile.y + dy);
        return vecino && vecino.terreno === 'water';
      });
      expect(tieneVecinoDeAgua).toBe(true);
    }
  });

  it('el rio solo nace si la casilla de origen supera el umbral de terreno alto', () => {
    const tamano = 12;
    // Elevacion pareja: sin pendiente, asi que lo unico que decide si hay
    // rio o no es la comparacion contra el umbral en el nacimiento.
    const elevacion = () => 0;

    // Misma semilla de rng en ambas corridas: el punto de origen sorteado
    // es identico, asi que la unica variable es el umbral.
    const mapaNace = mapaSintetico(tamano);
    trazarRios(mapaNace, tamano, elevacion, -1, crearRng('nace'));
    expect(mapaNace.some(t => t.terreno === 'water')).toBe(true);

    const mapaNoNace = mapaSintetico(tamano);
    trazarRios(mapaNoNace, tamano, elevacion, 1, crearRng('nace'));
    expect(mapaNoNace.every(t => t.terreno !== 'water')).toBe(true);
  });

  it('los rios no rompen el determinismo', () => {
    expect(generarMapa('rios', 30)).toEqual(generarMapa('rios', 30));
  });

  // Cuenta componentes conectados de tierra (todas las masas, no solo la
  // principal) para comparar el mapa con rios contra el mismo mapa sin ellos.
  function contarComponentes(mapa, tamano) {
    const visitado = new Uint8Array(tamano * tamano);
    let componentes = 0;
    for (let i = 0; i < mapa.length; i++) {
      if (visitado[i] || mapa[i].terreno === 'water') continue;
      componentes++;
      const cola = [i];
      visitado[i] = 1;
      while (cola.length) {
        const idx = cola.pop();
        const x = idx % tamano, y = Math.floor(idx / tamano);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= tamano || ny < 0 || ny >= tamano) continue;
          const vecino = ny * tamano + nx;
          if (!visitado[vecino] && mapa[vecino].terreno !== 'water') {
            visitado[vecino] = 1;
            cola.push(vecino);
          }
        }
      }
    }
    return componentes;
  }

  // Compara el mismo mapa base con y sin el paso de rios: generarMapa acepta
  // { rios: false } (default true, no rompe la firma) para poder aislar el
  // efecto puntual del trazado sobre la cantidad de masas de tierra.
  it('los rios no aumentan la cantidad de masas de tierra desconectadas', () => {
    const SEMILLAS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const TAMANOS = [10, 20, 30, 60];

    for (const tamano of TAMANOS) {
      for (const semilla of SEMILLAS) {
        const conRios = generarMapa(`frag-${semilla}`, tamano);
        const sinRios = generarMapa(`frag-${semilla}`, tamano, { rios: false });

        const componentesCon = contarComponentes(conRios, tamano);
        const componentesSin = contarComponentes(sinRios, tamano);

        expect(componentesCon).toBeLessThanOrEqual(componentesSin);
      }
    }
  });
});
