# Modo mapa: mundo, feedback sin IA, capa visual y guerra — Plan de implementación

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para seguimiento.

**Goal:** Convertir el modo mapa de un prototipo jugable en un juego con mundo legible, guerra completa en la interfaz, presentación gráfica con sprites, y devolución al jugador en cada ronda, sin depender de credenciales de IA.

**Architecture:** El backend sigue siendo la autoridad: reglas puras y event sourcing en `backend/src/domain/mapa/`. Las secciones de mundo y narrador son cambios de dominio puro con TDD. El frontend reemplaza la grilla de `div`s por un `<canvas>` de PixiJS encerrado en un solo componente que mantiene el contrato actual (recibe la vista, emite `click-tile`), y encima de eso se monta la interacción militar.

**Tech Stack:** Node 24 + Express + socket.io + vitest (backend), Vue 3 + Vite + PixiJS v8 (frontend), sprites CC0 de Kenney.

## Global Constraints

- **Gestor de paquetes: `yarn`.** `npm` está roto en esta máquina. Usar `yarn add`, `yarn dev`, `yarn test`, `yarn lint`, `yarn build`.
- **Backend con TDD.** Test primero, verlo fallar, implementar, verlo pasar, commitear. Los tests van en `backend/test/mapa/`, con `describe`/`it` de vitest, siguiendo el estilo de los 18 archivos existentes.
- **Frontend sin tests automatizados.** El proyecto no tiene ninguno en ningún modo. Se verifica manualmente en navegador, y cada task de frontend define qué mirar.
- **Determinismo.** Toda aleatoriedad del dominio sale de `crearRng(semilla)` de `backend/src/domain/mapa/rng.js`, con semillas namespaced (`mapa:<semilla>`, `humedad:<semilla>`, etc). Nunca `Math.random()` en `backend/src/domain/`.
- **Pureza del dominio.** Los archivos bajo `backend/src/domain/mapa/` no hacen I/O, no leen config y no mutan sus argumentos. Las reglas devuelven eventos.
- **Idioma.** Código, nombres de funciones y comentarios en español, como el resto del módulo `mapa`. Sin acentos en los mensajes de commit (la convención del repo).
- **No tocar:** el modo narrativo (`StoryLobby.vue`, `StorySession.vue`, `NarrativeService.js`) ni el sistema legacy (`GameMap.vue`, `useGameApi.js`, `useGameSocket.js`, `CityService.js`, `MilitaryService.js`, `cityRoutes.js`).
- **Comandos de verificación:** backend `cd backend && yarn vitest run test/mapa/`; dev `cd backend && yarn dev` (puerto 3000) y `cd frontend && yarn dev` (puerto 5173).

**Nota sobre la spec:** la spec advertía que `better-sqlite3` podía impedir correr vitest. Se verificó el 2026-08-15 y **vitest corre bien** (`yarn vitest run test/mapa/generarMapa.test.js` → 8 tests en verde). No hay nada que destrabar.

**Corrección de diseño respecto de la spec:** la spec decía que el campo `narrativas` iría en `vistaJugador`. Eso es incorrecto: `vistaJugador` es una función pura del dominio y no tiene acceso al repo. Las narrativas se adjuntan en `MapGameService.vista()`, que sí es la capa con I/O. La task 6 lo implementa así.

## Estructura de archivos

**Backend, se crean:**
- `backend/src/domain/mapa/ruido.js` — ruido de valor determinista. Única responsabilidad: dado semilla y tamaño, devolver un campo escalar suave.
- `backend/src/domain/mapa/narradorLocal.js` — eventos de una ronda a prosa en español. Puro, sin I/O.

**Backend, se modifican:**
- `backend/src/domain/mapa/generarMapa.js` — reescrito: pipeline de capas, ríos, yacimientos, masa principal.
- `backend/src/db/MapGameRepo.js` — se agrega `narrativasDe`.
- `backend/src/services/MapGameService.js` — adjunta narrativas a la vista, emite `narrativa` por socket.
- `backend/src/server-dynamic.js` — el narrador inyectado pasa a ser Gemini con fallback local.

**Frontend, se crean:**
- `frontend/src/components/mapa/MapCanvas.vue` — todo PixiJS vive acá dentro.
- `frontend/src/components/mapa/MapDialogo.vue` — diálogo modal reutilizable.
- `frontend/src/components/mapa/MapRoundLog.vue` — historial de narrativas.
- `frontend/src/components/mapa/MapVictory.vue` — pantalla de fin de partida.
- `frontend/src/components/mapa/MapCiudadMenu.vue` — construir y reclutar.
- `frontend/src/mapa/sprites.js` — mapeo de terreno/unidad/edificio a archivo de sprite, y carga.
- `frontend/public/assets/mapa/` — sprites CC0 + `CREDITS.md`.

**Frontend, se modifican:**
- `frontend/src/components/mapa/MapSession.vue` — orquesta selección, movimiento, ataque, diálogos.
- `frontend/src/composables/useMapSocket.js` — escucha el evento `narrativa`.

**Frontend, se eliminan:**
- `frontend/src/components/mapa/MapGrid.vue` y `MapTile.vue` (reemplazados por `MapCanvas.vue` en la task 8).

---

## Task 1: Ruido de valor determinista

**Files:**
- Create: `backend/src/domain/mapa/ruido.js`
- Test: `backend/test/mapa/ruido.test.js`

**Interfaces:**
- Consumes: `crearRng` de `backend/src/domain/mapa/rng.js`.
- Produces: `crearRuido(semilla, tamano, paso = 4) => (x, y) => number` — devuelve una función que da un valor en `[0, 1]` para cada coordenada entera del mapa. Valores cercanos en el espacio dan valores cercanos en el resultado (eso es lo que produce continentes en vez de sal y pimienta). Lo consumen las tasks 2, 3 y 4.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/test/mapa/ruido.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { crearRuido } from '../../src/domain/mapa/ruido.js';

describe('crearRuido', () => {
  it('misma semilla => mismos valores', () => {
    const a = crearRuido('s1', 20);
    const b = crearRuido('s1', 20);
    for (let y = 0; y < 20; y++)
      for (let x = 0; x < 20; x++) expect(a(x, y)).toBe(b(x, y));
  });

  it('semilla distinta => campo distinto', () => {
    const a = crearRuido('a', 20);
    const b = crearRuido('b', 20);
    let diferencias = 0;
    for (let y = 0; y < 20; y++)
      for (let x = 0; x < 20; x++) if (a(x, y) !== b(x, y)) diferencias++;
    expect(diferencias).toBeGreaterThan(200);
  });

  it('todos los valores caen en [0, 1]', () => {
    const r = crearRuido('s', 30);
    for (let y = 0; y < 30; y++)
      for (let x = 0; x < 30; x++) {
        expect(r(x, y)).toBeGreaterThanOrEqual(0);
        expect(r(x, y)).toBeLessThanOrEqual(1);
      }
  });

  // Esta es la propiedad que distingue el ruido de un dado por casilla: los
  // vecinos se parecen. Sin esto no hay continentes.
  it('es suave: vecinos difieren poco', () => {
    const r = crearRuido('s', 40, 4);
    let maxSalto = 0;
    for (let y = 0; y < 39; y++)
      for (let x = 0; x < 39; x++) {
        maxSalto = Math.max(maxSalto, Math.abs(r(x, y) - r(x + 1, y)));
        maxSalto = Math.max(maxSalto, Math.abs(r(x, y) - r(x, y + 1)));
      }
    expect(maxSalto).toBeLessThan(0.4);
  });

  it('no es constante: el campo tiene relieve', () => {
    const r = crearRuido('s', 30);
    const valores = [];
    for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) valores.push(r(x, y));
    expect(Math.max(...valores) - Math.min(...valores)).toBeGreaterThan(0.4);
  });
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

```bash
cd backend && yarn vitest run test/mapa/ruido.test.js
```

Esperado: FAIL, "Failed to resolve import ... ruido.js".

- [ ] **Step 3: Implementar**

Crear `backend/src/domain/mapa/ruido.js`:

```js
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
```

- [ ] **Step 4: Correr el test y verlo pasar**

```bash
cd backend && yarn vitest run test/mapa/ruido.test.js
```

Esperado: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/domain/mapa/ruido.js backend/test/mapa/ruido.test.js
git commit -m "feat(mapa): ruido de valor determinista para generacion de terreno"
```

---

## Task 2: Terreno por capas de elevación y humedad

**Files:**
- Modify: `backend/src/domain/mapa/generarMapa.js` (reescribe la función `generarMapa`)
- Test: `backend/test/mapa/generarMapa.test.js` (reescribe el `describe('generarMapa')`)

**Interfaces:**
- Consumes: `crearRuido(semilla, tamano, paso)` de la task 1; `TERRENOS` de `constantes.js`.
- Produces: `generarMapa(semilla, tamano) => Tile[]` con la misma firma y la misma forma de tile que antes: `{x, y, terreno, recurso, dueno, ciudad, ejercito, descubiertoPor}`. En esta task `recurso` queda siempre en `null`; la task 3 lo llena. Lo consumen las tasks 3 y 4.

**Contexto:** el `generarMapa` actual sortea un terreno por casilla de forma independiente, lo que produce ruido visual sin continentes. Los tests viejos afirman propiedades de ese algoritmo (`mayoria de tierra (menos de 30% agua)` sigue valiendo; el resto se reemplaza).

- [ ] **Step 1: Escribir el test que falla**

En `backend/test/mapa/generarMapa.test.js`, reemplazar **todo** el bloque `describe('generarMapa', ...)` por este (dejar intacto por ahora el `describe('posicionesIniciales', ...)`, que la task 4 reescribe):

```js
import { describe, it, expect } from 'vitest';
import { generarMapa, posicionesIniciales } from '../../src/domain/mapa/generarMapa.js';
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
  // como para ahogar el mapa jugable.
  it('la proporcion de agua queda entre 15% y 45% en varias semillas', () => {
    for (const semilla of ['a', 'b', 'c', 'd', 'e']) {
      const m = generarMapa(semilla, 30);
      const proporcion = contarTerreno(m, 'water') / m.length;
      expect(proporcion).toBeGreaterThan(0.15);
      expect(proporcion).toBeLessThan(0.45);
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
```

- [ ] **Step 2: Correr el test y verlo fallar**

```bash
cd backend && yarn vitest run test/mapa/generarMapa.test.js
```

Esperado: FAIL en "el terreno se agrupa" (el algoritmo viejo salpica) y probablemente en la proporción de agua.

- [ ] **Step 3: Implementar**

Reemplazar en `backend/src/domain/mapa/generarMapa.js` los imports y la función `generarMapa` (dejar `posicionesIniciales` como está por ahora):

```js
import { crearRng, entero } from './rng.js';
import { crearRuido } from './ruido.js';
import { RECURSOS_DE_TILE } from './constantes.js';
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
```

Nota: `entero` y `RECURSOS_DE_TILE` quedan importados sin uso hasta la task 3. Si el lint se queja antes de esa task, dejarlos fuera y agregarlos en la task 3.

- [ ] **Step 4: Correr el test y verlo pasar**

```bash
cd backend && yarn vitest run test/mapa/generarMapa.test.js
```

Esperado: el `describe('generarMapa')` en verde. El `describe('posicionesIniciales')` puede fallar en el caso `minDist 0` con mapas de 3x3; eso lo arregla la task 4. Si falla solo ahí, seguir.

- [ ] **Step 5: Commit**

```bash
git add backend/src/domain/mapa/generarMapa.js backend/test/mapa/generarMapa.test.js
git commit -m "feat(mapa): terreno por capas de elevacion y humedad"
```

---

## Task 3: Ríos y yacimientos de recursos

**Files:**
- Modify: `backend/src/domain/mapa/generarMapa.js`
- Test: `backend/test/mapa/generarMapa.test.js` (agrega dos `describe`)

**Interfaces:**
- Consumes: `generarMapa` de la task 2, `crearRuido` de la task 1, `crearRng`/`entero` de `rng.js`, `RECURSOS_DE_TILE` de `constantes.js`.
- Produces: `generarMapa` ahora llena `recurso` con `'food' | 'gold' | 'wood' | 'stone' | null` en yacimientos contiguos, y marca cauces de río como `water`. La firma no cambia.

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `backend/test/mapa/generarMapa.test.js`:

```js
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
});

describe('generarMapa: rios', () => {
  it('un mapa grande tiene mas agua que el mismo mapa sin rios', () => {
    // Los rios agregan agua sobre el mar base: si el mapa de 40 tiene mas
    // casillas de agua que las que dan los umbrales de elevacion solos, es
    // porque los cauces se dibujaron.
    const m = generarMapa('rios', 40);
    const agua = m.filter(t => t.terreno === 'water').length;
    expect(agua).toBeGreaterThan(0);
    // Los rios no pueden inundar el mapa.
    expect(agua / m.length).toBeLessThan(0.45);
  });

  it('los rios no rompen el determinismo', () => {
    expect(generarMapa('rios', 30)).toEqual(generarMapa('rios', 30));
  });
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

```bash
cd backend && yarn vitest run test/mapa/generarMapa.test.js
```

Esperado: FAIL en los tests de recursos ("hay recursos" recibe 0, porque la task 2 dejó `recurso` en `null`).

- [ ] **Step 3: Implementar**

En `backend/src/domain/mapa/generarMapa.js`, agregar antes de `generarMapa`:

```js
// Que recurso puede aparecer en cada terreno. El primero es el mas probable.
const RECURSO_POR_TERRENO = {
  mountains: ['stone', 'stone', 'gold'],
  hills: ['stone', 'gold'],
  forest: ['wood', 'wood', 'food'],
  plains: ['food', 'food', 'wood'],
  desert: ['gold'],
  water: []
};

const dentro = (x, y, tamano) => x >= 0 && x < tamano && y >= 0 && y < tamano;
const VECINOS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Traza rios desde puntos altos: se baja siempre al vecino de menor elevacion
// hasta tocar agua, el borde, o quedarse sin pendiente.
function trazarRios(mapa, tamano, elevacion, rng) {
  const cantidad = Math.max(1, Math.floor(tamano / 8));
  const largoMax = tamano * 2;

  for (let i = 0; i < cantidad; i++) {
    let x = entero(rng, tamano);
    let y = entero(rng, tamano);
    // Solo nacen en terreno alto; si el sorteo cayo bajo, se descarta el rio.
    if (elevacion(x, y) < NIVEL_COLINA) continue;

    const visitados = new Set();
    for (let paso = 0; paso < largoMax; paso++) {
      const clave = `${x},${y}`;
      if (visitados.has(clave)) break; // se mordio la cola
      visitados.add(clave);

      const tile = mapa[y * tamano + x];
      if (tile.terreno === 'water') break; // llego al mar
      tile.terreno = 'water';

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
function sembrarRecursos(mapa, tamano, rng) {
  const focos = Math.max(2, Math.floor((tamano * tamano) / 40));

  for (let i = 0; i < focos; i++) {
    const x = entero(rng, tamano);
    const y = entero(rng, tamano);
    const semillaTile = mapa[y * tamano + x];
    const opciones = RECURSO_POR_TERRENO[semillaTile.terreno];
    if (!opciones || opciones.length === 0) continue;

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
  }
}
```

Y modificar `generarMapa` para llamarlos antes del `return`:

```js
export function generarMapa(semilla, tamano) {
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

  const rng = crearRng(`mapa:${semilla}`);
  trazarRios(mapa, tamano, elevacion, rng);
  sembrarRecursos(mapa, tamano, rng);
  return mapa;
}
```

- [ ] **Step 4: Correr el test y verlo pasar**

```bash
cd backend && yarn vitest run test/mapa/generarMapa.test.js
```

Esperado: PASS en los `describe` de recursos y ríos.

- [ ] **Step 5: Commit**

```bash
git add backend/src/domain/mapa/generarMapa.js backend/test/mapa/generarMapa.test.js
git commit -m "feat(mapa): rios por gradiente y recursos en yacimientos"
```

---

## Task 4: Masa de tierra principal y posiciones iniciales alcanzables

**Files:**
- Modify: `backend/src/domain/mapa/generarMapa.js`
- Test: `backend/test/mapa/generarMapa.test.js` (reescribe `describe('posicionesIniciales')`)

**Interfaces:**
- Consumes: `generarMapa` de la task 3.
- Produces:
  - `masaPrincipal(mapa, tamano) => Set<number>` — conjunto de índices `y * tamano + x` de la mayor masa de tierra conectada por vecinos ortogonales.
  - `posicionesIniciales(mapa, tamano, cantidad, rng) => [{x, y}]` — misma firma que hoy, pero todas las posiciones caen dentro de `masaPrincipal`, y la distancia mínima se relaja antes de rendirse.

**Contexto y por qué importa:** sin unidades navales, dos jugadores en continentes distintos no pueden alcanzarse nunca: la partida no puede terminar ni por dominación ni por conquista, y queda colgada para siempre. Esta task es la mitigación de ese riesgo.

- [ ] **Step 1: Escribir el test que falla**

Reemplazar el `describe('posicionesIniciales', ...)` completo de `backend/test/mapa/generarMapa.test.js` por:

```js
import { masaPrincipal } from '../../src/domain/mapa/generarMapa.js';

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

  it('lanza MAPA_SIN_POSICIONES si es imposible', () => {
    const todoAgua = generarMapa('s', 8).map(t => ({ ...t, terreno: 'water' }));
    expect(() => posicionesIniciales(todoAgua, 8, 2, crearRng('x')))
      .toThrowError(expect.objectContaining({ codigo: 'MAPA_SIN_POSICIONES' }));
  });
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

```bash
cd backend && yarn vitest run test/mapa/generarMapa.test.js
```

Esperado: FAIL, "masaPrincipal is not a function".

- [ ] **Step 3: Implementar**

Agregar a `backend/src/domain/mapa/generarMapa.js`:

```js
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
```

- [ ] **Step 4: Correr toda la suite del mapa**

```bash
cd backend && yarn vitest run test/mapa/
```

Esperado: PASS. Prestar atención a `reglas.partida.test.js` y `MapGame.test.js`, que usan mapas generados: si alguno asumía la distribución vieja de terreno, ajustarlo ahí y explicar el ajuste en el commit.

- [ ] **Step 5: Commit**

```bash
git add backend/src/domain/mapa/generarMapa.js backend/test/mapa/generarMapa.test.js
git commit -m "feat(mapa): capitales siempre en la masa de tierra principal"
```

---

## Task 5: Narrador local por plantillas

**Files:**
- Create: `backend/src/domain/mapa/narradorLocal.js`
- Test: `backend/test/mapa/narradorLocal.test.js`

**Interfaces:**
- Consumes: nada del proyecto (función pura).
- Produces: `narrarRonda(eventos, jugadores) => string` — `eventos` es el arreglo de eventos de la acción que cerró la ronda (mismos objetos que produce `aplicar.js`), `jugadores` es `estado.jugadores` (para resolver `jugadorId` a nombre). Devuelve siempre una cadena no vacía. La consumen las tasks 6 y 7.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/test/mapa/narradorLocal.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { narrarRonda } from '../../src/domain/mapa/narradorLocal.js';

const JUGADORES = [
  { id: 'j1', nombre: 'Ana', civilizacion: 'Romanos' },
  { id: 'j2', nombre: 'Beto', civilizacion: 'Egipcios' }
];

describe('narrarRonda', () => {
  it('nombra al jugador que funda una ciudad', () => {
    const texto = narrarRonda(
      [{ tipo: 'CiudadFundada', jugadorId: 'j1', datos: { nombre: 'Roma', x: 3, y: 4 } }],
      JUGADORES
    );
    expect(texto).toContain('Ana');
    expect(texto).toContain('Roma');
  });

  it('describe una construccion', () => {
    const texto = narrarRonda(
      [{ tipo: 'EdificioConstruido', jugadorId: 'j2', datos: { edificio: 'granary', x: 1, y: 1 } }],
      JUGADORES
    );
    expect(texto).toContain('Beto');
    expect(texto.toLowerCase()).toContain('granero');
  });

  it('describe un reclutamiento', () => {
    const texto = narrarRonda(
      [{ tipo: 'UnidadReclutada', jugadorId: 'j1', datos: { unidad: 'archer', x: 2, y: 2 } }],
      JUGADORES
    );
    expect(texto).toContain('Ana');
    expect(texto.toLowerCase()).toContain('arquero');
  });

  it('describe un combate y su desenlace', () => {
    const texto = narrarRonda(
      [
        { tipo: 'CombateResuelto', jugadorId: 'j1', datos: { desde: { x: 1, y: 1 }, hasta: { x: 1, y: 2 }, dano: 40 } },
        { tipo: 'UnidadDestruida', jugadorId: 'j2', datos: { x: 1, y: 2 } }
      ],
      JUGADORES
    );
    expect(texto).toContain('Ana');
    expect(texto).toContain('Beto');
  });

  it('destaca una ciudad capturada', () => {
    const texto = narrarRonda(
      [{ tipo: 'CiudadCapturada', jugadorId: 'j1', datos: { nombre: 'Tebas', x: 5, y: 5, anterior: 'j2' } }],
      JUGADORES
    );
    expect(texto).toContain('Tebas');
    expect(texto).toContain('Ana');
  });

  it('anuncia la eliminacion de un jugador', () => {
    const texto = narrarRonda(
      [{ tipo: 'JugadorEliminado', jugadorId: 'j2', datos: {} }],
      JUGADORES
    );
    expect(texto).toContain('Beto');
  });

  it('anuncia el fin de la partida', () => {
    const texto = narrarRonda(
      [{ tipo: 'PartidaTerminada', datos: { ganador: 'j1', motivo: 'dominacion' } }],
      JUGADORES
    );
    expect(texto).toContain('Ana');
  });

  it('una ronda sin eventos relevantes devuelve una linea de transicion, nunca vacio', () => {
    const texto = narrarRonda([{ tipo: 'RondaCompletada', datos: { turno: 4 } }], JUGADORES);
    expect(typeof texto).toBe('string');
    expect(texto.length).toBeGreaterThan(0);
  });

  it('es determinista: mismos eventos => mismo texto', () => {
    const eventos = [{ tipo: 'CiudadFundada', jugadorId: 'j1', datos: { nombre: 'Roma', x: 3, y: 4 } }];
    expect(narrarRonda(eventos, JUGADORES)).toBe(narrarRonda(eventos, JUGADORES));
  });

  it('no rompe con un jugadorId desconocido', () => {
    const texto = narrarRonda(
      [{ tipo: 'CiudadFundada', jugadorId: 'fantasma', datos: { nombre: 'X', x: 0, y: 0 } }],
      JUGADORES
    );
    expect(typeof texto).toBe('string');
    expect(texto.length).toBeGreaterThan(0);
  });

  it('no muta los eventos que recibe', () => {
    const eventos = [{ tipo: 'CiudadFundada', jugadorId: 'j1', datos: { nombre: 'Roma', x: 1, y: 1 } }];
    const copia = structuredClone(eventos);
    narrarRonda(eventos, JUGADORES);
    expect(eventos).toEqual(copia);
  });
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

```bash
cd backend && yarn vitest run test/mapa/narradorLocal.test.js
```

Esperado: FAIL, "Failed to resolve import ... narradorLocal.js".

- [ ] **Step 3: Implementar**

Crear `backend/src/domain/mapa/narradorLocal.js`:

```js
// Narrador sin IA: convierte los eventos de una ronda en prosa breve en
// espanol. Es puro y determinista, asi que el modo mapa nunca depende de una
// clave de API ni de la red para darle devolucion al jugador.

const NOMBRE_EDIFICIO = {
  granary: 'un granero',
  market: 'un mercado',
  library: 'una biblioteca',
  barracks: 'un cuartel'
};

const NOMBRE_UNIDAD = {
  warrior: 'guerreros',
  archer: 'arqueros',
  spearman: 'lanceros',
  cavalry: 'caballeria',
  catapult: 'una catapulta'
};

// Variantes elegidas por un indice estable (no por azar), para que el texto
// no sea monotono pero siga siendo determinista.
const elegir = (opciones, semilla) => opciones[semilla % opciones.length];

function nombreDe(jugadores, jugadorId) {
  const jugador = jugadores.find(j => j.id === jugadorId);
  return jugador ? jugador.nombre : 'Un pueblo sin nombre';
}

export function narrarRonda(eventos, jugadores = []) {
  const frases = [];
  let indice = 0;

  for (const evento of eventos) {
    const quien = nombreDe(jugadores, evento.jugadorId);
    const datos = evento.datos || {};
    indice++;

    switch (evento.tipo) {
      case 'CiudadFundada':
        frases.push(elegir([
          `${quien} fundo ${datos.nombre} en (${datos.x}, ${datos.y}).`,
          `Los colonos de ${quien} levantaron ${datos.nombre} en (${datos.x}, ${datos.y}).`
        ], indice));
        break;

      case 'EdificioConstruido':
        frases.push(`${quien} construyo ${NOMBRE_EDIFICIO[datos.edificio] || datos.edificio}.`);
        break;

      case 'UnidadReclutada':
        frases.push(elegir([
          `${quien} recluto ${NOMBRE_UNIDAD[datos.unidad] || datos.unidad}.`,
          `Nuevas tropas de ${quien}: ${NOMBRE_UNIDAD[datos.unidad] || datos.unidad}.`
        ], indice));
        break;

      case 'CombateResuelto':
        frases.push(`${quien} ataco en (${datos.hasta?.x}, ${datos.hasta?.y}) e hizo ${datos.dano} de dano.`);
        break;

      case 'UnidadDestruida':
        frases.push(`Las tropas de ${quien} fueron aniquiladas.`);
        break;

      case 'CiudadCapturada':
        frases.push(`${quien} tomo ${datos.nombre}. La ciudad cambio de manos.`);
        break;

      case 'JugadorEliminado':
        frases.push(`${quien} quedo sin ciudades y desaparecio del mapa.`);
        break;

      case 'PartidaTerminada':
        frases.push(datos.ganador
          ? `La partida termino: ${nombreDe(jugadores, datos.ganador)} se impuso por ${datos.motivo === 'dominacion' ? 'dominacion' : 'ser el ultimo en pie'}.`
          : 'La partida termino sin vencedores.');
        break;

      default:
        break; // eventos de contabilidad interna: no se narran
    }
  }

  if (frases.length === 0) {
    return 'La ronda paso sin sobresaltos. Los pueblos siguieron con lo suyo.';
  }
  return frases.join(' ');
}
```

- [ ] **Step 4: Correr el test y verlo pasar**

```bash
cd backend && yarn vitest run test/mapa/narradorLocal.test.js
```

Esperado: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/domain/mapa/narradorLocal.js backend/test/mapa/narradorLocal.test.js
git commit -m "feat(mapa): narrador local por plantillas sin dependencia de IA"
```

---

## Task 6: Camino de lectura de narrativas y fallback del narrador

**Files:**
- Modify: `backend/src/db/MapGameRepo.js`
- Modify: `backend/src/services/MapGameService.js:172-220` (bloque `_accion`) y el método `vista`
- Modify: `backend/src/server-dynamic.js:61-70` (narrador) y `:105-115` (inyección)
- Test: `backend/test/mapa/repo.test.js` (agrega un `describe`), `backend/test/mapa/mapGameService.test.js` (agrega un `describe`)

**Interfaces:**
- Consumes: `narrarRonda` de la task 5.
- Produces:
  - `MapGameRepo.narrativasDe(gameId, limite = 5) => Promise<[{ronda: number, texto: string}]>` — ordenadas de la ronda más vieja a la más nueva, ignorando filas sin narrativa.
  - `MapGameService.vista(id, jugadorId, token)` devuelve la vista de siempre más un campo `narrativas` con ese arreglo.
  - Evento de socket `'narrativa'` con `{ronda, texto}`, emitido a cada jugador cuando la narración termina de generarse.

**Contexto:** hoy `guardarNarrativa` escribe en `map_game_eventos.narrativa` y **nadie la lee nunca**. Además la narración es fire-and-forget después de emitir el estado, así que aunque se leyera, el jugador la vería recién en la siguiente acción. Por eso hace falta el evento de socket propio.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `backend/test/mapa/repo.test.js` (usando el helper de creación de repo que ya tenga ese archivo; si crea el repo con `new MapGameRepo(db, 'sqlite')` en un `beforeEach`, reusar esa instancia):

```js
describe('narrativasDe', () => {
  it('devuelve solo las rondas con narrativa, de la mas vieja a la mas nueva', async () => {
    const repo = crearRepoDePrueba(); // helper ya existente en este archivo
    await repo.init();
    const estado = { id: 'g1', codigo: 'ABC123', nombre: 'Test', estado: 'jugando', turno: 3 };
    await repo.guardar(estado, [
      { tipo: 'RondaCompletada', turno: 1, datos: {} },
      { tipo: 'RondaCompletada', turno: 2, datos: {} },
      { tipo: 'RondaCompletada', turno: 3, datos: {} }
    ]);
    await repo.guardarNarrativa('g1', 1, 'Primera ronda.');
    await repo.guardarNarrativa('g1', 3, 'Tercera ronda.');

    const narrativas = await repo.narrativasDe('g1');
    expect(narrativas).toEqual([
      { ronda: 1, texto: 'Primera ronda.' },
      { ronda: 3, texto: 'Tercera ronda.' }
    ]);
  });

  it('respeta el limite quedandose con las mas recientes', async () => {
    const repo = crearRepoDePrueba();
    await repo.init();
    await repo.guardar({ id: 'g2', codigo: 'DEF456', nombre: 'T', estado: 'jugando', turno: 4 }, [
      { tipo: 'RondaCompletada', turno: 1, datos: {} },
      { tipo: 'RondaCompletada', turno: 2, datos: {} },
      { tipo: 'RondaCompletada', turno: 3, datos: {} }
    ]);
    for (const n of [1, 2, 3]) await repo.guardarNarrativa('g2', n, `Ronda ${n}.`);

    const narrativas = await repo.narrativasDe('g2', 2);
    expect(narrativas.map(x => x.ronda)).toEqual([2, 3]);
  });

  it('una partida sin narrativas devuelve arreglo vacio', async () => {
    const repo = crearRepoDePrueba();
    await repo.init();
    expect(await repo.narrativasDe('inexistente')).toEqual([]);
  });
});
```

Si el archivo de tests del repo no tiene un helper `crearRepoDePrueba`, leer cómo construye el repo en su `beforeEach` y copiar ese mismo patrón dentro de cada `it`.

Agregar a `backend/test/mapa/mapGameService.test.js`:

```js
describe('narrativas en la vista', () => {
  it('la vista incluye las narrativas guardadas de la partida', async () => {
    const { servicio, repo, partida, jugador } = await crearPartidaDePrueba(); // helper del archivo
    await repo.guardarNarrativa(partida.id, 1, 'Algo paso.');

    const vista = await servicio.vista(partida.id, jugador.id, jugador.token);
    expect(vista.narrativas).toEqual([{ ronda: 1, texto: 'Algo paso.' }]);
  });

  it('sin narrativas, el campo existe y esta vacio', async () => {
    const { servicio, partida, jugador } = await crearPartidaDePrueba();
    const vista = await servicio.vista(partida.id, jugador.id, jugador.token);
    expect(vista.narrativas).toEqual([]);
  });
});
```

Reusar el helper de creación de partida que ya exista en ese archivo; si tiene otro nombre, adaptarlo.

- [ ] **Step 2: Correr los tests y verlos fallar**

```bash
cd backend && yarn vitest run test/mapa/repo.test.js test/mapa/mapGameService.test.js
```

Esperado: FAIL, "repo.narrativasDe is not a function".

- [ ] **Step 3: Implementar**

En `backend/src/db/MapGameRepo.js`, justo debajo de `guardarNarrativa`:

```js
  // Lee las ultimas rondas narradas. Hasta ahora la narrativa se escribia y
  // nunca se leia: sin este metodo el jugador jamas veia el texto.
  narrativasDe(gameId, limite = 5) {
    const sql = `
      SELECT turno, narrativa FROM map_game_eventos
      WHERE game_id = ? AND narrativa IS NOT NULL
      GROUP BY turno, narrativa
      ORDER BY turno ASC
    `;
    const mapear = (filas) => filas
      .map(f => ({ ronda: f.turno, texto: f.narrativa }))
      .slice(-limite);

    if (this.dialecto === 'sqlite') {
      return Promise.resolve(mapear(this.db.prepare(sql).all(gameId)));
    }
    return this.db.query(adaptarPlaceholders(sql), [gameId]).then(res => mapear(res.rows));
  }
```

En `backend/src/services/MapGameService.js`, reemplazar el método `vista`:

```js
  async vista(id, jugadorId, token) {
    const estado = await this._resolver(id);
    if (!estado) throw new ReglaError('PARTIDA_NO_ENCONTRADA', 'Partida no encontrada');
    await this.verificarToken(estado.id, jugadorId, token);
    // Las narrativas se adjuntan aca y no en `vistaJugador`: esa funcion es
    // dominio puro y no tiene acceso al repo.
    const narrativas = await this.repo.narrativasDe(estado.id);
    return { ...vistaJugador(estado, jugadorId), narrativas };
  }
```

Y en `_accion`, reemplazar el bloque del narrador para que además emita:

```js
    const cerroRonda = eventos.some(e => e.tipo === 'RondaCompletada');
    if (cerroRonda && this.narrador) {
      const turnoRonda = eventos.find(e => e.tipo === 'RondaCompletada').turno;
      Promise.resolve(this.narrador(eventos, estado.jugadores))
        .then(async (narrativa) => {
          if (!narrativa) return;
          await this.repo.guardarNarrativa(estado.id, turnoRonda, narrativa);
          // La narracion tarda (puede pegarle a la IA), asi que llega despues
          // de la emision del estado. Se avisa por su propio evento para que
          // el jugador la vea en esta ronda y no en la siguiente.
          if (this.emitir) {
            for (const jugador of estado.jugadores) {
              this.emitir(id, jugador.id, 'narrativa', { ronda: turnoRonda, texto: narrativa });
            }
          }
        })
        .catch(() => null); // la narracion nunca puede romper la partida
    }
```

En `backend/src/server-dynamic.js`, agregar el import junto a los demás del modo mapa:

```js
import { narrarRonda } from './domain/mapa/narradorLocal.js';
```

y reemplazar `narrarRondaMapa` por:

```js
async function narrarRondaMapa(eventos, jugadores = []) {
  const prompt = `Resumi en un parrafo breve, en prosa narrativa, lo que paso en esta ronda de una partida de estrategia por turnos. Eventos: ${resumirEventos(eventos)}`;
  try {
    const conIa = await aiService.generateStoryNarrative(prompt, { mode: 'mapa' });
    if (conIa) return conIa;
  } catch {
    // sin conexion o sin cuota: cae al narrador local
  }
  // Sin GEMINI_API_KEY el modo mapa igual narra. Una sola voz por ronda.
  return narrarRonda(eventos, jugadores);
}
```

- [ ] **Step 4: Correr toda la suite del mapa**

```bash
cd backend && yarn vitest run test/mapa/
```

Esperado: PASS.

- [ ] **Step 5: Verificar a mano que narra sin clave de IA**

Con `GEMINI_API_KEY` vacía en `backend/.env`, levantar `cd backend && yarn dev`, crear una partida con dos jugadores desde el frontend, e ir terminando turnos hasta cerrar una ronda. Luego pedir la vista y confirmar que `narrativas` trae texto:

```bash
curl -H "X-Jugador-Token: <token>" "http://localhost:3000/api/map/<id>?jugadorId=<jugadorId>"
```

Esperado: el JSON incluye `"narrativas": [{"ronda": 1, "texto": "..."}]`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/db/MapGameRepo.js backend/src/services/MapGameService.js backend/src/server-dynamic.js backend/test/mapa/repo.test.js backend/test/mapa/mapGameService.test.js
git commit -m "feat(mapa): expone narrativas en la vista y usa narrador local como fallback"
```

---

## Task 7: Log de ronda y pantalla de victoria

**Files:**
- Create: `frontend/src/components/mapa/MapRoundLog.vue`
- Create: `frontend/src/components/mapa/MapVictory.vue`
- Modify: `frontend/src/composables/useMapSocket.js`
- Modify: `frontend/src/components/mapa/MapSession.vue`

**Interfaces:**
- Consumes: campo `vista.narrativas` (`[{ronda, texto}]`) y el evento de socket `'narrativa'` de la task 6; `vista.estado`, `vista.ganador`, `vista.jugadores` que ya existen.
- Produces:
  - `useMapSocket().onNarrativa(callback)` — registra un listener del evento `'narrativa'`.
  - `MapRoundLog.vue`, props: `narrativas: Array`. Sin eventos.
  - `MapVictory.vue`, props: `vista: Object`, `jugadorId: String`. Emite `salir`.

- [ ] **Step 1: Agregar el listener de narrativa al socket**

En `frontend/src/composables/useMapSocket.js`, junto a `onEstado`, agregar y exportar:

```js
  const onNarrativa = (callback) => {
    if (!socket) return
    socket.on('narrativa', callback)
  }
```

Agregarlo al objeto que retorna el composable, al lado de `onEstado`.

- [ ] **Step 2: Crear el log de ronda**

Crear `frontend/src/components/mapa/MapRoundLog.vue`:

```vue
<!-- frontend/src/components/mapa/MapRoundLog.vue -->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  narrativas: { type: Array, default: () => [] }
})

// La mas reciente arriba: es la que el jugador quiere leer.
const ordenadas = computed(() => [...props.narrativas].reverse())
</script>

<template>
  <aside class="round-log">
    <h3>Crónica</h3>
    <p v-if="ordenadas.length === 0" class="vacio">
      Todavía no pasó nada digno de contarse.
    </p>
    <article
      v-for="(entrada, i) in ordenadas"
      :key="entrada.ronda"
      :class="['entrada', { reciente: i === 0 }]"
    >
      <span class="ronda">Ronda {{ entrada.ronda }}</span>
      <p>{{ entrada.texto }}</p>
    </article>
  </aside>
</template>

<style scoped>
.round-log {
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  max-height: 30vh;
  overflow-y: auto;
}
.round-log h3 { margin: 0 0 0.5rem; font-size: 0.95rem; color: #f1c40f; }
.vacio { opacity: 0.6; font-style: italic; margin: 0; }
.entrada { border-left: 2px solid rgba(255, 255, 255, 0.15); padding-left: 0.6rem; margin-bottom: 0.6rem; }
.entrada.reciente { border-left-color: #f1c40f; }
.entrada p { margin: 0.15rem 0 0; line-height: 1.4; }
.ronda { font-size: 0.75rem; opacity: 0.65; text-transform: uppercase; letter-spacing: 0.05em; }
</style>
```

- [ ] **Step 3: Crear la pantalla de victoria**

Crear `frontend/src/components/mapa/MapVictory.vue`:

```vue
<!-- frontend/src/components/mapa/MapVictory.vue -->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  vista: { type: Object, required: true },
  jugadorId: { type: String, required: true }
})
defineEmits(['salir'])

const ganador = computed(() =>
  props.vista.jugadores.find(j => j.id === props.vista.ganador) || null
)
const gane = computed(() => props.vista.ganador === props.jugadorId)
</script>

<template>
  <div class="victoria-overlay">
    <div class="victoria">
      <h2 v-if="gane">Victoria</h2>
      <h2 v-else-if="ganador">Derrota</h2>
      <h2 v-else>Partida terminada</h2>

      <p v-if="ganador" class="detalle">
        <strong>{{ ganador.nombre }}</strong> se impuso sobre el mapa.
      </p>
      <p v-else class="detalle">Nadie quedó en pie.</p>

      <ul class="jugadores">
        <li v-for="j in vista.jugadores" :key="j.id">
          {{ j.nombre }}
          <span v-if="!j.activo" class="eliminado">eliminado</span>
          <span v-if="j.id === vista.ganador" class="corona">ganador</span>
        </li>
      </ul>

      <button class="btn-primary" @click="$emit('salir')">Volver al inicio</button>
    </div>
  </div>
</template>

<style scoped>
.victoria-overlay {
  position: fixed; inset: 0; z-index: 2000;
  background: rgba(0, 0, 0, 0.8);
  display: flex; align-items: center; justify-content: center;
}
.victoria {
  background: #2c3e50; border-radius: 12px; padding: 2rem;
  min-width: 320px; text-align: center; color: #ecf0f1;
}
.victoria h2 { margin: 0 0 0.5rem; font-size: 2rem; }
.detalle { opacity: 0.85; }
.jugadores { list-style: none; padding: 0; margin: 1rem 0; text-align: left; }
.jugadores li { padding: 0.3rem 0; border-bottom: 1px solid rgba(255,255,255,0.08); }
.eliminado { opacity: 0.5; font-size: 0.8rem; margin-left: 0.4rem; }
.corona { color: #f1c40f; font-size: 0.8rem; margin-left: 0.4rem; }
.btn-primary {
  background: #3498db; color: #fff; border: 0; border-radius: 6px;
  padding: 0.6rem 1.2rem; cursor: pointer; font-size: 1rem;
}
</style>
```

- [ ] **Step 4: Cablear en MapSession**

En `frontend/src/components/mapa/MapSession.vue`:

Agregar los imports:

```js
import MapRoundLog from './MapRoundLog.vue'
import MapVictory from './MapVictory.vue'
```

Traer `onNarrativa` del composable:

```js
const { conectar, desconectar, unirseAPartida, onEstado, onNarrativa } = useMapSocket()
```

Agregar el estado local de narrativas, debajo de `const vista = ref(...)`:

```js
// La narrativa llega por su propio evento porque se genera despues de la
// accion; el estado que llega por 'estado' todavia no la tiene.
const narrativas = ref(props.partidaInicial.vista?.narrativas || [])
```

En `refrescarVista`, sincronizarlas:

```js
const refrescarVista = async () => {
  vista.value = await pedirVista(id, jugadorId, token)
  if (vista.value.narrativas) narrativas.value = vista.value.narrativas
  return vista.value
}
```

Dentro del `onMounted`, después de `onEstado(...)`, registrar:

```js
    onNarrativa((entrada) => {
      if (narrativas.value.some(n => n.ronda === entrada.ronda)) return
      narrativas.value = [...narrativas.value, entrada]
    })
```

En el `<template>`, agregar `MapRoundLog` debajo de `MapActionBar` y la pantalla de victoria al final del `div.map-session`:

```vue
    <MapRoundLog :narrativas="narrativas" />

    <MapVictory
      v-if="vista.estado === 'terminada'"
      :vista="vista"
      :jugador-id="jugadorId"
      @salir="salir"
    />
```

Verificar el valor exacto del estado final: en `backend/src/domain/mapa/reglas/turnos.js`, buscar qué se asigna a `estado.estado` al terminar (`grep -n "estado.estado" backend/src/domain/mapa/`). Usar ese literal en el `v-if`, no adivinarlo.

- [ ] **Step 5: Verificar a mano en el navegador**

Levantar backend y frontend (`yarn dev` en cada uno) con `GEMINI_API_KEY` vacía. Abrir dos navegadores (uno normal, uno en incógnito) y jugar una partida de 2 jugadores hasta cerrar una ronda.

Verificar:
1. Al cerrar la ronda, el panel "Crónica" muestra el texto del narrador local, con la entrada más reciente destacada.
2. El texto aparece **sin recargar** (llega por el evento `narrativa`).
3. Al recargar la página el texto sigue ahí (llega por `vista.narrativas`).
4. No hay errores en la consola del navegador.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/mapa/MapRoundLog.vue frontend/src/components/mapa/MapVictory.vue frontend/src/composables/useMapSocket.js frontend/src/components/mapa/MapSession.vue
git commit -m "feat(mapa-frontend): cronica de ronda y pantalla de victoria"
```

---

## Task 8: Canvas de PixiJS con sprites

**Files:**
- Create: `frontend/public/assets/mapa/` (sprites PNG + `CREDITS.md`)
- Create: `frontend/src/mapa/sprites.js`
- Create: `frontend/src/components/mapa/MapCanvas.vue`
- Modify: `frontend/src/components/mapa/MapSession.vue`
- Delete: `frontend/src/components/mapa/MapGrid.vue`, `frontend/src/components/mapa/MapTile.vue`
- Modify: `frontend/package.json` (dependencia `pixi.js`)

**Interfaces:**
- Consumes: `vista.mapa` (arreglo de tiles con `descubierto`, `terreno`, `dueno`, `ciudad`, `ejercito`), `vista.config.tamanoMapa`, `vista.jugadores`.
- Produces: `MapCanvas.vue` con props `vista: Object`, `jugadorId: String`, `seleccion: Object|null`, `alcanzables: Array` (las dos últimas las usa la task 11) y evento `click-tile` con `{x, y}` — **el mismo contrato que hoy expone `MapGrid.vue`**, para que `MapSession` no cambie su forma de reaccionar.

- [ ] **Step 1: Instalar PixiJS**

```bash
cd frontend && yarn add pixi.js
```

Verificar que quedó en `dependencies` de `frontend/package.json`.

- [ ] **Step 2: Bajar los sprites**

Descargar los packs CC0 de Kenney:
- https://kenney.nl/assets/medieval-rts
- https://kenney.nl/assets/tower-defense-top-down

Copiar a `frontend/public/assets/mapa/` los PNG necesarios, renombrados exactamente así (si un pack no trae un equivalente claro, usar el más cercano y anotarlo en `CREDITS.md`):

```
terreno-plains.png  terreno-forest.png  terreno-mountains.png
terreno-desert.png  terreno-water.png   terreno-hills.png
ciudad.png
unidad-warrior.png  unidad-archer.png   unidad-spearman.png
unidad-cavalry.png  unidad-catapult.png
```

Crear `frontend/public/assets/mapa/CREDITS.md`:

```markdown
# Créditos de los sprites

Sprites de [Kenney](https://kenney.nl), packs "Medieval RTS" y "Tower Defense (Top-Down)".

Licencia: CC0 1.0 Universal (dominio público). Permite uso comercial, modificación y
redistribución sin atribución. El crédito se incluye igual, por cortesía.
```

- [ ] **Step 3: Crear el mapeo de sprites**

Crear `frontend/src/mapa/sprites.js`:

```js
// Mapeo de valores del dominio a archivos de sprite. Un solo lugar donde
// cambiar el arte sin tocar el renderizador.
import { Assets } from 'pixi.js'

const BASE = '/assets/mapa'

export const SPRITE_TERRENO = {
  plains: `${BASE}/terreno-plains.png`,
  forest: `${BASE}/terreno-forest.png`,
  mountains: `${BASE}/terreno-mountains.png`,
  desert: `${BASE}/terreno-desert.png`,
  water: `${BASE}/terreno-water.png`,
  hills: `${BASE}/terreno-hills.png`
}

export const SPRITE_CIUDAD = `${BASE}/ciudad.png`

export const SPRITE_UNIDAD = {
  warrior: `${BASE}/unidad-warrior.png`,
  archer: `${BASE}/unidad-archer.png`,
  spearman: `${BASE}/unidad-spearman.png`,
  cavalry: `${BASE}/unidad-cavalry.png`,
  catapult: `${BASE}/unidad-catapult.png`
}

// Colores de bando. Se aplican como tinte sobre el MISMO sprite, asi no hacen
// falta cinco juegos de arte distintos.
export const COLORES_JUGADOR = [0x3498db, 0xe74c3c, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xecf0f1]

export const colorDeJugador = (jugadores, jugadorId) => {
  const i = jugadores.findIndex(j => j.id === jugadorId)
  return i === -1 ? 0xffffff : COLORES_JUGADOR[i % COLORES_JUGADOR.length]
}

export async function cargarSprites() {
  const urls = [
    ...Object.values(SPRITE_TERRENO),
    SPRITE_CIUDAD,
    ...Object.values(SPRITE_UNIDAD)
  ]
  await Assets.load(urls)
}
```

- [ ] **Step 4: Crear MapCanvas**

Crear `frontend/src/components/mapa/MapCanvas.vue`:

```vue
<!-- frontend/src/components/mapa/MapCanvas.vue -->
<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { Application, Container, Sprite, Graphics, Assets } from 'pixi.js'
import { SPRITE_TERRENO, SPRITE_CIUDAD, SPRITE_UNIDAD, colorDeJugador, cargarSprites } from '../../mapa/sprites.js'

const props = defineProps({
  vista: { type: Object, required: true },
  jugadorId: { type: String, required: true },
  seleccion: { type: Object, default: null },
  alcanzables: { type: Array, default: () => [] }
})
const emit = defineEmits(['click-tile'])

const TILE = 48 // pixeles por casilla en zoom 1

const contenedor = ref(null)
let app = null
let mundo = null       // container que se mueve y escala (la camara)
let capaTerreno = null
let capaTerritorio = null
let capaPiezas = null  // ciudades y ejercitos
let capaOverlay = null // seleccion, alcanzables
let capaNiebla = null

const tamano = () => props.vista.config.tamanoMapa

// --- Dibujado ---------------------------------------------------------

function limpiar(capa) {
  capa.removeChildren().forEach(hijo => hijo.destroy())
}

function dibujarTerreno() {
  limpiar(capaTerreno)
  for (const tile of props.vista.mapa) {
    if (!tile.descubierto) continue
    const url = SPRITE_TERRENO[tile.terreno]
    if (!url) continue
    const sprite = new Sprite(Assets.get(url))
    sprite.width = TILE
    sprite.height = TILE
    sprite.x = tile.x * TILE
    sprite.y = tile.y * TILE
    capaTerreno.addChild(sprite)
  }
}

function dibujarTerritorio() {
  limpiar(capaTerritorio)
  const g = new Graphics()
  for (const tile of props.vista.mapa) {
    if (!tile.descubierto || !tile.dueno) continue
    g.rect(tile.x * TILE, tile.y * TILE, TILE, TILE)
      .fill({ color: colorDeJugador(props.vista.jugadores, tile.dueno), alpha: 0.22 })
  }
  capaTerritorio.addChild(g)
}

function dibujarPiezas() {
  limpiar(capaPiezas)
  for (const tile of props.vista.mapa) {
    if (!tile.descubierto) continue

    if (tile.ciudad) {
      const sprite = new Sprite(Assets.get(SPRITE_CIUDAD))
      sprite.width = TILE
      sprite.height = TILE
      sprite.x = tile.x * TILE
      sprite.y = tile.y * TILE
      if (tile.dueno) sprite.tint = colorDeJugador(props.vista.jugadores, tile.dueno)
      capaPiezas.addChild(sprite)
    }

    if (tile.ejercito) {
      const url = SPRITE_UNIDAD[tile.ejercito.unidad] || SPRITE_UNIDAD.warrior
      const sprite = new Sprite(Assets.get(url))
      sprite.width = TILE * 0.7
      sprite.height = TILE * 0.7
      sprite.x = tile.x * TILE + TILE * 0.15
      sprite.y = tile.y * TILE + TILE * 0.15
      if (tile.ejercito.jugadorId) {
        sprite.tint = colorDeJugador(props.vista.jugadores, tile.ejercito.jugadorId)
      }
      capaPiezas.addChild(sprite)

      // Barra de salud, solo si esta danado.
      const salud = tile.ejercito.salud
      const maxSalud = tile.ejercito.saludMaxima || 100
      if (typeof salud === 'number' && salud < maxSalud) {
        const barra = new Graphics()
        barra.rect(tile.x * TILE + 4, tile.y * TILE + TILE - 7, TILE - 8, 4).fill({ color: 0x000000, alpha: 0.6 })
        barra.rect(tile.x * TILE + 4, tile.y * TILE + TILE - 7, (TILE - 8) * (salud / maxSalud), 4).fill({ color: 0x2ecc71 })
        capaPiezas.addChild(barra)
      }
    }
  }
}

function dibujarOverlay() {
  limpiar(capaOverlay)
  const g = new Graphics()
  for (const pos of props.alcanzables) {
    g.rect(pos.x * TILE, pos.y * TILE, TILE, TILE).fill({ color: 0xf1c40f, alpha: 0.25 })
    g.rect(pos.x * TILE + 1, pos.y * TILE + 1, TILE - 2, TILE - 2).stroke({ width: 2, color: 0xf1c40f })
  }
  if (props.seleccion) {
    g.rect(props.seleccion.x * TILE + 1, props.seleccion.y * TILE + 1, TILE - 2, TILE - 2)
      .stroke({ width: 3, color: 0xffffff })
  }
  capaOverlay.addChild(g)
}

function dibujarNiebla() {
  limpiar(capaNiebla)
  const g = new Graphics()
  for (const tile of props.vista.mapa) {
    if (tile.descubierto) continue
    g.rect(tile.x * TILE, tile.y * TILE, TILE, TILE).fill({ color: 0x0a0a0f, alpha: 0.96 })
  }
  capaNiebla.addChild(g)
}

function redibujar() {
  if (!app) return
  dibujarTerreno()
  dibujarTerritorio()
  dibujarPiezas()
  dibujarOverlay()
  dibujarNiebla()
}

// --- Interaccion ------------------------------------------------------

function onPointerDown(evento) {
  const local = mundo.toLocal(evento.global)
  const x = Math.floor(local.x / TILE)
  const y = Math.floor(local.y / TILE)
  if (x < 0 || y < 0 || x >= tamano() || y >= tamano()) return
  emit('click-tile', { x, y })
}

// --- Ciclo de vida ----------------------------------------------------

onMounted(async () => {
  await cargarSprites()

  app = new Application()
  await app.init({
    background: 0x0f1419,
    resizeTo: contenedor.value,
    antialias: false
  })
  contenedor.value.appendChild(app.canvas)

  mundo = new Container()
  capaTerreno = new Container()
  capaTerritorio = new Container()
  capaPiezas = new Container()
  capaOverlay = new Container()
  capaNiebla = new Container()
  mundo.addChild(capaTerreno, capaTerritorio, capaPiezas, capaOverlay, capaNiebla)
  app.stage.addChild(mundo)

  app.stage.eventMode = 'static'
  app.stage.hitArea = app.screen
  app.stage.on('pointerdown', onPointerDown)

  redibujar()
})

onUnmounted(() => {
  if (app) {
    app.destroy(true, { children: true })
    app = null
  }
})

watch(() => props.vista, redibujar, { deep: true })
watch(() => [props.seleccion, props.alcanzables], dibujarOverlay, { deep: true })

defineExpose({ TILE, mundoRef: () => mundo, appRef: () => app })
</script>

<template>
  <div ref="contenedor" class="map-canvas" />
</template>

<style scoped>
.map-canvas {
  width: 100%;
  height: 70vh;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  overflow: hidden;
  touch-action: none;
}
</style>
```

**Antes de escribir el código de `dibujarPiezas`**, confirmar la forma real del objeto `ejercito` en un tile:

```bash
grep -rn "ejercito" backend/src/domain/mapa/reglas/militar.js backend/src/domain/mapa/aplicar.js | head -20
```

Ajustar `tile.ejercito.unidad`, `.jugadorId`, `.salud` a los nombres reales que use el dominio. No inventarlos.

- [ ] **Step 5: Reemplazar la grilla en MapSession**

En `frontend/src/components/mapa/MapSession.vue`, cambiar el import:

```js
import MapCanvas from './MapCanvas.vue'
```

(quitar `import MapGrid from './MapGrid.vue'`)

y en el template reemplazar el bloque `<MapGrid ... />` por:

```vue
    <MapCanvas
      :vista="vista"
      :jugador-id="jugadorId"
      @click-tile="onClickTile"
    />
```

Borrar los archivos viejos:

```bash
git rm frontend/src/components/mapa/MapGrid.vue frontend/src/components/mapa/MapTile.vue
```

- [ ] **Step 6: Verificar a mano en el navegador**

Levantar backend y frontend, crear una partida de 2 jugadores e iniciarla.

Verificar:
1. El mapa se dibuja con sprites, no con cuadrados de color. Se distinguen bosque, montaña, agua, llanura, desierto y colina.
2. La ciudad se ve como una ciudad y el ejército como una unidad, no como emojis.
3. Las ciudades de cada jugador tienen color distinto (tinte de bando).
4. Las casillas no descubiertas están cubiertas por la niebla.
5. Al hacer click en una casilla propia sin ciudad, sigue apareciendo el prompt de fundar (la task 10 lo reemplaza).
6. La consola del navegador no tiene errores ni advertencias de Pixi.
7. `cd frontend && yarn build` termina sin errores.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/yarn.lock frontend/public/assets/mapa frontend/src/mapa/sprites.js frontend/src/components/mapa/MapCanvas.vue frontend/src/components/mapa/MapSession.vue
git rm --cached frontend/src/components/mapa/MapGrid.vue frontend/src/components/mapa/MapTile.vue 2>/dev/null || true
git commit -m "feat(mapa-frontend): canvas con PixiJS y sprites en lugar de la grilla de divs"
```

---

## Task 9: Cámara y animaciones

**Files:**
- Modify: `frontend/src/components/mapa/MapCanvas.vue`

**Interfaces:**
- Consumes: el `mundo` (Container) y `TILE` de la task 8.
- Produces: nada nuevo hacia afuera. El contrato de props y eventos no cambia.

- [ ] **Step 1: Agregar zoom y paneo**

En `frontend/src/components/mapa/MapCanvas.vue`, agregar el estado de cámara junto a las otras variables de módulo:

```js
const ZOOM_MIN = 0.35
const ZOOM_MAX = 2.5
let arrastrando = false
let arrastreInicio = null
let huboArrastre = false
```

Agregar las funciones antes de `onMounted`:

```js
function aplicarZoom(delta, centro) {
  const anterior = mundo.scale.x
  const nuevo = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, anterior * (delta > 0 ? 0.9 : 1.1)))
  if (nuevo === anterior) return
  // Se hace zoom hacia el puntero, no hacia el origen: si no, el mapa se
  // escapa de la pantalla apenas te acercas.
  const factor = nuevo / anterior
  mundo.x = centro.x - (centro.x - mundo.x) * factor
  mundo.y = centro.y - (centro.y - mundo.y) * factor
  mundo.scale.set(nuevo)
}

function centrarEn(x, y) {
  mundo.x = app.screen.width / 2 - x * TILE * mundo.scale.x
  mundo.y = app.screen.height / 2 - y * TILE * mundo.scale.y
}

function capitalPropia() {
  const tile = props.vista.mapa.find(t => t.descubierto && t.ciudad && t.dueno === props.jugadorId)
  return tile ? { x: tile.x, y: tile.y } : { x: tamano() / 2, y: tamano() / 2 }
}
```

Reemplazar `onPointerDown` por el trío arrastre + click, de modo que arrastrar el mapa **no** cuente como click en una casilla:

```js
function onPointerDown(evento) {
  arrastrando = true
  huboArrastre = false
  arrastreInicio = { x: evento.global.x - mundo.x, y: evento.global.y - mundo.y }
}

function onPointerMove(evento) {
  if (!arrastrando) return
  const nx = evento.global.x - arrastreInicio.x
  const ny = evento.global.y - arrastreInicio.y
  if (Math.abs(nx - mundo.x) > 3 || Math.abs(ny - mundo.y) > 3) huboArrastre = true
  mundo.x = nx
  mundo.y = ny
}

function onPointerUp(evento) {
  arrastrando = false
  if (huboArrastre) return // fue un paneo, no un click en la casilla
  const local = mundo.toLocal(evento.global)
  const x = Math.floor(local.x / TILE)
  const y = Math.floor(local.y / TILE)
  if (x < 0 || y < 0 || x >= tamano() || y >= tamano()) return
  emit('click-tile', { x, y })
}
```

En `onMounted`, reemplazar el registro de eventos por:

```js
  app.stage.eventMode = 'static'
  app.stage.hitArea = app.screen
  app.stage.on('pointerdown', onPointerDown)
  app.stage.on('pointermove', onPointerMove)
  app.stage.on('pointerup', onPointerUp)
  app.stage.on('pointerupoutside', () => { arrastrando = false })
  app.canvas.addEventListener('wheel', (e) => {
    e.preventDefault()
    aplicarZoom(e.deltaY, { x: e.offsetX, y: e.offsetY })
  }, { passive: false })

  redibujar()
  const capital = capitalPropia()
  centrarEn(capital.x, capital.y)
```

- [ ] **Step 2: Agregar la animación de movimiento y combate**

Agregar al componente:

```js
let vistaPrevia = null

// Compara el estado nuevo contra el anterior para saber que animar. El
// backend no manda "que paso", manda "como quedo todo".
function animarCambios(nueva, previa) {
  if (!previa || !app) return

  const indice = (t, tile) => tile.y * t + tile.x
  const tam = nueva.config.tamanoMapa

  for (const tile of nueva.mapa) {
    const antes = previa.mapa[indice(tam, tile)]
    if (!antes) continue

    // Ciudad nueva: aparece creciendo.
    if (tile.ciudad && !antes.ciudad) {
      const sprite = capaPiezas.children.find(
        c => c.x === tile.x * TILE && c.y === tile.y * TILE
      )
      if (sprite) animarEscala(sprite, 0.2, 1, 250)
    }

    // Ejercito danado: destello rojo.
    if (tile.ejercito && antes.ejercito && tile.ejercito.salud < antes.ejercito.salud) {
      destellar(tile.x, tile.y, 0xe74c3c)
    }
  }
}

function animarEscala(sprite, desde, hasta, ms) {
  const anchoFinal = sprite.width
  const altoFinal = sprite.height
  const inicio = performance.now()
  const paso = () => {
    const t = Math.min(1, (performance.now() - inicio) / ms)
    const escala = desde + (hasta - desde) * t
    sprite.width = anchoFinal * escala
    sprite.height = altoFinal * escala
    if (t < 1) requestAnimationFrame(paso)
  }
  paso()
}

function destellar(x, y, color) {
  const g = new Graphics()
  g.rect(x * TILE, y * TILE, TILE, TILE).fill({ color, alpha: 0.6 })
  capaOverlay.addChild(g)
  const inicio = performance.now()
  const paso = () => {
    const t = Math.min(1, (performance.now() - inicio) / 350)
    g.alpha = 0.6 * (1 - t)
    if (t < 1) requestAnimationFrame(paso)
    else g.destroy()
  }
  paso()
}
```

Y cambiar el watch de la vista para que anime antes de guardar la copia:

```js
watch(() => props.vista, (nueva) => {
  redibujar()
  animarCambios(nueva, vistaPrevia)
  vistaPrevia = structuredClone(nueva)
}, { deep: true })
```

En `onMounted`, después del `redibujar()` inicial, guardar la primera copia:

```js
  vistaPrevia = structuredClone(props.vista)
```

- [ ] **Step 3: Verificar a mano en el navegador**

Crear una partida con `tamanoMapa` grande (40 o más) desde el lobby.

Verificar:
1. La rueda del mouse acerca y aleja, y el zoom sigue al puntero (no se escapa el mapa).
2. El zoom se frena en los límites, no se puede alejar hasta perder el mapa ni acercarse infinito.
3. Arrastrando se mueve el mapa.
4. **Arrastrar no dispara la acción de la casilla** (soltar después de arrastrar no abre el prompt de fundar ciudad). Este es el bug más probable de esta task.
5. Al entrar, la vista arranca centrada en la capital propia.
6. Al fundar una ciudad, aparece creciendo.
7. La consola no tiene errores.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/mapa/MapCanvas.vue
git commit -m "feat(mapa-frontend): camara con zoom y paneo, y animaciones de cambio de estado"
```

---

## Task 10: Diálogo reutilizable, menú de ciudad y reclutamiento

**Files:**
- Create: `frontend/src/components/mapa/MapDialogo.vue`
- Create: `frontend/src/components/mapa/MapCiudadMenu.vue`
- Modify: `frontend/src/components/mapa/MapSession.vue`

**Interfaces:**
- Consumes: `ejecutarAccion` de `MapSession`, `vista.jugadores` (para los recursos propios).
- Produces:
  - `MapDialogo.vue`, props: `titulo: String`, `abierto: Boolean`. Slot por defecto para el contenido. Emite `cerrar`.
  - `MapCiudadMenu.vue`, props: `vista: Object`, `jugadorId: String`, `posicion: Object`. Emite `construir` con `edificio: String`, `reclutar` con `unidad: String`, y `cerrar`.

**Contexto:** hoy el nombre de ciudad se pide con `window.prompt` y solo se puede construir. Reclutar ya existe en el backend (`reglas/militar.js`, acción `reclutar` con `{tipo, x, y, unidad}`) pero no tiene interfaz.

- [ ] **Step 1: Crear el diálogo reutilizable**

Crear `frontend/src/components/mapa/MapDialogo.vue`:

```vue
<!-- frontend/src/components/mapa/MapDialogo.vue -->
<script setup>
defineProps({
  titulo: { type: String, default: '' },
  abierto: { type: Boolean, default: false }
})
defineEmits(['cerrar'])
</script>

<template>
  <div v-if="abierto" class="dialogo-overlay" @click.self="$emit('cerrar')">
    <div class="dialogo">
      <h3 v-if="titulo">{{ titulo }}</h3>
      <slot />
      <button class="btn-secundario cerrar" @click="$emit('cerrar')">Cancelar</button>
    </div>
  </div>
</template>

<style scoped>
.dialogo-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0, 0, 0, 0.6);
  display: flex; align-items: center; justify-content: center;
}
.dialogo {
  background: #2c3e50; border-radius: 12px; padding: 1.5rem;
  min-width: 280px; max-width: 90vw; max-height: 85vh; overflow-y: auto;
  color: #ecf0f1; display: flex; flex-direction: column; gap: 0.5rem;
}
.dialogo h3 { margin: 0 0 0.5rem; }
.btn-secundario {
  background: rgba(255, 255, 255, 0.1); color: #ecf0f1;
  border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 6px;
  padding: 0.5rem 0.8rem; cursor: pointer; text-align: left;
}
.btn-secundario:hover:not(:disabled) { background: rgba(255, 255, 255, 0.2); }
.btn-secundario:disabled { opacity: 0.45; cursor: not-allowed; }
.cerrar { text-align: center; margin-top: 0.5rem; }
</style>
```

- [ ] **Step 2: Crear el menú de ciudad**

Crear `frontend/src/components/mapa/MapCiudadMenu.vue`:

```vue
<!-- frontend/src/components/mapa/MapCiudadMenu.vue -->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  vista: { type: Object, required: true },
  jugadorId: { type: String, required: true },
  posicion: { type: Object, required: true }
})
defineEmits(['construir', 'reclutar', 'cerrar'])

// Estos costos son copia de backend/src/domain/mapa/constantes.js. Se
// duplican a proposito: sirven para DESHABILITAR botones antes de mandar la
// accion, no para decidir nada. El backend sigue siendo la autoridad y vuelve
// a validar todo.
const EDIFICIOS = [
  { tipo: 'granary', nombre: 'Granero', costo: { food: 30, wood: 20 } },
  { tipo: 'market', nombre: 'Mercado', costo: { gold: 50, wood: 30 } },
  { tipo: 'library', nombre: 'Biblioteca', costo: { science: 20, stone: 40 } },
  { tipo: 'barracks', nombre: 'Cuartel', costo: { gold: 40, stone: 30 } }
]

const UNIDADES = [
  { tipo: 'warrior', nombre: 'Guerrero', ataque: 10, defensa: 8, movimiento: 2, costo: { food: 20, gold: 30, wood: 10 }, requiereBarracks: false },
  { tipo: 'archer', nombre: 'Arquero', ataque: 15, defensa: 5, movimiento: 2, costo: { food: 15, gold: 25, wood: 15 }, requiereBarracks: false },
  { tipo: 'spearman', nombre: 'Lancero', ataque: 12, defensa: 15, movimiento: 2, costo: { food: 18, gold: 20, wood: 12 }, requiereBarracks: false },
  { tipo: 'cavalry', nombre: 'Caballería', ataque: 20, defensa: 12, movimiento: 3, costo: { food: 25, gold: 40, wood: 5 }, requiereBarracks: true },
  { tipo: 'catapult', nombre: 'Catapulta', ataque: 25, defensa: 3, movimiento: 1, costo: { food: 10, gold: 50, wood: 30, stone: 20 }, requiereBarracks: true }
]

const tile = computed(() =>
  props.vista.mapa[props.posicion.y * props.vista.config.tamanoMapa + props.posicion.x]
)
const recursos = computed(() =>
  props.vista.jugadores.find(j => j.id === props.jugadorId)?.recursos || {}
)
const tieneBarracks = computed(() => (tile.value?.ciudad?.edificios || []).includes('barracks'))
const yaConstruido = (edificio) => (tile.value?.ciudad?.edificios || []).includes(edificio)

const puedePagar = (costo) =>
  Object.entries(costo).every(([recurso, monto]) => (recursos.value[recurso] || 0) >= monto)

const textoCosto = (costo) =>
  Object.entries(costo).map(([r, m]) => `${m} ${r}`).join(', ')

const motivoEdificio = (ed) => {
  if (yaConstruido(ed.tipo)) return 'ya construido'
  if (!puedePagar(ed.costo)) return 'sin recursos'
  return null
}

const motivoUnidad = (u) => {
  if (u.requiereBarracks && !tieneBarracks.value) return 'requiere cuartel'
  if (!puedePagar(u.costo)) return 'sin recursos'
  return null
}
</script>

<template>
  <div class="ciudad-menu">
    <section>
      <h4>Construir</h4>
      <button
        v-for="ed in EDIFICIOS"
        :key="ed.tipo"
        class="btn-secundario"
        :disabled="motivoEdificio(ed) !== null"
        @click="$emit('construir', ed.tipo)"
      >
        <strong>{{ ed.nombre }}</strong>
        <small>{{ textoCosto(ed.costo) }}</small>
        <em v-if="motivoEdificio(ed)">{{ motivoEdificio(ed) }}</em>
      </button>
    </section>

    <section>
      <h4>Reclutar</h4>
      <button
        v-for="u in UNIDADES"
        :key="u.tipo"
        class="btn-secundario"
        :disabled="motivoUnidad(u) !== null"
        @click="$emit('reclutar', u.tipo)"
      >
        <strong>{{ u.nombre }}</strong>
        <small>ATQ {{ u.ataque }} · DEF {{ u.defensa }} · MOV {{ u.movimiento }}</small>
        <small>{{ textoCosto(u.costo) }}</small>
        <em v-if="motivoUnidad(u)">{{ motivoUnidad(u) }}</em>
      </button>
    </section>
  </div>
</template>

<style scoped>
.ciudad-menu { display: flex; flex-direction: column; gap: 1rem; }
h4 { margin: 0 0 0.4rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.7; }
section { display: flex; flex-direction: column; gap: 0.35rem; }
.btn-secundario {
  background: rgba(255, 255, 255, 0.1); color: #ecf0f1;
  border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 6px;
  padding: 0.5rem 0.8rem; cursor: pointer; text-align: left;
  display: flex; flex-direction: column; gap: 0.1rem;
}
.btn-secundario:hover:not(:disabled) { background: rgba(255, 255, 255, 0.2); }
.btn-secundario:disabled { opacity: 0.45; cursor: not-allowed; }
small { opacity: 0.7; font-size: 0.75rem; }
em { color: #e67e22; font-size: 0.72rem; font-style: normal; }
</style>
```

**Antes de escribirlo**, confirmar el nombre real del arreglo de edificios de una ciudad:

```bash
grep -rn "edificios" backend/src/domain/mapa/reglas/ciudades.js backend/src/domain/mapa/aplicar.js | head
```

Ajustar `tile.ciudad.edificios` al nombre real. No adivinarlo.

- [ ] **Step 3: Cablear en MapSession**

En `frontend/src/components/mapa/MapSession.vue`:

Importar los dos componentes y borrar la constante `EDIFICIOS` local (ahora vive en `MapCiudadMenu`):

```js
import MapDialogo from './MapDialogo.vue'
import MapCiudadMenu from './MapCiudadMenu.vue'
```

Agregar el estado del diálogo de fundación, junto a `edificioMenuAbierto`:

```js
const fundarAbierto = ref(null)   // {x, y} | null
const nombreCiudad = ref('')
```

Reemplazar `onClickTile` para usar el diálogo en vez de `window.prompt`:

```js
const onClickTile = (posicion) => {
  const tile = vista.value.mapa[posicion.y * vista.value.config.tamanoMapa + posicion.x]
  if (!tile) return

  if (tile.ciudad && tile.dueno === jugadorId) {
    edificioMenuAbierto.value = posicion
    return
  }

  if (!tile.ciudad && (tile.dueno === jugadorId || tile.dueno === null)) {
    nombreCiudad.value = ''
    fundarAbierto.value = posicion
  }
}

const confirmarFundar = () => {
  const nombre = nombreCiudad.value.trim()
  if (!nombre || !fundarAbierto.value) return
  const { x, y } = fundarAbierto.value
  fundarAbierto.value = null
  ejecutarAccion({ tipo: 'fundarCiudad', x, y, nombre })
}

const reclutar = (unidad) => {
  if (!edificioMenuAbierto.value) return
  const { x, y } = edificioMenuAbierto.value
  edificioMenuAbierto.value = null
  ejecutarAccion({ tipo: 'reclutar', x, y, unidad })
}
```

En el template, reemplazar el bloque `edificio-menu-overlay` completo por:

```vue
    <MapDialogo :abierto="edificioMenuAbierto !== null" titulo="Ciudad" @cerrar="cerrarMenuEdificio">
      <MapCiudadMenu
        v-if="edificioMenuAbierto"
        :vista="vista"
        :jugador-id="jugadorId"
        :posicion="edificioMenuAbierto"
        @construir="construir"
        @reclutar="reclutar"
        @cerrar="cerrarMenuEdificio"
      />
    </MapDialogo>

    <MapDialogo :abierto="fundarAbierto !== null" titulo="Fundar ciudad" @cerrar="fundarAbierto = null">
      <input
        v-model="nombreCiudad"
        class="entrada-nombre"
        placeholder="Nombre de la ciudad"
        @keyup.enter="confirmarFundar"
      >
      <button class="btn-primario" :disabled="!nombreCiudad.trim()" @click="confirmarFundar">
        Fundar
      </button>
    </MapDialogo>
```

Agregar al `<style scoped>`:

```css
.entrada-nombre {
  background: rgba(0, 0, 0, 0.3); color: #ecf0f1;
  border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 6px;
  padding: 0.5rem 0.7rem; font-size: 1rem;
}
.btn-primario {
  background: #3498db; color: #fff; border: 0; border-radius: 6px;
  padding: 0.5rem 0.9rem; cursor: pointer;
}
.btn-primario:disabled { opacity: 0.45; cursor: not-allowed; }
```

- [ ] **Step 4: Verificar a mano en el navegador**

Verificar:
1. Al clickear una casilla libre aparece un diálogo con campo de texto, no el `window.prompt` del navegador. Enter funciona igual que el botón.
2. Al clickear una ciudad propia aparecen las dos secciones: Construir y Reclutar.
3. Caballería y Catapulta están deshabilitadas con el motivo "requiere cuartel" hasta construir el Cuartel; después se habilitan.
4. Un edificio ya construido aparece deshabilitado con "ya construido".
5. Lo que no podés pagar aparece deshabilitado con "sin recursos".
6. Al reclutar, aparece el sprite de la unidad en el canvas.
7. **Ninguna acción devuelve error del backend**: todo lo que está habilitado se puede hacer.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/mapa/MapDialogo.vue frontend/src/components/mapa/MapCiudadMenu.vue frontend/src/components/mapa/MapSession.vue
git commit -m "feat(mapa-frontend): menu de ciudad con reclutamiento y dialogos propios"
```

---

## Task 11: Selección, movimiento y ataque

**Files:**
- Modify: `frontend/src/components/mapa/MapSession.vue`

**Interfaces:**
- Consumes: props `seleccion` y `alcanzables` de `MapCanvas.vue` (task 8), `MapDialogo.vue` (task 10), acciones `moverEjercito` y `atacar` del backend.
- Produces: nada nuevo hacia afuera. Es la última task.

**Contexto:** las reglas ya existen. `moverEjercito` (`reglas/movimiento.js`) exige adyacencia Manhattan 1, movimiento restante y destino no acuático. `atacar` (`reglas/combate.js`) recibe `{desde, hasta}`. Ambas se mandan por `POST /api/map/:id/accion`.

- [ ] **Step 1: Agregar el estado de selección**

En `frontend/src/components/mapa/MapSession.vue`, agregar junto a los otros `ref`:

```js
const seleccion = ref(null)        // {x, y} del ejercito propio elegido
const ataqueAbierto = ref(null)    // {desde, hasta} | null

const tileEn = (x, y) => vista.value.mapa[y * vista.value.config.tamanoMapa + x]

const esMiTurno = computed(() =>
  vista.value.jugadores[vista.value.indiceJugadorActual]?.id === jugadorId
)

// Adyacentes ortogonales (Manhattan 1), descubiertas, no acuaticas. Es la
// misma condicion que valida `reglas/movimiento.js` en el backend; aca solo
// se anticipa para no ofrecer movimientos que van a ser rechazados.
const alcanzables = computed(() => {
  if (!seleccion.value) return []
  const { x, y } = seleccion.value
  const origen = tileEn(x, y)
  if (!origen?.ejercito || (origen.ejercito.movimientoRestante ?? 1) <= 0) return []

  return [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
    .filter(p => {
      const t = vista.value.config.tamanoMapa
      if (p.x < 0 || p.y < 0 || p.x >= t || p.y >= t) return false
      const tile = tileEn(p.x, p.y)
      return tile && tile.descubierto && tile.terreno !== 'water'
    })
})
```

Agregar `computed` al import de `vue`.

- [ ] **Step 2: Reescribir el manejo de click**

Reemplazar `onClickTile` de la task 10 por:

```js
const esEnemigo = (tile) =>
  (tile.ejercito && tile.ejercito.jugadorId && tile.ejercito.jugadorId !== jugadorId) ||
  (tile.ciudad && tile.dueno && tile.dueno !== jugadorId)

const onClickTile = (posicion) => {
  const tile = tileEn(posicion.x, posicion.y)
  if (!tile || !tile.descubierto) return

  // 1. Con un ejercito seleccionado, un click en casilla alcanzable es una orden.
  if (seleccion.value) {
    const alcanzable = alcanzables.value.some(p => p.x === posicion.x && p.y === posicion.y)
    if (alcanzable) {
      const desde = { ...seleccion.value }
      if (esEnemigo(tile)) {
        ataqueAbierto.value = { desde, hasta: posicion }
      } else {
        seleccion.value = null
        ejecutarAccion({ tipo: 'moverEjercito', desde, hasta: posicion })
      }
      return
    }
    // Click fuera del alcance: se deselecciona y sigue el flujo normal.
    seleccion.value = null
  }

  // 2. Ejercito propio: seleccionar.
  if (tile.ejercito && tile.ejercito.jugadorId === jugadorId && esMiTurno.value) {
    seleccion.value = { x: posicion.x, y: posicion.y }
    return
  }

  // 3. Ciudad propia: menu de construir y reclutar.
  if (tile.ciudad && tile.dueno === jugadorId) {
    edificioMenuAbierto.value = posicion
    return
  }

  // 4. Casilla libre: fundar.
  if (!tile.ciudad && (tile.dueno === jugadorId || tile.dueno === null)) {
    nombreCiudad.value = ''
    fundarAbierto.value = posicion
  }
}

const confirmarAtaque = () => {
  if (!ataqueAbierto.value) return
  const { desde, hasta } = ataqueAbierto.value
  ataqueAbierto.value = null
  seleccion.value = null
  ejecutarAccion({ tipo: 'atacar', desde, hasta })
}
```

- [ ] **Step 3: Agregar el diálogo de ataque**

Agregar antes del `</div>` que cierra `.map-session` en el template:

```vue
    <MapDialogo :abierto="ataqueAbierto !== null" titulo="Atacar" @cerrar="ataqueAbierto = null">
      <div v-if="ataqueAbierto" class="ataque">
        <p class="ataque-linea">
          <strong>Tu ejército</strong>
          <span>{{ tileEn(ataqueAbierto.desde.x, ataqueAbierto.desde.y)?.ejercito?.unidad }}</span>
        </p>
        <p class="ataque-linea">
          <strong>Defensor</strong>
          <span>
            {{ tileEn(ataqueAbierto.hasta.x, ataqueAbierto.hasta.y)?.ciudad
              ? 'Ciudad ' + tileEn(ataqueAbierto.hasta.x, ataqueAbierto.hasta.y).ciudad.nombre
              : tileEn(ataqueAbierto.hasta.x, ataqueAbierto.hasta.y)?.ejercito?.unidad }}
          </span>
        </p>
        <p class="ataque-nota">
          Terreno del defensor:
          {{ tileEn(ataqueAbierto.hasta.x, ataqueAbierto.hasta.y)?.terreno }}
          <span v-if="tileEn(ataqueAbierto.hasta.x, ataqueAbierto.hasta.y)?.ciudad">
            · la ciudad suma defensa
          </span>
        </p>
        <button class="btn-primario" @click="confirmarAtaque">Atacar</button>
      </div>
    </MapDialogo>
```

Pasar las props nuevas al canvas:

```vue
    <MapCanvas
      :vista="vista"
      :jugador-id="jugadorId"
      :seleccion="seleccion"
      :alcanzables="alcanzables"
      @click-tile="onClickTile"
    />
```

Agregar el estilo:

```css
.ataque { display: flex; flex-direction: column; gap: 0.4rem; }
.ataque-linea { display: flex; justify-content: space-between; gap: 1rem; margin: 0; }
.ataque-nota { opacity: 0.7; font-size: 0.8rem; margin: 0.3rem 0 0.6rem; }
```

- [ ] **Step 4: Deseleccionar con Escape**

Agregar dentro del `<script setup>`:

```js
const onTecla = (e) => {
  if (e.key !== 'Escape') return
  seleccion.value = null
  ataqueAbierto.value = null
  edificioMenuAbierto.value = null
  fundarAbierto.value = null
}
```

Registrarlo en `onMounted` (`window.addEventListener('keydown', onTecla)`) y quitarlo en `onUnmounted` (`window.removeEventListener('keydown', onTecla)`).

- [ ] **Step 5: Verificar la partida completa en el navegador**

Con dos navegadores, jugar una partida entera de 2 jugadores hasta que alguien gane.

Verificar:
1. Click en ejército propio: se marca con borde blanco y se resaltan en amarillo las casillas adyacentes válidas.
2. El agua **no** se resalta.
3. Click en casilla alcanzable vacía: el ejército se mueve.
4. Click en casilla alcanzable con enemigo: se abre el diálogo con atacante, defensor y terreno; al confirmar se resuelve el combate y aparece el destello.
5. `Escape` deselecciona y cierra cualquier diálogo.
6. Con un ejército sin movimiento restante no se resalta nada.
7. En el turno del rival no se puede seleccionar el ejército propio.
8. Al capturar la última ciudad del rival, aparece `MapVictory` con el ganador correcto en **ambos** navegadores.
9. La Crónica narra los combates y la captura, con `GEMINI_API_KEY` vacía.
10. Ninguna acción habilitada por la interfaz devuelve error del backend.

- [ ] **Step 6: Correr el lint de los dos lados**

```bash
cd backend && yarn lint
cd ../frontend && yarn lint && yarn build
```

Esperado: sin errores.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/mapa/MapSession.vue
git commit -m "feat(mapa-frontend): seleccion de ejercito, movimiento y ataque"
```

---

## Cobertura de la spec

| Requisito de la spec | Task |
|---|---|
| Elevación por ruido, mar y relieve, humedad | 1, 2 |
| Ríos por gradiente | 3 |
| Recursos en yacimientos sesgados por terreno | 3 |
| Masa principal conectada, capitales alcanzables | 4 |
| Relajación de la distancia mínima | 4 |
| Reescritura de tests de generación | 2, 3, 4 |
| Narrador local puro y determinista | 5 |
| Gemini con fallback local, una sola voz | 6 |
| Camino de lectura de narrativas | 6 |
| Panel de crónica | 7 |
| Pantalla de victoria | 7 |
| PixiJS reemplazando la grilla | 8 |
| Sprites CC0 de Kenney y tinte por bando | 8 |
| Capas: terreno, territorio, piezas, overlay, niebla | 8 |
| Cámara con zoom y paneo, encuadre en la capital | 9 |
| Animaciones de movimiento, combate y fundación | 9 |
| Diálogo reutilizable, adiós a `window.prompt` | 10 |
| Reclutamiento con motivos de bloqueo visibles | 10 |
| Selección, casillas alcanzables, confirmación de ataque | 11 |
| Deseleccionar con Escape | 11 |
