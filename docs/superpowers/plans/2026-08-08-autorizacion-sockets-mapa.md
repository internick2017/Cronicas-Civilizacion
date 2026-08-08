# Autorización de sockets y REST del modo mapa — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un jugador del modo mapa no puede leer la vista de otro jugador ni actuar en su nombre, aunque conozca su `jugadorId` (que hoy es público dentro de la partida).

**Architecture:** Token de sesión opaco (32 bytes, hex), emitido una sola vez al `unirse`, guardado hasheado (SHA-256) en una tabla nueva fuera del dominio puro. `MapGameService` lo exige antes de `accion`/`vista`; el socket `map:join` lo exige antes de unir la sala privada del jugador. `iniciar` no cambia (no es una acción de jugador particular).

**Tech Stack:** Node `crypto` (nativo, sin dependencias nuevas en producción), better-sqlite3, `socket.io-client` como devDependency nueva (solo para el test de socket).

## Global Constraints

- npm/npx están rotos en esta máquina: usar **yarn** para todo (`yarn vitest run`, `yarn add`, `yarn lint`).
- El dominio (`backend/src/domain/mapa/**`) no cambia en este plan y sigue sin conocer nada de autenticación. El token vive exclusivamente en `MapGameRepo`/`MapGameService`.
- El esquema de base de datos se declara en un único lugar (`backend/src/db/mapSchema.js`); toda tabla nueva se agrega ahí, nunca escrita a mano en un `CREATE TABLE` suelto.
- `unirse` no exige token (es el punto de entrada donde se emite); `iniciar` no cambia de firma ni exige token.
- Sin comparación de tiempo constante para el hash (ver spec, sección 2): una igualdad simple de strings hex es suficiente para este modelo de amenaza.
- Fallos de token: `ReglaError('TOKEN_INVALIDO', ...)` en REST (→ 400 vía `manejarError`, sin cambios en esa función); en el socket, el `join` simplemente no ocurre, sin emitir ningún evento de error.
- ESLint 0 errores: `cd backend && yarn lint` antes de cada commit.
- Commits sin atribución de IA ni líneas `Co-Authored-By`.
- Spec de referencia: `docs/superpowers/specs/2026-08-08-autorizacion-sockets-mapa-design.md`.

---

### Task 1: Tabla de tokens y persistencia en `MapGameRepo`

**Files:**
- Modify: `backend/src/db/mapSchema.js`
- Modify: `backend/src/db/MapGameRepo.js`
- Create: `backend/test/mapa/repo.tokens.test.js`

**Interfaces:**
- Consumes: `ddl(dialecto)` ya existente en `mapSchema.js` (patrón `TABLAS` + columnas `{sqlite, postgres}`); `adaptarPlaceholders(sql)` y `this._ejecutar(sql, params)` ya existentes en `MapGameRepo.js`.
- Produces (las usa Task 2):
  - `MapGameRepo.guardarToken(gameId, jugadorId, tokenHash) -> Promise<void> | void` — upsert por `(game_id, jugador_id)`.
  - `MapGameRepo.verificarToken(gameId, jugadorId, tokenPlano) -> Promise<boolean> | boolean` — hashea `tokenPlano` con SHA-256 y compara contra el hash guardado; `false` si no hay fila o si no coincide.

- [ ] **Step 1: Agregar la tabla `map_game_tokens` a `mapSchema.js`**

Insertar como tercer elemento del array `TABLAS` (después de `map_game_eventos`, antes de `DIALECTOS_VALIDOS`):

```js
  {
    nombre: 'map_game_tokens',
    columnas: [
      ['game_id', { sqlite: 'TEXT NOT NULL', postgres: 'UUID NOT NULL' }],
      ['jugador_id', { sqlite: 'TEXT NOT NULL', postgres: 'TEXT NOT NULL' }],
      ['token_hash', { sqlite: 'TEXT NOT NULL', postgres: 'TEXT NOT NULL' }],
      ['creado', { sqlite: 'DATETIME DEFAULT CURRENT_TIMESTAMP', postgres: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }],
    ],
  },
```

El helper `ddl()` existente ya genera `CREATE TABLE IF NOT EXISTS map_game_tokens (...)` para ambos dialectos a partir de esto; no hace falta tocar la función `ddl`. La clave primaria compuesta se agrega en el propio DDL: cambiar la línea de generación de cada tabla para permitir una `pk` opcional. Como el helper actual no soporta primary key compuesta declarativa, usar en su lugar un `UNIQUE` a nivel fila vía la propia semántica del upsert (Step 2): no se necesita `PRIMARY KEY (game_id, jugador_id)` explícito porque el upsert de Step 2 usa `ON CONFLICT` sobre esas dos columnas, y SQLite/Postgres requieren un índice único para que `ON CONFLICT` funcione. Agregar por tanto una tabla con una constraint `UNIQUE` inline en la columna `jugador_id` no alcanza (la unicidad es sobre el PAR). En vez de extender el helper `ddl()`, la sentencia de creación de este archivo ya soporta texto libre por tabla: dejar las columnas como están arriba, y en `MapGameRepo.init()` (sqlite) ejecutar además una sentencia de índice único explícita. Ver Step 2 para el detalle exacto (se resuelve ahí, junto con el upsert, para no duplicar SQL en dos lugares).

- [ ] **Step 2: Implementar `guardarToken` y `verificarToken` en `MapGameRepo.js`**

Agregar el import de `crypto` al tope del archivo:

```js
import crypto from 'crypto';
import { ddl } from './mapSchema.js';
```

Modificar `init()` para crear también el índice único que hace posible el upsert por `(game_id, jugador_id)` — agregar esta línea dentro de `init()`, después del bucle/`Promise.all` que ya ejecuta `ddl(this.dialecto)`:

```js
  init() {
    const statements = ddl(this.dialecto);
    const indiceTokens = 'CREATE UNIQUE INDEX IF NOT EXISTS map_game_tokens_pk ON map_game_tokens (game_id, jugador_id)';
    if (this.dialecto === 'sqlite') {
      for (const stmt of statements) this.db.exec(stmt);
      this.db.exec(indiceTokens);
      return;
    }
    return Promise.all([...statements, indiceTokens].map(stmt => this.db.query(stmt)));
  }
```

Agregar los dos métodos nuevos, después de `listarActivas()` y antes de `_ejecutar`:

```js
  guardarToken(gameId, jugadorId, tokenHash) {
    const sql = `
      INSERT INTO map_game_tokens (game_id, jugador_id, token_hash, creado)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT (game_id, jugador_id) DO UPDATE SET
        token_hash = excluded.token_hash,
        creado = CURRENT_TIMESTAMP
    `;
    return this._ejecutar(sql, [gameId, jugadorId, tokenHash]);
  }

  verificarToken(gameId, jugadorId, tokenPlano) {
    const hash = crypto.createHash('sha256').update(String(tokenPlano ?? '')).digest('hex');
    const sql = 'SELECT token_hash FROM map_game_tokens WHERE game_id = ? AND jugador_id = ?';
    if (this.dialecto === 'sqlite') {
      const fila = this.db.prepare(sql).get(gameId, jugadorId);
      return !!fila && fila.token_hash === hash;
    }
    return this.db.query(adaptarPlaceholders(sql), [gameId, jugadorId])
      .then(res => !!res.rows[0] && res.rows[0].token_hash === hash);
  }
```

- [ ] **Step 2b: Escribir los tests (fallan primero)**

```js
// backend/test/mapa/repo.tokens.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { MapGameRepo } from '../../src/db/MapGameRepo.js';

const hashDe = (tokenPlano) => crypto.createHash('sha256').update(tokenPlano).digest('hex');

let repo;
beforeEach(() => { repo = new MapGameRepo(new Database(':memory:'), 'sqlite'); repo.init(); });

describe('MapGameRepo: tokens', () => {
  it('round-trip: guarda el hash del token plano y lo reconoce', () => {
    // guardarToken recibe el HASH ya calculado (lo calcula el servicio, no el
    // repo, ver Task 2) — este test simula ese flujo hasheando el token plano
    // con el mismo algoritmo antes de guardarlo.
    const tokenPlano = 'token-secreto-de-prueba';
    repo.guardarToken('g1', 'p1', hashDe(tokenPlano));
    expect(repo.verificarToken('g1', 'p1', tokenPlano)).toBe(true);
    expect(repo.verificarToken('g1', 'p1', 'token-incorrecto')).toBe(false);
  });

  it('sin registro previo, verificarToken da false', () => {
    expect(repo.verificarToken('g-inexistente', 'p1', 'cualquiera')).toBe(false);
  });

  it('guardarToken es upsert: un segundo guardado para el mismo (game,jugador) reemplaza el hash', () => {
    repo.guardarToken('g1', 'p1', hashDe('viejo'));
    repo.guardarToken('g1', 'p1', hashDe('nuevo'));
    expect(repo.verificarToken('g1', 'p1', 'viejo')).toBe(false);
    expect(repo.verificarToken('g1', 'p1', 'nuevo')).toBe(true);
  });

  it('el token de un jugador no sirve para otro jugador de la misma partida', () => {
    repo.guardarToken('g1', 'p1', hashDe('token-de-p1'));
    expect(repo.verificarToken('g1', 'p2', 'token-de-p1')).toBe(false);
  });

  it('sobrevive a un segundo repo sobre la misma DB (mismo patron que el reinicio de Task 14)', () => {
    const db = new Database(':memory:');
    const repoA = new MapGameRepo(db, 'sqlite');
    repoA.init();
    repoA.guardarToken('g1', 'p1', hashDe('token-persistente'));

    const repoB = new MapGameRepo(db, 'sqlite');
    expect(repoB.verificarToken('g1', 'p1', 'token-persistente')).toBe(true);
  });
});
```

- [ ] **Step 3: Correr y ver fallar** — `cd backend && yarn vitest run test/mapa/repo.tokens.test.js` → FAIL (métodos no existen).

- [ ] **Step 4: Aplicar la implementación de los Steps 1-2, correr y ver pasar** — mismo comando → PASS (5/5).

- [ ] **Step 5: Correr la suite completa para confirmar 0 regresiones** — `cd backend && yarn vitest run` → todo verde (235+5 tests).

- [ ] **Step 6: Lint y commit**

```bash
cd backend && yarn lint
git add backend/src/db/mapSchema.js backend/src/db/MapGameRepo.js backend/test/mapa/repo.tokens.test.js
git commit -m "feat(mapa): tabla y persistencia de tokens de sesion por jugador"
```

---

### Task 2: Emisión y verificación de tokens en `MapGameService`

**Files:**
- Modify: `backend/src/services/MapGameService.js`
- Modify: `backend/test/mapa/mapGameService.test.js`

**Interfaces:**
- Consumes: `MapGameRepo.guardarToken`, `MapGameRepo.verificarToken` (Task 1).
- Produces (las usa Task 3):
  - `MapGameService.unirse(idOCodigo, jugador) -> Promise<{ vista, token }>` — CAMBIA de forma respecto de hoy (antes devolvía `vista` directamente).
  - `MapGameService.accion(id, jugadorId, accion, token) -> Promise<{ vista, eventos }>` — gana un cuarto parámetro `token`, obligatorio.
  - `MapGameService.vista(id, jugadorId, token) -> Promise<vista>` — gana un tercer parámetro `token`, obligatorio.
  - `MapGameService.verificarToken(gameId, jugadorId, token) -> Promise<void>` (público — lo consumen `accion`/`vista` en este mismo archivo Y `mapSocket.js` en Task 4) — lanza `ReglaError('TOKEN_INVALIDO', 'Token invalido o ausente')` si `repo.verificarToken` da `false`.
  - `MapGameService.iniciar(id)` — SIN CAMBIOS de firma.

Este es el cambio de contrato central del plan: **rompe** los 8 call-sites existentes de `.unirse(...)` en `mapGameService.test.js` (que hoy esperan que el resultado SEA la vista) y cualquier código que llame `accion`/`vista` sin token. Este task actualiza su propio archivo de test como parte de su entrega — es la superficie de regresión natural de este cambio.

- [ ] **Step 1: Escribir los tests nuevos primero (fallan)**

Agregar a `backend/test/mapa/mapGameService.test.js`, dentro del `describe('MapGameService', ...)` existente:

```js
  it('unirse devuelve un token de 64 caracteres hex, distinto en cada llamada', async () => {
    const { svc } = crearServicio();
    const { id } = await svc.crearPartida({ nombre: 'T', semilla: 's1' });
    const r1 = await svc.unirse(id, { id: 'p1', nombre: 'A', civilizacion: 'Incas' });
    const r2 = await svc.unirse(id, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' });
    expect(r1).toHaveProperty('vista');
    expect(r1.token).toMatch(/^[0-9a-f]{64}$/);
    expect(r2.token).toMatch(/^[0-9a-f]{64}$/);
    expect(r1.token).not.toBe(r2.token);
  });

  it('accion con el token correcto funciona igual que antes', async () => {
    const { svc } = crearServicio();
    const { id } = await svc.crearPartida({ nombre: 'T', semilla: 's1' });
    const { token: t1 } = await svc.unirse(id, { id: 'p1', nombre: 'A', civilizacion: 'Incas' });
    await svc.unirse(id, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' });
    await svc.iniciar(id);
    const r = await svc.accion(id, 'p1', { tipo: 'terminarTurno' }, t1);
    expect(r.eventos.some(e => e.tipo === 'TurnoAvanzado')).toBe(true);
  });

  it('accion sin token o con token incorrecto lanza TOKEN_INVALIDO', async () => {
    const { svc } = crearServicio();
    const { id } = await svc.crearPartida({ nombre: 'T', semilla: 's1' });
    await svc.unirse(id, { id: 'p1', nombre: 'A', civilizacion: 'Incas' });
    await svc.unirse(id, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' });
    await svc.iniciar(id);

    await expect(svc.accion(id, 'p1', { tipo: 'terminarTurno' }, undefined))
      .rejects.toMatchObject({ codigo: 'TOKEN_INVALIDO' });
    await expect(svc.accion(id, 'p1', { tipo: 'terminarTurno' }, 'token-inventado'))
      .rejects.toMatchObject({ codigo: 'TOKEN_INVALIDO' });
  });

  it('el token de OTRO jugador de la misma partida no sirve para actuar en tu nombre', async () => {
    const { svc } = crearServicio();
    const { id } = await svc.crearPartida({ nombre: 'T', semilla: 's1' });
    const { token: t1 } = await svc.unirse(id, { id: 'p1', nombre: 'A', civilizacion: 'Incas' });
    const { token: t2 } = await svc.unirse(id, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' });
    await svc.iniciar(id);

    // p2 intenta jugar el turno de p1 (que es quien arranca) usando SU PROPIO token (t2)
    await expect(svc.accion(id, 'p1', { tipo: 'terminarTurno' }, t2))
      .rejects.toMatchObject({ codigo: 'TOKEN_INVALIDO' });
  });

  it('vista con token correcto funciona; con token de otro jugador o ausente lanza TOKEN_INVALIDO', async () => {
    const { svc } = crearServicio();
    const { id } = await svc.crearPartida({ nombre: 'T', semilla: 's1' });
    const { token: t1 } = await svc.unirse(id, { id: 'p1', nombre: 'A', civilizacion: 'Incas' });
    const { token: t2 } = await svc.unirse(id, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' });
    await svc.iniciar(id);

    const v = await svc.vista(id, 'p1', t1);
    expect(v).toHaveProperty('mapa');

    await expect(svc.vista(id, 'p1', t2)).rejects.toMatchObject({ codigo: 'TOKEN_INVALIDO' });
    await expect(svc.vista(id, 'p1', undefined)).rejects.toMatchObject({ codigo: 'TOKEN_INVALIDO' });
  });
```

- [ ] **Step 2: Actualizar TODOS los call-sites existentes de `.unirse(...)` en el mismo archivo**, porque su forma de retorno cambia. Localizar cada uno con:

```bash
cd backend && grep -n "\.unirse(" test/mapa/mapGameService.test.js
```

Para cada línea encontrada, aplicar el patrón de reemplazo correspondiente:

- Donde el resultado de `unirse` NO se usa (la mayoría — solo se llama para agregar un jugador): dejar la llamada como `await svc.unirse(...)` sin cambios; no rompe nada, el valor de retorno simplemente no se leía.
- Donde el resultado SÍ se usaba como la vista (buscar `const vistaUnion = await svc.unirse(...)` y similares — inspeccionar qué propiedades de ese resultado lee el test después): cambiar a `const { vista: vistaUnion } = await svc.unirse(...)` (desestructurar `vista` con el mismo nombre que tenía la variable original, para no tocar el resto de las aserciones de ese test).
- La función helper `crearPartidaConDosJugadores(svc)` (usada por varios tests): actualizarla para capturar y devolver también los tokens, porque los tests que la usan y luego llaman `accion`/`vista` van a necesitarlos:

```js
async function crearPartidaConDosJugadores(svc) {
  const { id, codigo } = await svc.crearPartida({ nombre: 'T', semilla: 's1' });
  const { token: tokenP1 } = await svc.unirse(id, { id: 'p1', nombre: 'A', civilizacion: 'Incas' });
  const { token: tokenP2 } = await svc.unirse(id, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' });
  await svc.iniciar(id);
  return { id, codigo, tokenP1, tokenP2 };
}
```

Después de este cambio, cada test que use `crearPartidaConDosJugadores` y luego llame `svc.accion(...)` o `svc.vista(...)` debe actualizarse para desestructurar `tokenP1`/`tokenP2` del resultado y pasarlos como último argumento en esas llamadas (agregar el token que corresponda al jugador que está actuando en cada caso). Revisar cada uso con:

```bash
cd backend && grep -n "crearPartidaConDosJugadores\|\.accion(\|\.vista(" test/mapa/mapGameService.test.js
```

y ajustar cada llamada a `accion`/`vista` agregando el token del jugador correspondiente como último argumento.

- [ ] **Step 3: Correr y confirmar que TODO falla o pasa por la razón correcta** — `cd backend && yarn vitest run test/mapa/mapGameService.test.js` → los tests nuevos fallan (TOKEN_INVALIDO no existe todavía), y los tests viejos que ya se actualizaron para desestructurar deberían seguir fallando porque `unirse` todavía no devuelve `token`.

- [ ] **Step 4: Implementar en `MapGameService.js`**

Agregar el import de `crypto` (si no está ya — el archivo ya importa `crypto` para `generarCodigo`, reusar el mismo import):

Modificar `_unirse` (después de `await this._persistir(estado, eventos)`, antes del `return`):

```js
  async _unirse(idOCodigo, { id, nombre, civilizacion }) {
    const original = await this._resolver(idOCodigo);
    if (!original) throw new ReglaError('PARTIDA_NO_ENCONTRADA', 'Partida no encontrada');

    const estado = structuredClone(original);
    const eventos = unirseRegla(estado, { id, nombre, civilizacion });
    aplicar(estado, eventos);
    await this._persistir(estado, eventos);

    const token = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await this.repo.guardarToken(estado.id, id, hash);

    return { vista: vistaJugador(estado, id), token };
  }
```

Agregar el método (público — sin guión bajo, porque `mapSocket.js` en Task 4 también lo llama; los métodos con guión bajo del resto de la clase son convención del proyecto para "uso interno de esta clase solamente", y este ya no lo es), cerca de `_idCanonico` (mismo estilo de comentario que el resto del archivo):

```js
  /**
   * Verifica el token de sesion de un jugador antes de dejarlo leer su vista
   * o actuar en su nombre. El secreto vive fuera del dominio (tabla
   * `map_game_tokens`, gestionada por MapGameRepo) precisamente para que
   * vistaJugador() no tenga forma de filtrarlo por accidente: nunca esta en
   * lo que esa funcion recorre.
   */
  async verificarToken(gameId, jugadorId, token) {
    const valido = await this.repo.verificarToken(gameId, jugadorId, token);
    if (!valido) throw new ReglaError('TOKEN_INVALIDO', 'Token invalido o ausente');
  }
```

Modificar `accion` y `_accion` para recibir y verificar el token ANTES de resolver el estado (falla rápido, sin tocar el candado ni el caché):

```js
  async accion(id, jugadorId, accion, token) {
    const gameId = await this._idCanonico(id);
    await this.verificarToken(gameId, jugadorId, token);
    return this._conCandado(gameId, () => this._accion(id, jugadorId, accion));
  }
```

`_accion` no cambia de firma ni de cuerpo (la verificación ya ocurrió en `accion` antes de encolar).

Modificar `vista`:

```js
  async vista(id, jugadorId, token) {
    const gameId = await this._idCanonico(id);
    await this.verificarToken(gameId, jugadorId, token);
    const estado = await this._resolver(id);
    if (!estado) throw new ReglaError('PARTIDA_NO_ENCONTRADA', 'Partida no encontrada');
    return vistaJugador(estado, jugadorId);
  }
```

Nota: `_idCanonico` ya resuelve el estado una vez para traducir código→id; como `vista` y `accion` ahora llaman `_idCanonico` antes de verificar el token, y luego `_accion`/el resto del cuerpo vuelve a resolver el estado vía `_resolver`, hay una resolución extra respecto de antes. Es aceptable (mismo costo que ya pagaba `_idCanonico` para el candado en `unirse`/`iniciar`); no optimizar en este plan.

- [ ] **Step 5: Correr y ver pasar** — `cd backend && yarn vitest run test/mapa/mapGameService.test.js` → todo verde.

- [ ] **Step 6: Correr la suite completa** — `cd backend && yarn vitest run` → 0 regresiones fuera de este archivo (Task 1 ya dejó `repo.tokens.test.js` verde; `mapRoutes.test.js` va a fallar en este punto porque todavía no se actualizó — eso es esperado, se resuelve en Task 3).

- [ ] **Step 7: Lint y commit**

```bash
cd backend && yarn lint
git add backend/src/services/MapGameService.js backend/test/mapa/mapGameService.test.js
git commit -m "feat(mapa): unirse emite token, accion y vista lo exigen"
```

---

### Task 3: Cablear el token en `mapRoutes.js`

**Files:**
- Modify: `backend/src/routes/mapRoutes.js`
- Modify: `backend/test/mapa/mapRoutes.test.js`

**Interfaces:**
- Consumes: `MapGameService.unirse` (devuelve `{ vista, token }`), `.accion(id, jugadorId, accion, token)`, `.vista(id, jugadorId, token)` (Task 2).
- Produces: contrato HTTP nuevo — header `X-Jugador-Token` requerido en `POST /:id/accion` y `GET /:id`; `POST /:id/unirse` devuelve `{ vista, token }` en el body en vez de la vista directamente.

- [ ] **Step 1: Actualizar `mapRoutes.test.js`**

El test `'flujo feliz'` necesita: capturar el `token` de la respuesta de unirse, mandarlo en el header de `accion`. El test `'accion invalida'` necesita el token de p2 (quien manda la acción inválida) para que el 400 sea por `NO_ES_TU_TURNO` y no por `TOKEN_INVALIDO`. El test de fuga de información necesita el token de p1 para el `GET`.

Reescribir el archivo completo con estos cambios (mismo `crearApp`/`crearServicio`, sin cambios ahí):

```js
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { MapGameRepo } from '../../src/db/MapGameRepo.js';
import { MapGameService } from '../../src/services/MapGameService.js';
import { crearMapRoutes } from '../../src/routes/mapRoutes.js';

function crearApp(servicio) {
  const app = express();
  app.use(express.json());
  app.use('/api/map', crearMapRoutes(servicio));
  return app;
}

function crearServicio(opts = {}) {
  const db = new Database(':memory:');
  const repo = new MapGameRepo(db, 'sqlite');
  repo.init();
  const servicio = new MapGameService({ repo, ...opts });
  return { db, repo, servicio, app: crearApp(servicio) };
}

describe('mapRoutes', () => {
  it('flujo feliz: crear -> unirse x2 -> iniciar -> accion', async () => {
    const { app } = crearServicio();

    const resCrear = await request(app)
      .post('/api/map')
      .send({ nombre: 'Mi Partida', semilla: 's1' });
    expect(resCrear.status).toBe(201);
    expect(resCrear.body).toHaveProperty('id');
    expect(resCrear.body).toHaveProperty('codigo');
    const { id } = resCrear.body;

    const resUnirse1 = await request(app)
      .post(`/api/map/${id}/unirse`)
      .send({ id: 'p1', nombre: 'A', civilizacion: 'Incas' });
    expect(resUnirse1.status).toBe(200);
    expect(resUnirse1.body.vista.jugadores.some(j => j.id === 'p1')).toBe(true);
    expect(resUnirse1.body.token).toMatch(/^[0-9a-f]{64}$/);
    const tokenP1 = resUnirse1.body.token;

    const resUnirse2 = await request(app)
      .post(`/api/map/${id}/unirse`)
      .send({ id: 'p2', nombre: 'B', civilizacion: 'Mayas' });
    expect(resUnirse2.status).toBe(200);
    expect(resUnirse2.body.vista.jugadores.some(j => j.id === 'p2')).toBe(true);

    const resIniciar = await request(app).post(`/api/map/${id}/iniciar`);
    expect(resIniciar.status).toBe(200);
    expect(resIniciar.body.estado).toBe('jugando');

    // el primer jugador en unirse (p1) es quien arranca
    const resAccion = await request(app)
      .post(`/api/map/${id}/accion`)
      .set('X-Jugador-Token', tokenP1)
      .send({ jugadorId: 'p1', tipo: 'terminarTurno' });
    expect(resAccion.status).toBe(200);
    expect(resAccion.body).toHaveProperty('vista');
    expect(resAccion.body).toHaveProperty('eventos');
    expect(resAccion.body.eventos.some(e => e.tipo === 'TurnoAvanzado')).toBe(true);
  });

  it('accion invalida (fuera de turno) devuelve 400 con codigo NO_ES_TU_TURNO', async () => {
    const { app } = crearServicio();
    const resCrear = await request(app).post('/api/map').send({ nombre: 'T', semilla: 's1' });
    const { id } = resCrear.body;
    await request(app).post(`/api/map/${id}/unirse`).send({ id: 'p1', nombre: 'A', civilizacion: 'Incas' });
    const resUnirse2 = await request(app).post(`/api/map/${id}/unirse`).send({ id: 'p2', nombre: 'B', civilizacion: 'Mayas' });
    const tokenP2 = resUnirse2.body.token;
    await request(app).post(`/api/map/${id}/iniciar`);

    // p2 no es el jugador actual (p1 empieza) -> NO_ES_TU_TURNO, con SU PROPIO token valido
    const res = await request(app)
      .post(`/api/map/${id}/accion`)
      .set('X-Jugador-Token', tokenP2)
      .send({ jugadorId: 'p2', tipo: 'terminarTurno' });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('NO_ES_TU_TURNO');
    expect(res.body).toHaveProperty('mensaje');
  });

  it('accion sin token o con token incorrecto devuelve 400 con codigo TOKEN_INVALIDO', async () => {
    const { app } = crearServicio();
    const resCrear = await request(app).post('/api/map').send({ nombre: 'T', semilla: 's1' });
    const { id } = resCrear.body;
    await request(app).post(`/api/map/${id}/unirse`).send({ id: 'p1', nombre: 'A', civilizacion: 'Incas' });
    await request(app).post(`/api/map/${id}/unirse`).send({ id: 'p2', nombre: 'B', civilizacion: 'Mayas' });
    await request(app).post(`/api/map/${id}/iniciar`);

    const sinToken = await request(app)
      .post(`/api/map/${id}/accion`)
      .send({ jugadorId: 'p1', tipo: 'terminarTurno' });
    expect(sinToken.status).toBe(400);
    expect(sinToken.body.codigo).toBe('TOKEN_INVALIDO');

    const tokenFalso = await request(app)
      .post(`/api/map/${id}/accion`)
      .set('X-Jugador-Token', 'no-es-un-token-real')
      .send({ jugadorId: 'p1', tipo: 'terminarTurno' });
    expect(tokenFalso.status).toBe(400);
    expect(tokenFalso.body.codigo).toBe('TOKEN_INVALIDO');
  });

  it('GET de un id inexistente devuelve 404 sin token (no hay token que verificar sobre una partida que no existe)', async () => {
    const { app } = crearServicio();
    const res = await request(app).get('/api/map/no-existe?jugadorId=p1').set('X-Jugador-Token', 'x');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('codigo');
    expect(res.body).toHaveProperty('mensaje');
  });

  it('GET / lista partidas activas', async () => {
    const { app } = crearServicio();
    await request(app).post('/api/map').send({ nombre: 'T', semilla: 's1' });
    const res = await request(app).get('/api/map');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
  });

  it('GET sin token o con el token de otro jugador devuelve 400 TOKEN_INVALIDO', async () => {
    const { app } = crearServicio();
    const resCrear = await request(app).post('/api/map').send({ nombre: 'T', semilla: 's1' });
    const { id } = resCrear.body;
    await request(app).post(`/api/map/${id}/unirse`).send({ id: 'p1', nombre: 'A', civilizacion: 'Incas' });
    const resUnirse2 = await request(app).post(`/api/map/${id}/unirse`).send({ id: 'p2', nombre: 'B', civilizacion: 'Mayas' });
    const tokenP2 = resUnirse2.body.token;
    await request(app).post(`/api/map/${id}/iniciar`);

    const sinToken = await request(app).get(`/api/map/${id}?jugadorId=p1`);
    expect(sinToken.status).toBe(400);
    expect(sinToken.body.codigo).toBe('TOKEN_INVALIDO');

    // token VALIDO pero de otro jugador (p2) intentando leer la vista de p1
    const tokenAjeno = await request(app).get(`/api/map/${id}?jugadorId=p1`).set('X-Jugador-Token', tokenP2);
    expect(tokenAjeno.status).toBe(400);
    expect(tokenAjeno.body.codigo).toBe('TOKEN_INVALIDO');
  });

  it('fuga de informacion: la vista de p1 no revela la ciudad ni la posicion de p2, ni la semilla', async () => {
    const { app } = crearServicio();
    const resCrear = await request(app).post('/api/map').send({ nombre: 'T', semilla: 'semilla-secreta' });
    const { id } = resCrear.body;
    const resUnirse1 = await request(app).post(`/api/map/${id}/unirse`).send({ id: 'p1', nombre: 'A', civilizacion: 'Incas' });
    const tokenP1 = resUnirse1.body.token;
    await request(app).post(`/api/map/${id}/unirse`).send({ id: 'p2', nombre: 'B', civilizacion: 'Mayas' });
    await request(app).post(`/api/map/${id}/iniciar`);

    const res = await request(app).get(`/api/map/${id}?jugadorId=p1`).set('X-Jugador-Token', tokenP1);
    expect(res.status).toBe(200);

    for (const tile of res.body.mapa) {
      if (tile.descubierto === false) {
        expect(tile).not.toHaveProperty('ciudad');
        expect(Object.keys(tile).sort()).toEqual(['descubierto', 'x', 'y']);
      }
    }
    const ciudadesVisibles = res.body.mapa.filter(t => t.descubierto && t.ciudad);
    expect(ciudadesVisibles.every(t => t.dueno === 'p1')).toBe(true);

    const serializado = JSON.stringify(res.body);
    expect(serializado).not.toContain('semilla-secreta');
    expect(res.body).not.toHaveProperty('semilla');
  });
});
```

- [ ] **Step 2: Correr y confirmar que falla** — `cd backend && yarn vitest run test/mapa/mapRoutes.test.js` → FAIL (la ruta todavía no lee el header ni cambia la forma de la respuesta de `unirse`).

- [ ] **Step 3: Implementar en `mapRoutes.js`**

Modificar la ruta de unirse (cambia solo el `res.status(200).json(...)`):

```js
  // POST /api/map/:id/unirse
  router.post('/:id/unirse', async (req, res) => {
    try {
      const { id, nombre, civilizacion } = req.body ?? {};
      const resultado = await servicio.unirse(req.params.id, { id, nombre, civilizacion });
      res.status(200).json(resultado); // { vista, token }
    } catch (err) {
      manejarError(err, res);
    }
  });
```

Modificar la ruta de acción para leer y pasar el header:

```js
  // POST /api/map/:id/accion
  router.post('/:id/accion', async (req, res) => {
    try {
      const { jugadorId, ...accion } = req.body ?? {};
      const token = req.headers['x-jugador-token'];
      const resultado = await servicio.accion(req.params.id, jugadorId, accion, token);
      res.status(200).json(resultado);
    } catch (err) {
      manejarError(err, res);
    }
  });
```

Modificar la ruta GET para leer y pasar el header:

```js
  // GET /api/map/:id?jugadorId= - vista del jugador (NUNCA el mapa completo)
  router.get('/:id', async (req, res) => {
    try {
      const token = req.headers['x-jugador-token'];
      const vista = await servicio.vista(req.params.id, req.query.jugadorId, token);
      res.status(200).json(vista);
    } catch (err) {
      manejarError(err, res);
    }
  });
```

Actualizar el comentario de cabecera del archivo (el bloque `IMPORTANTE` sobre `crearMapRoutes`) agregando una línea sobre el token:

```js
 * IMPORTANTE: cada ruta que devuelve estado de partida usa la vista filtrada
 * (vistaJugador) que ya produce MapGameService. Nunca se lee el repo/dominio
 * directamente para servir un estado de partida: eso sería reintroducir la
 * fuga de informacion (niebla, recursos ajenos, semilla) que el dominio
 * ya se encarga de evitar.
 *
 * Toda ruta que actua o lee como un jugador (accion, GET) exige el header
 * `X-Jugador-Token`, emitido una unica vez por `unirse`. Sin el, cualquiera
 * que supiera el jugadorId de otro (visible dentro de la partida via
 * vistaJugador) podria jugar en su nombre o leer su vista privada.
 */
```

- [ ] **Step 4: Correr y ver pasar** — `cd backend && yarn vitest run test/mapa/mapRoutes.test.js` → todo verde.

- [ ] **Step 5: Correr la suite completa** — `cd backend && yarn vitest run` → 0 regresiones.

- [ ] **Step 6: Lint y commit**

```bash
cd backend && yarn lint
git add backend/src/routes/mapRoutes.js backend/test/mapa/mapRoutes.test.js
git commit -m "feat(mapa): las rutas REST exigen X-Jugador-Token para accion y lectura"
```

---

### Task 4: Autorización del socket `map:join`

**Files:**
- Create: `backend/src/sockets/mapSocket.js`
- Modify: `backend/src/server-dynamic.js`
- Create: `backend/test/mapa/mapSocket.test.js`
- Modify: `backend/package.json` (agregar `socket.io-client` como devDependency)

**Interfaces:**
- Consumes: `MapGameService.verificarToken(gameId, jugadorId, token)` (Task 2 — público precisamente porque este módulo necesita llamarlo).
- Produces: `registrarMapSocket(socket, io, mapGameService)` — función que registra los handlers `map:join`/`map:leave` sobre un `socket` de socket.io. La usa `server-dynamic.js` dentro de `io.on('connection', ...)`.

Este task extrae la lógica de sockets del modo mapa a su propio módulo, siguiendo el mismo patrón que ya existe para el modo narrativo/legacy (`backend/src/sockets/gameSocket.js` con `handleGameSocket(socket, io)`). Sin esta extracción, `server-dynamic.js` no es testeable de forma aislada (arranca DB, IA, etc.) y no habría forma de probar el rechazo de un token inválido sin levantar el server completo.

- [ ] **Step 1: Agregar `socket.io-client` como devDependency**

```bash
cd backend && yarn add -D socket.io-client
```

- [ ] **Step 2: Escribir el test (falla primero)**

```js
// backend/test/mapa/mapSocket.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import Database from 'better-sqlite3';
import { MapGameRepo } from '../../src/db/MapGameRepo.js';
import { MapGameService } from '../../src/services/MapGameService.js';
import { registrarMapSocket } from '../../src/sockets/mapSocket.js';

let httpServer, io, mapGameService, url;

beforeEach(async () => {
  const db = new Database(':memory:');
  const repo = new MapGameRepo(db, 'sqlite');
  repo.init();
  mapGameService = new MapGameService({ repo });

  httpServer = createServer();
  io = new Server(httpServer);
  io.on('connection', (socket) => registrarMapSocket(socket, io, mapGameService));

  await new Promise((resolve) => httpServer.listen(0, resolve));
  url = `http://localhost:${httpServer.address().port}`;
});

afterEach(() => {
  io.close();
  httpServer.close();
});

function conectarCliente() {
  return new Promise((resolve) => {
    const socket = ioClient(url, { transports: ['websocket'] });
    socket.on('connect', () => resolve(socket));
  });
}

describe('registrarMapSocket', () => {
  it('map:join con token correcto une la sala privada del jugador', async () => {
    const { id } = await mapGameService.crearPartida({ nombre: 'T', semilla: 's1' });
    const { token } = await mapGameService.unirse(id, { id: 'p1', nombre: 'A', civilizacion: 'Incas' });

    const cliente = await conectarCliente();
    const ok = await new Promise((resolve) => {
      cliente.emit('map:join', id, 'p1', token, resolve);
    });
    expect(ok).toBe(true);

    // Verificacion server-side: el socket debe estar en la sala privada de p1.
    const socketsEnSala = await io.in(`map:${id}:p1`).fetchSockets();
    expect(socketsEnSala).toHaveLength(1);

    cliente.close();
  });

  it('map:join con token incorrecto NO une ninguna sala', async () => {
    const { id } = await mapGameService.crearPartida({ nombre: 'T', semilla: 's1' });
    await mapGameService.unirse(id, { id: 'p1', nombre: 'A', civilizacion: 'Incas' });

    const cliente = await conectarCliente();
    const ok = await new Promise((resolve) => {
      cliente.emit('map:join', id, 'p1', 'token-invalido', resolve);
    });
    expect(ok).toBe(false);

    const socketsEnSala = await io.in(`map:${id}:p1`).fetchSockets();
    expect(socketsEnSala).toHaveLength(0);

    cliente.close();
  });

  it('map:join con el token de OTRO jugador de la misma partida no une la sala', async () => {
    const { id } = await mapGameService.crearPartida({ nombre: 'T', semilla: 's1' });
    await mapGameService.unirse(id, { id: 'p1', nombre: 'A', civilizacion: 'Incas' });
    const { token: tokenP2 } = await mapGameService.unirse(id, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' });

    const cliente = await conectarCliente();
    const ok = await new Promise((resolve) => {
      cliente.emit('map:join', id, 'p1', tokenP2, resolve);
    });
    expect(ok).toBe(false);

    const socketsEnSala = await io.in(`map:${id}:p1`).fetchSockets();
    expect(socketsEnSala).toHaveLength(0);

    cliente.close();
  });

  it('map:join sin token (llamada vieja, 3 argumentos, sin ack) no une ninguna sala', async () => {
    const { id } = await mapGameService.crearPartida({ nombre: 'T', semilla: 's1' });
    await mapGameService.unirse(id, { id: 'p1', nombre: 'A', civilizacion: 'Incas' });

    const cliente = await conectarCliente();
    // Llamada sin ack (compatible con un cliente viejo que todavia no manda
    // token ni callback): el handler recibe `token=undefined, ack=undefined`,
    // asi que nunca invoca ningun callback. No hay nada que esperar via
    // promesa aca: en vez de eso, se manda un segundo `map:join` CON ack
    // como "punto de sincronizacion" — socket.io procesa los eventos de un
    // mismo socket en orden, asi que cuando el segundo ack llega, el primer
    // intento ya fue procesado (y rechazado) por el servidor.
    cliente.emit('map:join', id, 'p1');
    await new Promise((resolve) => {
      cliente.emit('map:join', 'otra-partida-inexistente', 'p1', 'x', resolve);
    });

    const socketsEnSala = await io.in(`map:${id}:p1`).fetchSockets();
    expect(socketsEnSala).toHaveLength(0);

    cliente.close();
  });
});
```

- [ ] **Step 3: Correr y confirmar que falla** — `cd backend && yarn vitest run test/mapa/mapSocket.test.js` → FAIL (`mapSocket.js` no existe).

- [ ] **Step 4: Crear `backend/src/sockets/mapSocket.js`**

```js
/**
 * Handlers de socket.io del modo mapa. Separados de `server-dynamic.js` (que
 * no es testeable de forma aislada: arranca DB, IA, etc.) siguiendo el mismo
 * patron que ya usa el modo narrativo/legacy (`handleGameSocket` en
 * `gameSocket.js`).
 *
 * El jugadorId de un jugador es visible para el resto de los jugadores de la
 * partida (vistaJugador lo expone). Sin verificar el token, cualquiera que lo
 * conociera podia unirse a la sala privada de otro jugador y ver su vista en
 * vivo (niebla, recursos, eventos). map:join exige el token de sesion emitido
 * una unica vez por MapGameService.unirse.
 *
 * `ack`, si el cliente lo pasa, recibe `true`/`false` segun si la sala se unio.
 * Es opcional: un cliente que no lo pase sigue funcionando igual, solo que sin
 * forma de saber si el join tuvo exito (asi era el comportamiento antes de este
 * cambio).
 */
export function registrarMapSocket(socket, io, mapGameService) {
  socket.on('map:join', async (id, jugadorId, token, ack) => {
    if (typeof id !== 'string' || !id || typeof jugadorId !== 'string' || !jugadorId) {
      if (typeof ack === 'function') ack(false);
      return;
    }
    try {
      await mapGameService.verificarToken(id, jugadorId, token);
    } catch {
      if (typeof ack === 'function') ack(false);
      return;
    }
    socket.join(`map:${id}:${jugadorId}`);
    if (typeof ack === 'function') ack(true);
  });

  socket.on('map:leave', (id, jugadorId) => {
    if (typeof id === 'string' && id && typeof jugadorId === 'string' && jugadorId) {
      socket.leave(`map:${id}:${jugadorId}`);
    }
  });
}
```

Nota sobre el `token` no-string en general (aplica al último caso de test, y a cualquier cliente que mande algo raro): `verificarToken` pasa lo que sea que haya llegado como `token` directo a `repo.verificarToken`, que lo hashea con `crypto.createHash('sha256').update(String(tokenPlano ?? ''))` (ver Task 1, Step 2 — el `String(...)` ya cubre `undefined`, números, etc. sin tirar). No hace falta validar el tipo de `token` en `mapSocket.js` antes de verificar: cualquier valor que no sea el hex correcto simplemente no matchea y el flujo de rechazo ya cubierto se aplica igual.

- [ ] **Step 5: Correr y ver pasar** — `cd backend && yarn vitest run test/mapa/mapSocket.test.js` → todo verde.

- [ ] **Step 6: Cablear `registrarMapSocket` en `server-dynamic.js`**

Agregar el import cerca de los otros imports de sockets/servicios:

```js
import { registrarMapSocket } from './sockets/mapSocket.js';
```

Reemplazar el bloque actual (los dos `socket.on('map:join', ...)` / `socket.on('map:leave', ...)` inline dentro de `io.on('connection', (socket) => { ... })`) por:

```js
  registrarMapSocket(socket, io, mapGameService);
```

`mapGameService` ya es una variable de módulo (`let pool, redisClient, mapGameService;`) construida dentro de `initializeConnections()` antes de que el server empiece a aceptar conexiones (mismo orden que ya garantiza que las rutas HTTP del modo mapa no reciban tráfico antes de tiempo, ver el gate router existente) — no hace falta ningún gate adicional para sockets, porque `io.on('connection', ...)` solo se activa una vez que el server real está escuchando, que ya ocurre después de `initializeConnections()`.

- [ ] **Step 7: Verificar que el server sigue arrancando**

```bash
cd backend && node src/server-dynamic.js
```

Confirmar en el log que arranca sin excepciones y sigue mostrando `✅ Map routes ready: /api/map`. Detener el proceso (`Ctrl+C` o matar el PID) después de confirmar.

- [ ] **Step 8: Correr la suite completa** — `cd backend && yarn vitest run` → 0 regresiones (suite completa, incluye Tasks 1-4 y todo lo pre-existente).

- [ ] **Step 9: Lint y commit**

```bash
cd backend && yarn lint
git add backend/src/sockets/mapSocket.js backend/src/server-dynamic.js backend/test/mapa/mapSocket.test.js backend/package.json backend/yarn.lock
git commit -m "feat(mapa): map:join exige token de sesion, extraido a modulo testeable"
```

---

### Task 5: Documentación

**Files:**
- Modify: `README.md`
- Modify: `docs/modo-mapa-deuda-conocida.md`

- [ ] **Step 1: Actualizar la sección "🗺️ Modo mapa" de `README.md`**

Reemplazar el bloque de endpoints (líneas actuales bajo `### Endpoints`) por:

```markdown
### Endpoints

- `POST /api/map` - Crear una partida nueva. Body: `{ nombre, semilla, config }`.
- `GET /api/map` - Listar partidas activas (sólo metadata, no el estado del juego).
- `POST /api/map/:id/unirse` - Unirse a una partida. Body: `{ id, nombre, civilizacion }`. Devuelve `{ vista, token }`: el `token` es el secreto de sesión de ese jugador, se emite **una sola vez** acá y hay que guardarlo del lado del cliente (no hay forma de recuperarlo después).
- `POST /api/map/:id/iniciar` - Iniciar la partida (reparte el mapa y arranca el primer turno). No requiere token: cualquiera de los jugadores ya unidos puede arrancarla.
- `POST /api/map/:id/accion` - Ejecutar una acción de juego. Requiere el header `X-Jugador-Token` con el token de quien manda la acción. Body: `{ jugadorId, tipo, ...datosDeLaAccion }`, donde `tipo` es una de: `fundarCiudad`, `construir`, `reclutar`, `moverEjercito`, `atacar`, `terminarTurno`.
- `GET /api/map/:id?jugadorId=` - Obtener la vista del jugador (nunca el mapa completo: siempre filtrada por niebla de guerra). Requiere el header `X-Jugador-Token` correspondiente a ese `jugadorId`.

### Por qué el token

El `jugadorId` de cada jugador es visible para el resto de los jugadores de la misma partida (aparece en `vistaJugador`, aunque sus recursos no). Sin el token, cualquiera que lo conociera podría leer la vista privada de otro jugador o jugar en su nombre. El token es un secreto de sesión liviano (no hace falta cuenta ni login, consistente con el resto del juego), se genera al `unirse` y se verifica en cada acción, lectura, y en el socket `map:join(gameId, jugadorId, token, ack?)` (la sala de socket también es privada por jugador: `map:<id>:<jugadorId>`).
```

- [ ] **Step 2: Marcar el ítem resuelto en `docs/modo-mapa-deuda-conocida.md`**

Ubicar la sección `### 1. Autorización de sockets` y reemplazarla por:

```markdown
### 1. Autorización de sockets y REST — ✅ resuelto (2026-08-08)

`map:join` acepta un tercer argumento con el token de sesión del jugador (emitido una
única vez por `unirse`); `POST /:id/accion` y `GET /:id` exigen el header
`X-Jugador-Token`. Diseño en
`docs/superpowers/specs/2026-08-08-autorizacion-sockets-mapa-design.md`.
```

Renumerar las secciones siguientes (`### 2.` pasa a ser el nuevo punto 1 pendiente, etc.) para que la lista quede consecutiva.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/modo-mapa-deuda-conocida.md
git commit -m "docs(mapa): documenta el token de sesion y cierra el item de deuda"
```

---

## Self-Review (hecho al escribir este plan)

- **Cobertura del spec:** secciones 1-7 del spec cubiertas: emisión (Task 2), transporte/verificación REST (Tasks 2-3), transporte/verificación socket (Task 4), persistencia (Task 1), cambios de servicio (Task 2), cambios de rutas (Task 3), cambios de server-dynamic (Task 4), testing (cada task incluye el suyo, más la regresión explícita del hallazgo original en Task 3 Step 1 y Task 4 Step 2). `iniciar` sin cambios: explícito en Global Constraints y no tocado en ningún task.
- **Placeholders:** ninguno; cada step trae código completo o el comando exacto a correr.
- **Consistencia de tipos:** `ReglaError('TOKEN_INVALIDO', ...)` usado igual en Tasks 2, 3 y 4 (vía `verificarToken`, reusado desde el socket). `guardarToken(gameId, jugadorId, tokenHash)` / `verificarToken(gameId, jugadorId, tokenPlano)` con la misma firma en Task 1 (definición) y Task 2 (uso). `{ vista, token }` como forma de retorno de `unirse` es consistente entre Task 2 (servicio) y Task 3 (ruta HTTP, sin envolver de nuevo).
