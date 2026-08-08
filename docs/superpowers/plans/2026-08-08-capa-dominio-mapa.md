# Capa de dominio del modo mapa — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capa de dominio nueva, pura y testeada para el modo mapa (ciudades, recursos, ejércitos, combate), con persistencia snapshot+eventos y API REST, según `docs/superpowers/specs/2026-08-08-capa-dominio-mapa-design.md`.

**Architecture:** Dominio puro en `backend/src/domain/mapa/` (estado tonto + reglas puras que devuelven eventos + un único aplicador de eventos). `MapGameService` orquesta DB/narrador/sockets. El dominio no importa NADA de fuera de su directorio.

**Tech Stack:** Node ESM, Vitest, better-sqlite3 / pg (esquema declarado una sola vez), Express.

**Alcance de ESTE plan:** solo backend. El frontend (selector de modo en `App.vue`, revivir `GameMap.vue`) es un plan posterior separado.

## Global Constraints

- npm/npx están rotos en esta máquina: usar **yarn** (`yarn vitest run`) para todo.
- El dominio (`backend/src/domain/mapa/**`) no importa módulos de fuera de ese directorio (ni `pool`, ni `logger`, ni `aiService`). Sus tests no usan DB ni mocks.
- Idioma del código nuevo del dominio: español (consistente con el spec): `fundarCiudad`, `ReglaError`, etc. Eventos en PascalCase español: `CiudadFundada`.
- Recursos: SIEMPRE las 6 claves `food, gold, wood, stone, science, culture`.
- `aplicar.js` es el único código que muta el estado.
- Todo azar entra por `rng` inyectado (semilla explícita). Prohibido `Math.random()` en el dominio.
- Commits frecuentes, sin co-author de IA en los mensajes.
- ESLint debe quedar en 0 errores (`yarn lint` en `backend/`).

---

### Task 1: Infraestructura del dominio — `ReglaError` y RNG sembrado

**Files:**
- Create: `backend/src/domain/mapa/errores.js`
- Create: `backend/src/domain/mapa/rng.js`
- Test: `backend/test/mapa/rng.test.js`

**Interfaces:**
- Produces: `class ReglaError extends Error { constructor(codigo, mensaje) }` con `err.codigo`.
- Produces: `crearRng(semilla: string) -> () => number` (determinista, valores en [0,1)); `tirada(rng) -> number` en [0.8, 1.2]; `entero(rng, max) -> int` en [0, max).

- [ ] **Step 1: Test que falla**

```js
// backend/test/mapa/rng.test.js
import { describe, it, expect } from 'vitest';
import { crearRng, tirada, entero } from '../../src/domain/mapa/rng.js';
import { ReglaError } from '../../src/domain/mapa/errores.js';

describe('rng sembrado', () => {
  it('misma semilla produce la misma secuencia', () => {
    const a = crearRng('semilla-1');
    const b = crearRng('semilla-1');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('semillas distintas producen secuencias distintas', () => {
    expect(crearRng('x')()).not.toBe(crearRng('y')());
  });
  it('tirada queda en [0.8, 1.2] y entero en [0, max)', () => {
    const r = crearRng('s');
    for (let i = 0; i < 200; i++) {
      const t = tirada(r);
      expect(t).toBeGreaterThanOrEqual(0.8);
      expect(t).toBeLessThanOrEqual(1.2);
      const e = entero(r, 20);
      expect(e).toBeGreaterThanOrEqual(0);
      expect(e).toBeLessThan(20);
      expect(Number.isInteger(e)).toBe(true);
    }
  });
});

describe('ReglaError', () => {
  it('expone codigo y mensaje', () => {
    const e = new ReglaError('NO_ES_TU_TURNO', 'No es tu turno');
    expect(e.codigo).toBe('NO_ES_TU_TURNO');
    expect(e.message).toBe('No es tu turno');
    expect(e).toBeInstanceOf(Error);
  });
});
```

- [ ] **Step 2: Correr y ver fallar** — `cd backend && yarn vitest run test/mapa/rng.test.js` → FAIL (módulos no existen).

- [ ] **Step 3: Implementación mínima**

```js
// backend/src/domain/mapa/errores.js
export class ReglaError extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = 'ReglaError';
    this.codigo = codigo;
  }
}
```

```js
// backend/src/domain/mapa/rng.js
// xmur3 (hash de string) + mulberry32 (PRNG). Determinista y suficiente para un juego.
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export function crearRng(semilla) {
  let a = xmur3(String(semilla))();
  return function mulberry32() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const tirada = (rng) => 0.8 + rng() * 0.4;
export const entero = (rng, max) => Math.floor(rng() * max);
```

- [ ] **Step 4: Correr y ver pasar** — mismo comando → PASS.
- [ ] **Step 5: Commit** — `git add backend/src/domain/mapa backend/test/mapa && git commit -m "feat(mapa): ReglaError y rng sembrado determinista"`

---

### Task 2: Constantes de reglas (extraídas del legacy)

**Files:**
- Create: `backend/src/domain/mapa/constantes.js`
- Test: `backend/test/mapa/constantes.test.js`

**Interfaces:**
- Produces (usado por todas las reglas):
  - `TERRENOS = ['plains','forest','mountains','desert','water','hills']`
  - `RECURSOS = ['food','gold','wood','stone','science','culture']`
  - `RECURSOS_INICIALES = { food:100, gold:50, wood:80, stone:30, science:0, culture:0 }`
  - `COSTO_CIUDAD = { food:50, wood:30, stone:20 }`
  - `EDIFICIOS = { granary:{costo:{food:30,wood:20}, produccion:{food:3}}, market:{costo:{gold:50,wood:30}, produccion:{gold:5}}, library:{costo:{science:20,stone:40}, produccion:{science:3}}, barracks:{costo:{gold:40,stone:30}, produccion:{}} }`
  - `UNIDADES = { warrior:{ataque:10,defensa:8,salud:100,movimiento:2,costo:{food:20,gold:30,wood:10},requiereBarracks:false}, archer:{ataque:15,defensa:5,salud:80,movimiento:2,costo:{food:15,gold:25,wood:15},requiereBarracks:false}, spearman:{ataque:12,defensa:15,salud:90,movimiento:2,costo:{food:18,gold:20,wood:12},requiereBarracks:false}, cavalry:{ataque:20,defensa:12,salud:120,movimiento:3,costo:{food:25,gold:40,wood:5},requiereBarracks:true}, catapult:{ataque:25,defensa:3,salud:60,movimiento:1,costo:{food:10,gold:50,wood:30,stone:20},requiereBarracks:true} }`
  - `BONO_TERRENO_PRODUCCION = { plains:{food:2,gold:1}, forest:{wood:3,food:1}, mountains:{stone:4,gold:2}, hills:{stone:2,gold:1,food:1}, desert:{gold:1}, water:{} }`
  - `BONO_TERRENO_DEFENSA = { mountains:1.25, hills:1.25, forest:1.1 }` (resto 1.0 vía helper `bonoDefensa(terreno)`)
  - `PRODUCCION_BASE_CIUDAD = { food:5, gold:3, culture:2 }`
  - `PORCENTAJE_VICTORIA_DOMINACION = 0.6`
  - `BONO_DEFENSA_CIUDAD = 1.5`, `defensaCiudad(nivel) -> 8 + 2*nivel`

Fuente: `MilitaryService.js` (unidades), `ResourceService.js` (recursos iniciales, bonos de terreno, costo ciudad), `Game.js` (edificios, producción base). `barracks` cambia de "+2 army" (army ya no es recurso) a **prerrequisito para reclutar cavalry/catapult**.

- [ ] **Step 1: Test que falla**

```js
// backend/test/mapa/constantes.test.js
import { describe, it, expect } from 'vitest';
import { RECURSOS, RECURSOS_INICIALES, UNIDADES, EDIFICIOS, BONO_TERRENO_PRODUCCION, bonoDefensa, defensaCiudad } from '../../src/domain/mapa/constantes.js';

describe('constantes', () => {
  it('recursos iniciales tienen exactamente las 6 claves', () => {
    expect(Object.keys(RECURSOS_INICIALES).sort()).toEqual([...RECURSOS].sort());
  });
  it('todas las unidades tienen stats completos', () => {
    for (const u of Object.values(UNIDADES)) {
      expect(u.ataque).toBeGreaterThan(0);
      expect(u.defensa).toBeGreaterThan(0);
      expect(u.salud).toBeGreaterThan(0);
      expect(u.movimiento).toBeGreaterThan(0);
      expect(typeof u.requiereBarracks).toBe('boolean');
    }
  });
  it('cavalry y catapult requieren barracks; warrior no', () => {
    expect(UNIDADES.cavalry.requiereBarracks).toBe(true);
    expect(UNIDADES.catapult.requiereBarracks).toBe(true);
    expect(UNIDADES.warrior.requiereBarracks).toBe(false);
  });
  it('costos solo usan claves de recursos validas', () => {
    const todas = [...Object.values(UNIDADES).map(u => u.costo), ...Object.values(EDIFICIOS).map(e => e.costo)];
    for (const costo of todas) {
      for (const k of Object.keys(costo)) expect(RECURSOS).toContain(k);
    }
  });
  it('bonoDefensa devuelve 1.0 para terreno sin bono', () => {
    expect(bonoDefensa('plains')).toBe(1.0);
    expect(bonoDefensa('mountains')).toBe(1.25);
  });
  it('defensaCiudad crece con el nivel', () => {
    expect(defensaCiudad(1)).toBe(10);
    expect(defensaCiudad(3)).toBe(14);
  });
  it('bonos de produccion solo usan recursos validos', () => {
    for (const bonos of Object.values(BONO_TERRENO_PRODUCCION)) {
      for (const k of Object.keys(bonos)) expect(RECURSOS).toContain(k);
    }
  });
});
```

- [ ] **Step 2: Correr y ver fallar.**
- [ ] **Step 3: Implementar `constantes.js`** con exactamente los valores del bloque Interfaces, más:

```js
export const bonoDefensa = (terreno) => BONO_TERRENO_DEFENSA[terreno] ?? 1.0;
export const defensaCiudad = (nivel) => 8 + 2 * nivel;
```

- [ ] **Step 4: Correr y ver pasar.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mapa): constantes de reglas extraidas del sistema legacy"`

---

### Task 3: Generación de mapa determinista

**Files:**
- Create: `backend/src/domain/mapa/generarMapa.js`
- Test: `backend/test/mapa/generarMapa.test.js`

**Interfaces:**
- Consumes: `crearRng`, `entero` (Task 1); `TERRENOS` (Task 2).
- Produces:
  - `generarMapa(semilla, tamano) -> Tile[]` — array plano de `tamano*tamano`; `Tile = { x, y, terreno, recurso, dueno:null, ciudad:null, ejercito:null, descubiertoPor:[] }`. Índice = `y * tamano + x`. Agua limitada: si un tile sale `water` con probabilidad extra >0.15 acumulada se re-tira a terreno de tierra (garantiza mayoría de tierra).
  - `posicionesIniciales(mapa, tamano, cantidad, rng) -> {x,y}[]` — `cantidad` posiciones en tierra, separadas al menos `floor(tamano/4)` en distancia Manhattan; lanza `ReglaError('MAPA_SIN_POSICIONES')` si no encuentra tras 500 intentos.

- [ ] **Step 1: Test que falla**

```js
// backend/test/mapa/generarMapa.test.js
import { describe, it, expect } from 'vitest';
import { generarMapa, posicionesIniciales } from '../../src/domain/mapa/generarMapa.js';
import { crearRng } from '../../src/domain/mapa/rng.js';
import { ReglaError } from '../../src/domain/mapa/errores.js';

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
  it('mayoria de tierra (menos de 30% agua)', () => {
    const m = generarMapa('s', 20);
    const agua = m.filter(t => t.terreno === 'water').length;
    expect(agua / m.length).toBeLessThan(0.3);
  });
  it('tiles nacen sin dueno, sin ciudad, sin ejercito, sin descubrir', () => {
    for (const t of generarMapa('s', 10)) {
      expect(t.dueno).toBeNull();
      expect(t.ciudad).toBeNull();
      expect(t.ejercito).toBeNull();
      expect(t.descubiertoPor).toEqual([]);
    }
  });
});

describe('posicionesIniciales', () => {
  it('devuelve la cantidad pedida, en tierra, separadas', () => {
    const m = generarMapa('s', 20);
    const pos = posicionesIniciales(m, 20, 4, crearRng('pos'));
    expect(pos).toHaveLength(4);
    for (const p of pos) expect(m[p.y * 20 + p.x].terreno).not.toBe('water');
    for (let i = 0; i < pos.length; i++)
      for (let j = i + 1; j < pos.length; j++)
        expect(Math.abs(pos[i].x - pos[j].x) + Math.abs(pos[i].y - pos[j].y)).toBeGreaterThanOrEqual(5);
  });
  it('lanza MAPA_SIN_POSICIONES si es imposible', () => {
    const todoAgua = generarMapa('s', 8).map(t => ({ ...t, terreno: 'water' }));
    expect(() => posicionesIniciales(todoAgua, 8, 2, crearRng('x')))
      .toThrowError(expect.objectContaining({ codigo: 'MAPA_SIN_POSICIONES' }));
  });
});
```

- [ ] **Step 2: Correr y ver fallar.**
- [ ] **Step 3: Implementar**

```js
// backend/src/domain/mapa/generarMapa.js
import { crearRng, entero } from './rng.js';
import { TERRENOS, RECURSOS } from './constantes.js';
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
      const recurso = rng() < 0.3 ? RECURSOS[entero(rng, 4)] : null; // solo food/gold/wood/stone en tiles
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
    const lejos = pos.every(p => Math.abs(p.x - x) + Math.abs(p.y - y) >= minDist);
    if (lejos) pos.push({ x, y });
  }
  if (pos.length < cantidad) {
    throw new ReglaError('MAPA_SIN_POSICIONES', `No hay ${cantidad} posiciones iniciales viables en este mapa`);
  }
  return pos;
}
```

- [ ] **Step 4: Correr y ver pasar.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mapa): generacion de mapa determinista y posiciones iniciales garantizadas"`

---

### Task 4: Estado `MapGame` — creación, serialización, helpers

**Files:**
- Create: `backend/src/domain/mapa/MapGame.js`
- Test: `backend/test/mapa/MapGame.test.js`

**Interfaces:**
- Consumes: `generarMapa` (Task 3), `RECURSOS` (Task 2).
- Produces (los usan TODAS las reglas y el service):
  - `crearEstado({ nombre, semilla, config? }) -> estado` — estado del spec §2: `{ id, nombre, estado:'esperando', versionEsquema:1, semilla, turno:0, indiceJugadorActual:0, config:{tamanoMapa:20,maxJugadores:4,modoTurno:'secuencial'}, jugadores:[], mapa, ganador:null }`. `id` = crypto.randomUUID().
  - `toJSON(estado) -> objeto plano` y `fromJSON(json) -> estado` (round-trip exacto).
  - `tileEn(estado, x, y) -> Tile | null` (null fuera de rango — cierra A5).
  - `jugadorPorId(estado, id) -> jugador | null`.
  - `puedePagar(jugador, costo) -> boolean` — lanza `ReglaError('RECURSO_DESCONOCIDO')` si el costo usa una clave que no está en `RECURSOS` (cierra A4).
  - `pagar(jugador, costo) -> void` NO existe acá: el gasto es un evento (`RecursosGastados`), lo aplica `aplicar.js`.

- [ ] **Step 1: Test que falla**

```js
// backend/test/mapa/MapGame.test.js
import { describe, it, expect } from 'vitest';
import { crearEstado, toJSON, fromJSON, tileEn, puedePagar } from '../../src/domain/mapa/MapGame.js';

const estadoBase = () => crearEstado({ nombre: 'Partida', semilla: 's1' });

describe('crearEstado', () => {
  it('crea el estado inicial del spec', () => {
    const e = estadoBase();
    expect(e.estado).toBe('esperando');
    expect(e.versionEsquema).toBe(1);
    expect(e.turno).toBe(0);
    expect(e.jugadores).toEqual([]);
    expect(e.mapa).toHaveLength(400);
    expect(e.config).toEqual({ tamanoMapa: 20, maxJugadores: 4, modoTurno: 'secuencial' });
    expect(e.ganador).toBeNull();
  });
});

describe('round-trip de serializacion (anti B3/B6)', () => {
  it('estado -> toJSON -> JSON.stringify -> parse -> fromJSON es identico', () => {
    const e = estadoBase();
    // simular partida avanzada a mano
    e.estado = 'jugando';
    e.jugadores.push({ id: 'p1', nombre: 'Ana', civilizacion: 'Incas',
      recursos: { food: 87, gold: 12, wood: 3, stone: 0, science: 5, culture: 9 }, activo: true });
    e.mapa[0].ciudad = { nombre: 'Cusco', nivel: 2, poblacion: 800, edificios: ['granary'] };
    e.mapa[0].dueno = 'p1';
    e.mapa[1].ejercito = { tipo: 'warrior', dueno: 'p1', salud: 55, movimientoRestante: 1 };
    e.mapa[0].descubiertoPor = ['p1'];
    const vuelta = fromJSON(JSON.parse(JSON.stringify(toJSON(e))));
    expect(vuelta).toEqual(e);
  });
});

describe('tileEn (anti A5)', () => {
  it('devuelve null fuera de rango en vez de reventar', () => {
    const e = estadoBase();
    expect(tileEn(e, 999, 999)).toBeNull();
    expect(tileEn(e, -1, 0)).toBeNull();
    expect(tileEn(e, 7, 3)).toMatchObject({ x: 7, y: 3 });
  });
});

describe('puedePagar (anti A4)', () => {
  const jugador = { recursos: { food: 100, gold: 50, wood: 0, stone: 0, science: 0, culture: 0 } };
  it('true si alcanza, false si no', () => {
    expect(puedePagar(jugador, { food: 50 })).toBe(true);
    expect(puedePagar(jugador, { wood: 1 })).toBe(false);
  });
  it('lanza RECURSO_DESCONOCIDO ante clave invalida (no NaN silencioso)', () => {
    expect(() => puedePagar(jugador, { mithril: 1 }))
      .toThrowError(expect.objectContaining({ codigo: 'RECURSO_DESCONOCIDO' }));
  });
});
```

- [ ] **Step 2: Correr y ver fallar.**
- [ ] **Step 3: Implementar**

```js
// backend/src/domain/mapa/MapGame.js
import { randomUUID } from 'crypto';
import { generarMapa } from './generarMapa.js';
import { RECURSOS } from './constantes.js';
import { ReglaError } from './errores.js';

const CONFIG_DEFAULT = { tamanoMapa: 20, maxJugadores: 4, modoTurno: 'secuencial' };

export function crearEstado({ nombre, semilla, config = {} }) {
  const cfg = { ...CONFIG_DEFAULT, ...config };
  return {
    id: randomUUID(),
    nombre,
    estado: 'esperando',
    versionEsquema: 1,
    semilla: String(semilla),
    turno: 0,
    indiceJugadorActual: 0,
    config: cfg,
    jugadores: [],
    mapa: generarMapa(semilla, cfg.tamanoMapa),
    ganador: null,
  };
}

// El estado ya es un objeto plano serializable; estas funciones fijan el contrato.
export const toJSON = (estado) => structuredClone(estado);
export const fromJSON = (json) => structuredClone(json);

export function tileEn(estado, x, y) {
  const t = estado.config.tamanoMapa;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= t || y < 0 || y >= t) return null;
  return estado.mapa[y * t + x];
}

export const jugadorPorId = (estado, id) => estado.jugadores.find(j => j.id === id) ?? null;

export function puedePagar(jugador, costo) {
  for (const [recurso, cantidad] of Object.entries(costo)) {
    if (!RECURSOS.includes(recurso)) {
      throw new ReglaError('RECURSO_DESCONOCIDO', `Recurso desconocido: ${recurso}`);
    }
    if ((jugador.recursos[recurso] ?? 0) < cantidad) return false;
  }
  return true;
}
```

- [ ] **Step 4: Correr y ver pasar.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mapa): estado MapGame con serializacion round-trip y helpers seguros"`

---

### Task 5: `aplicar.js` — el único mutador

**Files:**
- Create: `backend/src/domain/mapa/aplicar.js`
- Test: `backend/test/mapa/aplicar.test.js`

**Interfaces:**
- Consumes: `tileEn`, `jugadorPorId` (Task 4); `UNIDADES`, `RECURSOS_INICIALES` (Task 2).
- Produces: `aplicar(estado, eventos) -> void` (muta `estado` en su lugar, un `case` por tipo). Tipos de evento (forma: `{ tipo, turno, jugadorId, datos }`):
  - `JugadorUnido { datos:{ id, nombre, civilizacion } }` → agrega jugador con `RECURSOS_INICIALES` y `activo:true`.
  - `PartidaIniciada {}` → `estado.estado='jugando'`, `turno=1`, `indiceJugadorActual=0`.
  - `CiudadFundada { datos:{ x, y, nombre } }` → `tile.ciudad = { nombre, nivel:1, poblacion:500, edificios:[] }`, `tile.dueno = jugadorId`.
  - `EdificioConstruido { datos:{ x, y, edificio } }` → push a `tile.ciudad.edificios`.
  - `RecursosGastados { datos:{ costo } }` → resta cada clave al jugador.
  - `RecursosProducidos { datos:{ jugadorId, produccion } }` → suma cada clave (nota: jugadorId va en datos porque produce para todos).
  - `UnidadReclutada { datos:{ x, y, tipo } }` → `tile.ejercito = { tipo, dueno: jugadorId, salud: UNIDADES[tipo].salud, movimientoRestante: UNIDADES[tipo].movimiento }`.
  - `EjercitoMovido { datos:{ desde:{x,y}, hasta:{x,y} } }` → mueve el objeto ejercito, decrementa `movimientoRestante`.
  - `TerritorioReclamado { datos:{ x, y } }` → `tile.dueno = jugadorId`.
  - `TerritorioDescubierto { datos:{ tiles:[{x,y}] } }` → agrega `jugadorId` a `descubiertoPor` de cada tile (sin duplicar).
  - `CombateResuelto { datos:{ ... , danoAtacante, danoDefensor, hasta:{x,y}, desde:{x,y} } }` → aplica daños a salud; pone `movimientoRestante=0` al atacante.
  - `UnidadDestruida { datos:{ x, y } }` → `tile.ejercito = null`.
  - `CiudadCapturada { datos:{ x, y } }` → `tile.dueno = jugadorId` (jugadorId = conquistador).
  - `TurnoAvanzado { datos:{ indiceJugadorActual, turno } }` → asigna ambos.
  - `RondaCompletada {}` → restaura `movimientoRestante` de TODAS las unidades a su máximo por tipo.
  - `JugadorEliminado { datos:{ jugadorId } }` → `jugador.activo = false`.
  - `PartidaTerminada { datos:{ ganador:{ jugadorId, tipoVictoria, turno } } }` → `estado.estado='terminado'`, `estado.ganador = datos.ganador`.
  - Tipo desconocido → `throw new ReglaError('EVENTO_DESCONOCIDO', tipo)`.

- [ ] **Step 1: Test que falla** (un `it` por tipo de evento; ejemplos representativos)

```js
// backend/test/mapa/aplicar.test.js
import { describe, it, expect } from 'vitest';
import { crearEstado, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { UNIDADES, RECURSOS_INICIALES } from '../../src/domain/mapa/constantes.js';

const ev = (tipo, jugadorId, datos = {}) => ({ tipo, turno: 1, jugadorId, datos });

function estadoConJugador() {
  const e = crearEstado({ nombre: 'T', semilla: 's' });
  aplicar(e, [ev('JugadorUnido', null, { id: 'p1', nombre: 'Ana', civilizacion: 'Incas' })]);
  return e;
}

describe('aplicar', () => {
  it('JugadorUnido agrega jugador con recursos iniciales completos', () => {
    const e = estadoConJugador();
    expect(e.jugadores).toHaveLength(1);
    expect(e.jugadores[0].recursos).toEqual(RECURSOS_INICIALES);
    expect(e.jugadores[0].activo).toBe(true);
  });

  it('CiudadFundada + TerritorioReclamado + RecursosGastados', () => {
    const e = estadoConJugador();
    aplicar(e, [
      ev('RecursosGastados', 'p1', { costo: { food: 50, wood: 30 } }),
      ev('CiudadFundada', 'p1', { x: 3, y: 4, nombre: 'Cusco' }),
    ]);
    expect(e.jugadores[0].recursos.food).toBe(RECURSOS_INICIALES.food - 50);
    expect(tileEn(e, 3, 4).ciudad).toMatchObject({ nombre: 'Cusco', nivel: 1 });
    expect(tileEn(e, 3, 4).dueno).toBe('p1');
  });

  it('TerritorioDescubierto es por jugador y sin duplicados (anti A2)', () => {
    const e = estadoConJugador();
    const evento = ev('TerritorioDescubierto', 'p1', { tiles: [{ x: 0, y: 0 }, { x: 1, y: 0 }] });
    aplicar(e, [evento, evento]);
    expect(tileEn(e, 0, 0).descubiertoPor).toEqual(['p1']);
    expect(tileEn(e, 1, 0).descubiertoPor).toEqual(['p1']);
    expect(tileEn(e, 2, 0).descubiertoPor).toEqual([]);
  });

  it('UnidadReclutada + EjercitoMovido + RondaCompletada restaura movimiento', () => {
    const e = estadoConJugador();
    aplicar(e, [ev('UnidadReclutada', 'p1', { x: 2, y: 2, tipo: 'warrior' })]);
    expect(tileEn(e, 2, 2).ejercito).toMatchObject({ tipo: 'warrior', salud: 100, movimientoRestante: 2 });
    aplicar(e, [ev('EjercitoMovido', 'p1', { desde: { x: 2, y: 2 }, hasta: { x: 3, y: 2 } })]);
    expect(tileEn(e, 2, 2).ejercito).toBeNull();
    expect(tileEn(e, 3, 2).ejercito.movimientoRestante).toBe(1);
    aplicar(e, [ev('RondaCompletada', null)]);
    expect(tileEn(e, 3, 2).ejercito.movimientoRestante).toBe(UNIDADES.warrior.movimiento);
  });

  it('PartidaTerminada fija ganador y estado', () => {
    const e = estadoConJugador();
    aplicar(e, [ev('PartidaTerminada', null, { ganador: { jugadorId: 'p1', tipoVictoria: 'dominacion', turno: 9 } })]);
    expect(e.estado).toBe('terminado');
    expect(e.ganador.tipoVictoria).toBe('dominacion');
  });

  it('evento desconocido lanza EVENTO_DESCONOCIDO', () => {
    const e = estadoConJugador();
    expect(() => aplicar(e, [ev('Zarasa', 'p1')]))
      .toThrowError(expect.objectContaining({ codigo: 'EVENTO_DESCONOCIDO' }));
  });
});
```

(El implementador debe agregar además un `it` por cada tipo restante: `PartidaIniciada`, `EdificioConstruido`, `RecursosProducidos`, `CombateResuelto`, `UnidadDestruida`, `CiudadCapturada`, `TurnoAvanzado`, `JugadorEliminado` — mismos patrones que los de arriba.)

- [ ] **Step 2: Correr y ver fallar.**
- [ ] **Step 3: Implementar `aplicar.js`**: un `switch (evento.tipo)` con un case por tipo según el contrato de Interfaces. Esqueleto:

```js
// backend/src/domain/mapa/aplicar.js
import { tileEn, jugadorPorId } from './MapGame.js';
import { UNIDADES, RECURSOS_INICIALES } from './constantes.js';
import { ReglaError } from './errores.js';

export function aplicar(estado, eventos) {
  for (const evento of eventos) {
    const { tipo, jugadorId, datos } = evento;
    switch (tipo) {
      case 'JugadorUnido':
        estado.jugadores.push({ id: datos.id, nombre: datos.nombre, civilizacion: datos.civilizacion,
          recursos: { ...RECURSOS_INICIALES }, activo: true });
        break;
      case 'PartidaIniciada':
        estado.estado = 'jugando'; estado.turno = 1; estado.indiceJugadorActual = 0;
        break;
      case 'CiudadFundada': {
        const t = tileEn(estado, datos.x, datos.y);
        t.ciudad = { nombre: datos.nombre, nivel: 1, poblacion: 500, edificios: [] };
        t.dueno = jugadorId;
        break;
      }
      case 'RecursosGastados': {
        const j = jugadorPorId(estado, jugadorId);
        for (const [r, c] of Object.entries(datos.costo)) j.recursos[r] -= c;
        break;
      }
      case 'RecursosProducidos': {
        const j = jugadorPorId(estado, datos.jugadorId);
        for (const [r, c] of Object.entries(datos.produccion)) j.recursos[r] += c;
        break;
      }
      case 'TerritorioDescubierto':
        for (const { x, y } of datos.tiles) {
          const t = tileEn(estado, x, y);
          if (t && !t.descubiertoPor.includes(jugadorId)) t.descubiertoPor.push(jugadorId);
        }
        break;
      // ... resto de cases segun el contrato de Interfaces de esta Task ...
      default:
        throw new ReglaError('EVENTO_DESCONOCIDO', `Evento desconocido: ${tipo}`);
    }
  }
}
```

- [ ] **Step 4: Correr y ver pasar.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mapa): aplicador de eventos, unico mutador del estado"`

---

### Task 6: Reglas de partida — unirse e iniciar (capital única, anti B4/A3)

**Files:**
- Create: `backend/src/domain/mapa/reglas/partida.js`
- Test: `backend/test/mapa/reglas.partida.test.js`

**Interfaces:**
- Consumes: `posicionesIniciales` (Task 3), `crearRng` (Task 1), helpers Task 4, eventos Task 5.
- Produces:
  - `unirse(estado, { id, nombre, civilizacion }) -> [eventos]` — `ReglaError('PARTIDA_LLENA')`, `('PARTIDA_YA_INICIADA')`, `('JUGADOR_DUPLICADO')`. Devuelve `[JugadorUnido]`. **No** asigna capital (cierra B4: la capital se asigna en un solo lugar).
  - `iniciar(estado) -> [eventos]` — `ReglaError('JUGADORES_INSUFICIENTES')` (<2), `('PARTIDA_YA_INICIADA')`. Devuelve `[PartidaIniciada, y por CADA jugador: CiudadFundada (capital, nombre "<civilizacion> Capital"), TerritorioReclamado?, TerritorioDescubierto (radio 1)]`. Usa `posicionesIniciales` con `crearRng('inicio:'+estado.semilla)`; si lanza `MAPA_SIN_POSICIONES`, la partida no arranca (cierra A3).

- [ ] **Step 1: Tests que fallan** — casos: unirse feliz; lleno; duplicado; ya iniciada; iniciar con 1 jugador falla; iniciar con 2 produce exactamente 1 capital por jugador (aplicando los eventos y contando tiles con ciudad de cada dueño == 1 — **test de regresión B4 explícito**); los tiles alrededor de la capital quedan descubiertos solo para su dueño.

```js
// backend/test/mapa/reglas.partida.test.js
import { describe, it, expect } from 'vitest';
import { crearEstado, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';

const j = (n) => ({ id: `p${n}`, nombre: `J${n}`, civilizacion: `Civ${n}` });

function partidaCon2() {
  const e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, j(1)));
  aplicar(e, unirse(e, j(2)));
  return e;
}

describe('unirse', () => {
  it('agrega jugador sin capital (la capital la da iniciar)', () => {
    const e = crearEstado({ nombre: 'T', semilla: 's1' });
    aplicar(e, unirse(e, j(1)));
    expect(e.jugadores).toHaveLength(1);
    expect(e.mapa.filter(t => t.ciudad).length).toBe(0);
  });
  it('rechaza duplicado, lleno y partida iniciada', () => {
    const e = partidaCon2();
    expect(() => unirse(e, j(1))).toThrowError(expect.objectContaining({ codigo: 'JUGADOR_DUPLICADO' }));
    aplicar(e, unirse(e, j(3)));
    aplicar(e, unirse(e, j(4)));
    expect(() => unirse(e, j(5))).toThrowError(expect.objectContaining({ codigo: 'PARTIDA_LLENA' }));
    const e2 = partidaCon2();
    aplicar(e2, iniciar(e2));
    expect(() => unirse(e2, j(9))).toThrowError(expect.objectContaining({ codigo: 'PARTIDA_YA_INICIADA' }));
  });
});

describe('iniciar (regresion B4: capital unica)', () => {
  it('exactamente UNA capital por jugador', () => {
    const e = partidaCon2();
    aplicar(e, iniciar(e));
    for (const jug of e.jugadores) {
      const ciudades = e.mapa.filter(t => t.ciudad && t.dueno === jug.id);
      expect(ciudades).toHaveLength(1);
      expect(ciudades[0].ciudad.nombre).toBe(`${jug.civilizacion} Capital`);
    }
    expect(e.estado).toBe('jugando');
    expect(e.turno).toBe(1);
  });
  it('niebla: el area inicial es visible solo para su dueño (regresion A2)', () => {
    const e = partidaCon2();
    aplicar(e, iniciar(e));
    const capital1 = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
    expect(capital1.descubiertoPor).toEqual(['p1']);
  });
  it('con menos de 2 jugadores no arranca', () => {
    const e = crearEstado({ nombre: 'T', semilla: 's1' });
    aplicar(e, unirse(e, j(1)));
    expect(() => iniciar(e)).toThrowError(expect.objectContaining({ codigo: 'JUGADORES_INSUFICIENTES' }));
  });
});
```

- [ ] **Step 2: Correr y ver fallar.**
- [ ] **Step 3: Implementar `reglas/partida.js`**

```js
// backend/src/domain/mapa/reglas/partida.js
import { posicionesIniciales } from '../generarMapa.js';
import { crearRng } from '../rng.js';
import { jugadorPorId } from '../MapGame.js';
import { ReglaError } from '../errores.js';

const evento = (tipo, estado, jugadorId, datos = {}) => ({ tipo, turno: estado.turno, jugadorId, datos });

export function unirse(estado, { id, nombre, civilizacion }) {
  if (estado.estado !== 'esperando') throw new ReglaError('PARTIDA_YA_INICIADA', 'La partida ya inició');
  if (estado.jugadores.length >= estado.config.maxJugadores) throw new ReglaError('PARTIDA_LLENA', 'La partida está llena');
  if (jugadorPorId(estado, id)) throw new ReglaError('JUGADOR_DUPLICADO', 'Ese jugador ya está en la partida');
  return [evento('JugadorUnido', estado, null, { id, nombre, civilizacion })];
}

const radio1 = (x, y) => {
  const tiles = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) tiles.push({ x: x + dx, y: y + dy });
  return tiles;
};

export function iniciar(estado) {
  if (estado.estado !== 'esperando') throw new ReglaError('PARTIDA_YA_INICIADA', 'La partida ya inició');
  if (estado.jugadores.length < 2) throw new ReglaError('JUGADORES_INSUFICIENTES', 'Se necesitan al menos 2 jugadores');
  const rng = crearRng(`inicio:${estado.semilla}`);
  const pos = posicionesIniciales(estado.mapa, estado.config.tamanoMapa, estado.jugadores.length, rng);
  const eventos = [{ tipo: 'PartidaIniciada', turno: 1, jugadorId: null, datos: {} }];
  estado.jugadores.forEach((jug, i) => {
    const { x, y } = pos[i];
    eventos.push(
      { tipo: 'CiudadFundada', turno: 1, jugadorId: jug.id, datos: { x, y, nombre: `${jug.civilizacion} Capital` } },
      { tipo: 'TerritorioDescubierto', turno: 1, jugadorId: jug.id, datos: { tiles: radio1(x, y) } },
    );
  });
  return eventos;
}
```

- [ ] **Step 4: Correr y ver pasar.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mapa): unirse e iniciar con capital unica y niebla por jugador"`

---

### Task 7: Reglas de ciudades — fundar y construir

**Files:**
- Create: `backend/src/domain/mapa/reglas/ciudades.js`
- Test: `backend/test/mapa/reglas.ciudades.test.js`

**Interfaces:**
- Consumes: `tileEn`, `jugadorPorId`, `puedePagar` (Task 4); `COSTO_CIUDAD`, `EDIFICIOS` (Task 2).
- Produces:
  - `fundarCiudad(estado, jugadorId, { x, y, nombre }) -> [RecursosGastados, CiudadFundada, TerritorioDescubierto]`
  - `construir(estado, jugadorId, { x, y, edificio }) -> [RecursosGastados, EdificioConstruido]`
  - Validaciones comunes (helper interno `validarTurno(estado, jugadorId)`): `PARTIDA_NO_ACTIVA`, `NO_ES_TU_TURNO` (compara `estado.jugadores[estado.indiceJugadorActual].id`).
  - Fundar: `POSICION_INVALIDA` (tileEn null o agua), `CASILLA_OCUPADA` (ciudad existente o dueño ajeno), `RECURSOS_INSUFICIENTES`.
  - Construir: `POSICION_INVALIDA`, `CIUDAD_AJENA` (tile sin ciudad propia), `EDIFICIO_DESCONOCIDO`, `EDIFICIO_DUPLICADO`, `RECURSOS_INSUFICIENTES`.

- [ ] **Step 1: Tests que fallan** — armar estado con `crearEstado`+`unirse`+`iniciar` (Task 6), dar recursos de sobra a p1 a mano, y cubrir: caso feliz de fundar (eventos correctos, en orden, gasto = `COSTO_CIUDAD`); fundar en agua → `POSICION_INVALIDA`; fundar en (999,999) → `POSICION_INVALIDA` (**regresión A5, no TypeError**); fundar sobre ciudad → `CASILLA_OCUPADA`; sin recursos → `RECURSOS_INSUFICIENTES`; fuera de turno → `NO_ES_TU_TURNO`; construir feliz (granary); edificio repetido → `EDIFICIO_DUPLICADO`; edificio inventado → `EDIFICIO_DESCONOCIDO`; construir en ciudad ajena → `CIUDAD_AJENA`.

```js
// backend/test/mapa/reglas.ciudades.test.js — esqueleto de armado
import { describe, it, expect, beforeEach } from 'vitest';
import { crearEstado, tileEn, jugadorPorId } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { fundarCiudad, construir } from '../../src/domain/mapa/reglas/ciudades.js';

let e, tierraLibre;
beforeEach(() => {
  e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));
  jugadorPorId(e, 'p1').recursos = { food: 999, gold: 999, wood: 999, stone: 999, science: 999, culture: 999 };
  tierraLibre = e.mapa.find(t => t.terreno !== 'water' && !t.ciudad && !t.dueno);
});

it('fundar feliz emite gasto + ciudad + descubrimiento', () => {
  const evs = fundarCiudad(e, 'p1', { x: tierraLibre.x, y: tierraLibre.y, nombre: 'Cusco' });
  expect(evs.map(ev => ev.tipo)).toEqual(['RecursosGastados', 'CiudadFundada', 'TerritorioDescubierto']);
  aplicar(e, evs);
  expect(tileEn(e, tierraLibre.x, tierraLibre.y).ciudad.nombre).toBe('Cusco');
});

it('fundar fuera del mapa da POSICION_INVALIDA, no TypeError (regresion A5)', () => {
  expect(() => fundarCiudad(e, 'p1', { x: 999, y: 999, nombre: 'X' }))
    .toThrowError(expect.objectContaining({ codigo: 'POSICION_INVALIDA' }));
});
// ... resto de casos listados arriba, mismo patron ...
```

- [ ] **Step 2: Correr y ver fallar.**
- [ ] **Step 3: Implementar `reglas/ciudades.js`** siguiendo exactamente las validaciones del bloque Interfaces. El helper compartido:

```js
// dentro de reglas/ciudades.js (y se re-exporta para las otras reglas)
export function validarTurno(estado, jugadorId) {
  if (estado.estado !== 'jugando') throw new ReglaError('PARTIDA_NO_ACTIVA', 'La partida no está activa');
  const actual = estado.jugadores[estado.indiceJugadorActual];
  if (!actual || actual.id !== jugadorId) throw new ReglaError('NO_ES_TU_TURNO', 'No es tu turno');
}
```

- [ ] **Step 4: Correr y ver pasar.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mapa): reglas de fundar ciudad y construir edificios"`

---

### Task 8: Reglas militares — reclutar

**Files:**
- Create: `backend/src/domain/mapa/reglas/militar.js`
- Test: `backend/test/mapa/reglas.militar.test.js`

**Interfaces:**
- Consumes: `validarTurno` (Task 7), `UNIDADES` (Task 2), helpers Task 4.
- Produces: `reclutar(estado, jugadorId, { x, y, tipo }) -> [RecursosGastados, UnidadReclutada]`.
  - Errores: `POSICION_INVALIDA`, `CIUDAD_AJENA` (solo en tile con ciudad propia — spec: reglas de borde), `CASILLA_OCUPADA` (ya hay ejército), `UNIDAD_DESCONOCIDA`, `REQUIERE_BARRACKS` (cavalry/catapult sin barracks en esa ciudad), `RECURSOS_INSUFICIENTES`, `NO_ES_TU_TURNO`, `PARTIDA_NO_ACTIVA`.

- [ ] **Step 1: Tests que fallan** — mismo armado que Task 7 (estado iniciado, p1 con recursos infinitos, reclutar en su capital): feliz con warrior; cavalry sin barracks → `REQUIERE_BARRACKS`; cavalry con barracks construido → feliz; en tile sin ciudad → `CIUDAD_AJENA`; con ejército ya presente → `CASILLA_OCUPADA`; tipo `'dragon'` → `UNIDAD_DESCONOCIDA`.
- [ ] **Step 2: Correr y ver fallar.**
- [ ] **Step 3: Implementar** siguiendo el contrato (validar turno → tile → ciudad propia → sin ejército → tipo válido → barracks si hace falta → `puedePagar` → eventos).
- [ ] **Step 4: Correr y ver pasar.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mapa): regla de reclutamiento con prerrequisito de barracks"`

---

### Task 9: Reglas de movimiento

**Files:**
- Create: `backend/src/domain/mapa/reglas/movimiento.js`
- Test: `backend/test/mapa/reglas.movimiento.test.js`

**Interfaces:**
- Consumes: `validarTurno` (Task 7), helpers Task 4.
- Produces: `moverEjercito(estado, jugadorId, { desde:{x,y}, hasta:{x,y} }) -> [EjercitoMovido, TerritorioDescubierto, TerritorioReclamado?]`.
  - Reglas (spec, reglas de borde): solo adyacente Manhattan 1; gasta 1 punto; agua intransitable; tile enemigo (dueño ajeno O ejército ajeno O ciudad ajena) prohibido → hay que `atacar`; tile neutral sin dueño se reclama; descubre radio 1 alrededor del destino.
  - Errores: `POSICION_INVALIDA`, `SIN_EJERCITO` (no hay ejército propio en `desde`), `DESTINO_NO_ADYACENTE`, `UNIDAD_SIN_MOVIMIENTO`, `TERRENO_INTRANSITABLE` (agua), `OBJETIVO_INVALIDO` (tile enemigo — mover no es atacar), `CASILLA_OCUPADA` (ejército propio en destino).

- [ ] **Step 1: Tests que fallan** — armado: estado iniciado + `aplicar` un `UnidadReclutada` a mano en la capital de p1. Casos: mover feliz a tile neutral adyacente (eventos `EjercitoMovido`+`TerritorioDescubierto`+`TerritorioReclamado`, movimiento decrementa); a 2 de distancia → `DESTINO_NO_ADYACENTE`; dos movimientos seguidos con warrior (mov 2) ok y el tercero → `UNIDAD_SIN_MOVIMIENTO`; a agua → `TERRENO_INTRANSITABLE`; a tile con dueño p2 → `OBJETIVO_INVALIDO`; desde tile sin ejército → `SIN_EJERCITO`.
- [ ] **Step 2: Correr y ver fallar.**
- [ ] **Step 3: Implementar** según contrato.
- [ ] **Step 4: Correr y ver pasar.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mapa): regla de movimiento con reclamo de territorio neutral"`

---

### Task 10: Reglas de combate

**Files:**
- Create: `backend/src/domain/mapa/reglas/combate.js`
- Test: `backend/test/mapa/reglas.combate.test.js`

**Interfaces:**
- Consumes: `validarTurno` (Task 7), `tirada` (Task 1), `UNIDADES`, `bonoDefensa`, `defensaCiudad`, `BONO_DEFENSA_CIUDAD` (Task 2).
- Produces: `atacar(estado, jugadorId, { desde:{x,y}, hasta:{x,y} }, rng) -> [CombateResuelto, UnidadDestruida?, CiudadCapturada?]`.
  - Fórmula (spec §3): `poderAtaque = UNIDADES[tipo].ataque * tirada(rng)`; `poderDefensa = base * tirada(rng) * bonoDefensa(terreno) * (ciudadPropia ? BONO_DEFENSA_CIUDAD : 1)` donde `base` = defensa de la unidad defensora, o `defensaCiudad(nivel)` si el tile tiene ciudad sin ejército.
  - Daño: `damageMultiplier = |pA - pD| / max(pA, pD)`; perdedor recibe `max(10, round(50 * damageMultiplier))`; ganador no recibe daño. El atacante consume todo su movimiento (evento `CombateResuelto` lleva `danoAtacante`, `danoDefensor`, `ganador`).
  - Si la salud del defensor llega a 0 → `UnidadDestruida`. Si el objetivo era ciudad sin ejército y gana el atacante → `CiudadCapturada` (el atacante NO se mueve al tile, v1).
  - Errores: `POSICION_INVALIDA`, `SIN_EJERCITO`, `DESTINO_NO_ADYACENTE`, `UNIDAD_SIN_MOVIMIENTO`, `OBJETIVO_INVALIDO` (tile sin nada enemigo: ni ejército ni ciudad ajenos).

- [ ] **Step 1: Tests que fallan** — con `rng` fijo el resultado es EXACTO, sin mocks:

```js
// fragmento clave
import { crearRng } from '../../src/domain/mapa/rng.js';
it('combate determinista: mismo rng, mismo resultado', () => {
  const evs1 = atacar(estadoClonA, 'p1', { desde, hasta }, crearRng('combate-1'));
  const evs2 = atacar(estadoClonB, 'p1', { desde, hasta }, crearRng('combate-1'));
  expect(evs1).toEqual(evs2);
});
```

  Casos: determinismo (arriba); catapult (ataque 25) vs archer (defensa 5) con rng fijo → gana atacante y el daño calculado a mano coincide; defensor en montaña recibe el ×1.25; atacar ciudad sin ejército y ganar → `CiudadCapturada` y el tile cambia de dueño al aplicar; defensor llega a 0 → `UnidadDestruida`; atacar tile vacío → `OBJETIVO_INVALIDO`; atacar sin movimiento → `UNIDAD_SIN_MOVIMIENTO`.

- [ ] **Step 2: Correr y ver fallar.**
- [ ] **Step 3: Implementar** con la fórmula exacta del contrato.
- [ ] **Step 4: Correr y ver pasar.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mapa): combate determinista con bonos de terreno y ciudad"`

---

### Task 11: Reglas de turnos — producción, eliminación y victoria

**Files:**
- Create: `backend/src/domain/mapa/reglas/turnos.js`
- Test: `backend/test/mapa/reglas.turnos.test.js`

**Interfaces:**
- Consumes: `validarTurno` (Task 7), `PRODUCCION_BASE_CIUDAD`, `BONO_TERRENO_PRODUCCION`, `EDIFICIOS`, `PORCENTAJE_VICTORIA_DOMINACION` (Task 2).
- Produces: `terminarTurno(estado, jugadorId) -> [eventos]`:
  - Siempre: `TurnoAvanzado { datos:{ indiceJugadorActual, turno } }` — avanza al siguiente jugador **activo**; si vuelve al índice 0, incrementa turno.
  - Solo al cerrar la ronda (cuando vuelve al 0), en este orden: por cada jugador activo `RecursosProducidos` (suma por ciudad: base + bono del terreno del tile + producción de edificios); `JugadorEliminado` por cada jugador activo sin ciudades; `RondaCompletada`; y si corresponde `PartidaTerminada` con `tipoVictoria: 'dominacion'` (≥60% de tiles con dueño) o `'ultimo_en_pie'` (queda 1 activo). La victoria se evalúa AL CIERRE, atribuida al turno actual (cierra M5).
- Errores: `NO_ES_TU_TURNO`, `PARTIDA_NO_ACTIVA`.

- [ ] **Step 1: Tests que fallan** — casos: p1 termina turno → `TurnoAvanzado` a p2, sin producción; p2 termina → ronda cierra: producción para ambos (verificar suma exacta contra las constantes para una ciudad en un terreno conocido, armado a mano), `RondaCompletada`, turno incrementa; jugador sin ciudades queda eliminado y el orden de turnos lo saltea; con p1 dueño del 60% del mapa (pintado a mano) → `PartidaTerminada` dominación en el turno correcto (**regresión M5**); eliminar a p2 → `PartidaTerminada` `'ultimo_en_pie'`.
- [ ] **Step 2: Correr y ver fallar.**
- [ ] **Step 3: Implementar** según contrato.
- [ ] **Step 4: Correr y ver pasar.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mapa): cierre de ronda con produccion, eliminacion y victoria"`

---

### Task 12: Visibilidad — vista del jugador

**Files:**
- Create: `backend/src/domain/mapa/reglas/visibilidad.js`
- Test: `backend/test/mapa/reglas.visibilidad.test.js`

**Interfaces:**
- Consumes: helpers Task 4.
- Produces: `vistaJugador(estado, jugadorId) -> objeto` — copia del estado donde:
  - Tiles NO descubiertos por el jugador se reducen a `{ x, y, descubierto: false }` (sin terreno, recurso, dueño, ciudad ni ejército).
  - Tiles descubiertos: `{ ...tile, descubierto: true }` sin el array `descubiertoPor` (no filtrar info de otros).
  - `jugadores`: el propio con `recursos`; los demás SIN `recursos` (solo id, nombre, civilizacion, activo).
  - Lanza `ReglaError('JUGADOR_DESCONOCIDO')` si el id no está en la partida.

- [ ] **Step 1: Tests que fallan** — armado con estado iniciado (Task 6): la vista de p1 muestra su área inicial y oculta la capital de p2 (**regresión A2**); un tile no descubierto no filtra `terreno` ni `ciudad`; los recursos de p2 no aparecen en la vista de p1; `vistaJugador(e, 'nadie')` lanza.
- [ ] **Step 2: Correr y ver fallar.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Correr y ver pasar.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mapa): vista por jugador con niebla de guerra real"`

---

### Task 13: Esquema y repositorio (única declaración, anti B2; round-trip, anti B3/B6)

**Files:**
- Create: `backend/src/db/mapSchema.js`
- Create: `backend/src/db/MapGameRepo.js`
- Test: `backend/test/mapa/repo.test.js`

**Interfaces:**
- Produces:
  - `mapSchema.ddl(dialecto: 'sqlite'|'postgres') -> string[]` — DDL de `map_games (id TEXT/UUID PK, codigo TEXT UNIQUE, version_esquema INTEGER, estado_json TEXT, creado, actualizado)` y `map_game_eventos (id INTEGER PK AUTOINCREMENT / BIGSERIAL, game_id, turno INTEGER, orden INTEGER, tipo TEXT, datos_json TEXT, narrativa TEXT NULL, creado)`. Una sola definición interna (array de objetos columna) de la que se generan ambos dialectos.
  - `class MapGameRepo { constructor(db, dialecto) }` con: `init()` (ejecuta ddl), `guardar(estado, codigo)` (upsert por id), `cargar(id) -> estadoJson|null`, `cargarPorCodigo(codigo)`, `agregarEventos(gameId, eventos)`, `eventosDe(gameId) -> filas`, `guardarNarrativa(gameId, turno, narrativa)`, `listarActivas() -> [{id, codigo, nombre, estado}]`. Para sqlite `db` es una instancia better-sqlite3; para postgres, el pool (v1 del repo implementa y testea **sqlite**; el SQL usa `?` y una función `adaptarPlaceholders` lo convierte a `$n` para postgres — la ruta postgres queda implementada pero su test de integración real queda para cuando haya entorno).
- Consumes: `toJSON`/`fromJSON` (Task 4) — el repo guarda `JSON.stringify(toJSON(estado))`.

- [ ] **Step 1: Tests que fallan** (sqlite en memoria, sin mocks)

```js
// backend/test/mapa/repo.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { MapGameRepo } from '../../src/db/MapGameRepo.js';
import { crearEstado, toJSON, fromJSON } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';

let repo;
beforeEach(() => { repo = new MapGameRepo(new Database(':memory:'), 'sqlite'); repo.init(); });

it('round-trip completo: partida jugando sobrevive guardar+cargar identica (anti B3/B6)', () => {
  const e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));
  repo.guardar(e, 'ABC123');
  const cargado = fromJSON(repo.cargar(e.id));
  expect(cargado).toEqual(e);          // ciudades, recursos, niebla: TODO sobrevive
});

it('round-trip en los tres estados de partida', () => {
  for (const prep of ['esperando', 'jugando', 'terminado']) {
    const e = crearEstado({ nombre: prep, semilla: prep });
    if (prep !== 'esperando') {
      aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'X' }));
      aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Y' }));
      aplicar(e, iniciar(e));
    }
    if (prep === 'terminado') {
      aplicar(e, [{ tipo: 'PartidaTerminada', turno: 1, jugadorId: null,
        datos: { ganador: { jugadorId: 'p1', tipoVictoria: 'dominacion', turno: 1 } } }]);
    }
    repo.guardar(e, `C-${prep}`);
    expect(fromJSON(repo.cargar(e.id))).toEqual(e);
  }
});

it('eventos append-only con narrativa por ronda', () => {
  const e = crearEstado({ nombre: 'T', semilla: 's' });
  repo.guardar(e, 'EVT');
  repo.agregarEventos(e.id, [{ tipo: 'JugadorUnido', turno: 0, jugadorId: null, datos: { id: 'p1', nombre: 'A', civilizacion: 'X' } }]);
  repo.guardarNarrativa(e.id, 0, 'Los incas llegaron al valle.');
  const filas = repo.eventosDe(e.id);
  expect(filas).toHaveLength(1);
  expect(filas[0].tipo).toBe('JugadorUnido');
  expect(JSON.parse(filas[0].datos_json).id).toBe('p1');
});

it('cargarPorCodigo y listarActivas', () => {
  const e = crearEstado({ nombre: 'T', semilla: 's' });
  repo.guardar(e, 'ZZ99');
  expect(fromJSON(repo.cargarPorCodigo('ZZ99')).id).toBe(e.id);
  expect(repo.listarActivas()).toHaveLength(1);
  expect(repo.cargar('inexistente')).toBeNull();
});
```

- [ ] **Step 2: Correr y ver fallar.**
- [ ] **Step 3: Implementar `mapSchema.js` + `MapGameRepo.js`** según contrato. La declaración única, por ejemplo:

```js
// backend/src/db/mapSchema.js — UNA definición, dos dialectos (esto cierra B2)
const TABLAS = [
  { nombre: 'map_games', columnas: [
    ['id', { sqlite: 'TEXT PRIMARY KEY', postgres: 'UUID PRIMARY KEY' }],
    ['codigo', { sqlite: 'TEXT UNIQUE', postgres: 'TEXT UNIQUE' }],
    ['version_esquema', { sqlite: 'INTEGER NOT NULL', postgres: 'INTEGER NOT NULL' }],
    ['estado_json', { sqlite: 'TEXT NOT NULL', postgres: 'TEXT NOT NULL' }],
    ['creado', { sqlite: 'DATETIME DEFAULT CURRENT_TIMESTAMP', postgres: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }],
    ['actualizado', { sqlite: 'DATETIME DEFAULT CURRENT_TIMESTAMP', postgres: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }],
  ]},
  { nombre: 'map_game_eventos', columnas: [
    ['id', { sqlite: 'INTEGER PRIMARY KEY AUTOINCREMENT', postgres: 'BIGSERIAL PRIMARY KEY' }],
    ['game_id', { sqlite: 'TEXT NOT NULL', postgres: 'UUID NOT NULL' }],
    ['turno', { sqlite: 'INTEGER NOT NULL', postgres: 'INTEGER NOT NULL' }],
    ['orden', { sqlite: 'INTEGER NOT NULL', postgres: 'INTEGER NOT NULL' }],
    ['tipo', { sqlite: 'TEXT NOT NULL', postgres: 'TEXT NOT NULL' }],
    ['datos_json', { sqlite: 'TEXT NOT NULL', postgres: 'TEXT NOT NULL' }],
    ['narrativa', { sqlite: 'TEXT', postgres: 'TEXT' }],
    ['creado', { sqlite: 'DATETIME DEFAULT CURRENT_TIMESTAMP', postgres: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }],
  ]},
];

export function ddl(dialecto) {
  return TABLAS.map(t =>
    `CREATE TABLE IF NOT EXISTS ${t.nombre} (\n  ${t.columnas.map(([n, d]) => `${n} ${d[dialecto]}`).join(',\n  ')}\n)`);
}
```

- [ ] **Step 4: Correr y ver pasar.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mapa): esquema de una sola declaracion y repo con round-trip verificado"`

---

### Task 14: `MapGameService` — orquestación e integración con reinicio

**Files:**
- Create: `backend/src/services/MapGameService.js`
- Test: `backend/test/mapa/mapGameService.test.js`

**Interfaces:**
- Consumes: todo el dominio (Tasks 4-12), `MapGameRepo` (Task 13).
- Produces: `class MapGameService { constructor({ repo, narrador = null, emitir = null }) }`:
  - `crearPartida({ nombre, semilla?, config? }) -> { id, codigo }` — genera `codigo` corto (6 chars A-Z0-9, único vía repo), semilla default = codigo.
  - `unirse(idOCodigo, { id, nombre, civilizacion }) -> vistaJugador`
  - `iniciar(id) -> vistaDelJugadorActual`
  - `accion(id, jugadorId, accion) -> { vista, eventos }` — `accion = { tipo: 'fundarCiudad'|'construir'|'reclutar'|'moverEjercito'|'atacar'|'terminarTurno', ...params }`. Rng para combate: `crearRng(\`combate:${estado.semilla}:${estado.turno}:${eventosPrevios}\`)` (determinista pero distinto por combate).
  - Flujo interno de `accion`: cargar (cache Map o repo) → regla → `aplicar` → `repo.guardar` + `repo.agregarEventos` → si cerró ronda y hay `narrador`, `narrador(eventosDeLaRonda)` async (no bloquea; `.then` guarda narrativa, `.catch` la deja null) → si hay `emitir`, `emitir(id, 'estado', vistaPorJugador)` → devuelve.
  - `vista(id, jugadorId) -> vistaJugador`.
  - `ReglaError` burbujea tal cual (la ruta la traduce a 400).
  - Cache: `Map` en memoria; **la DB es la fuente de verdad**: `cargar` va al repo si no está en cache.

- [ ] **Step 1: Tests que fallan** — el test estrella es el de reinicio:

```js
// backend/test/mapa/mapGameService.test.js — fragmento clave
import Database from 'better-sqlite3';
import { MapGameRepo } from '../../src/db/MapGameRepo.js';
import { MapGameService } from '../../src/services/MapGameService.js';

it('la partida sobrevive a un reinicio del backend (el test que el legacy jamas paso)', async () => {
  const db = new Database(':memory:');
  const svc1 = new MapGameService({ repo: new MapGameRepo(db, 'sqlite') });
  svc1.repo.init();
  const { id } = await svc1.crearPartida({ nombre: 'T', semilla: 's1' });
  await svc1.unirse(id, { id: 'p1', nombre: 'A', civilizacion: 'Incas' });
  await svc1.unirse(id, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' });
  await svc1.iniciar(id);
  const antes = await svc1.vista(id, 'p1');

  // "reinicio": servicio nuevo, cache vacio, misma DB
  const svc2 = new MapGameService({ repo: new MapGameRepo(db, 'sqlite') });
  const despues = await svc2.vista(id, 'p1');
  expect(despues).toEqual(antes);               // ciudades y recursos NO se perdieron
  // y se puede seguir jugando:
  const r = await svc2.accion(id, 'p1', { tipo: 'terminarTurno' });
  expect(r.eventos.some(e => e.tipo === 'TurnoAvanzado')).toBe(true);
});
```

  Más casos: crear+unirse+iniciar feliz devuelve vista con niebla; `accion` con `ReglaError` no persiste nada (estado igual antes/después); narrador llamado con los eventos al cerrar ronda (narrador = `vi.fn()`); narrador que rechaza NO rompe la acción; `unirse` por código.

- [ ] **Step 2: Correr y ver fallar.**
- [ ] **Step 3: Implementar** según contrato.
- [ ] **Step 4: Correr y ver pasar** y correr TODA la suite (`yarn vitest run`) para confirmar 0 regresiones.
- [ ] **Step 5: Commit** — `git commit -m "feat(mapa): MapGameService con persistencia que sobrevive reinicios"`

---

### Task 15: Rutas REST y cableado en el server

**Files:**
- Create: `backend/src/routes/mapRoutes.js`
- Modify: `backend/src/server-dynamic.js` (agregar import + `app.use('/api/map', mapRoutes)` junto a las rutas existentes, y construir el service con el repo del motor activo según `DATABASE_TYPE`, narrador conectado a `aiService.generateStoryNarrative` con un prompt simple que resume los eventos, y `emitir` conectado a socket.io con sala `map:<id>`)
- Test: `backend/test/mapa/mapRoutes.test.js` (con `supertest` si ya está en devDeps; si no, agregarlo con `yarn add -D supertest`)

**Interfaces:**
- Consumes: `MapGameService` (Task 14).
- Produces (spec §7):
  - `POST /api/map` body `{ nombre, semilla?, config? }` → 201 `{ id, codigo }`
  - `POST /api/map/:id/unirse` body `{ id, nombre, civilizacion }` → 200 vista
  - `POST /api/map/:id/iniciar` → 200 vista
  - `POST /api/map/:id/accion` body `{ jugadorId, tipo, ...params }` → 200 `{ vista, eventos }`
  - `GET /api/map/:id?jugadorId=` → 200 vista del jugador (NUNCA el mapa completo)
  - `GET /api/map` → 200 lista de partidas activas
  - `ReglaError` → 400 `{ codigo, mensaje }`; id inexistente → 404; resto → 500.

- [ ] **Step 1: Tests que fallan** — router montado sobre un service con repo sqlite `:memory:` (sin levantar el server real): flujo feliz crear→unirse×2→iniciar→accion; `accion` inválida devuelve 400 con `codigo: 'NO_ES_TU_TURNO'`; `GET` de id inexistente → 404; la respuesta de `GET` para p1 NO contiene la posición de la capital de p2 (chequear que ningún tile no descubierto tenga `ciudad`).
- [ ] **Step 2: Correr y ver fallar.**
- [ ] **Step 3: Implementar `mapRoutes.js`** (router factory `crearMapRoutes(service)` para inyectar el service en tests) y cablear `server-dynamic.js`.
- [ ] **Step 4: Correr y ver pasar** + `yarn vitest run` completo + `yarn lint`.
- [ ] **Step 5: Commit** — `git commit -m "feat(mapa): API REST del modo mapa cableada al server"`

---

### Task 16: Documentar reglas extraídas y cierre

**Files:**
- Create: `docs/reglas-modo-mapa.md` — tabla de unidades (stats/costos), edificios, bonos de terreno, fórmula de combate, condiciones de victoria; una página, en español, para que Nick pueda ajustar valores de balance sin leer código. Fuente: `constantes.js`.
- Modify: `README.md` — sección corta "Modo mapa (beta, solo API)" con los endpoints.

- [ ] **Step 1: Escribir `docs/reglas-modo-mapa.md`** con los valores reales de `constantes.js` (copiarlos, no inventarlos).
- [ ] **Step 2: Actualizar README.**
- [ ] **Step 3: Correr `yarn vitest run` y `yarn lint` una última vez** — todo verde.
- [ ] **Step 4: Commit** — `git commit -m "docs(mapa): reglas del modo mapa y endpoints en README"`

**NO incluido en este plan (explícito):** borrado del legacy (`Game.js`, `GameService.js`, etc.) — eso es un PR aparte cuando el frontend nuevo esté andando; frontend del mapa; modo simultáneo.
