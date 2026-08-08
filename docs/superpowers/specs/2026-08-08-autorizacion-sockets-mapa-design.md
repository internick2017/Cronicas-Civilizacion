# Autorización de sockets y REST del modo mapa — Diseño

Fecha: 2026-08-08. Rama base: `master` (post-merge del modo mapa).
Contexto previo: `docs/modo-mapa-deuda-conocida.md`, ítem "Autorización de sockets".

## Problema

`map:join` acepta cualquier `gameId` + `jugadorId` sin verificar identidad. Al investigar
se confirmó que el problema es más amplio: `jugadorId` **no es un secreto**. `vistaJugador`
devuelve el `id` de todos los jugadores de la partida (solo oculta sus `recursos`), así que
cualquier jugador ya adentro puede leer los `jugadorId` de los demás con un `GET` legítimo.

Con eso, tres superficies quedan abiertas a quien conozca `gameId` + el `jugadorId` de otro:

1. **Socket** — unirse a la sala privada de otro jugador y ver su vista en vivo (niebla,
   recursos, eventos) según se van emitiendo.
2. **`POST /:id/accion`** — jugar el turno de otro jugador.
3. **`GET /:id?jugadorId=`** — leer la vista privada de otro jugador por REST.

## Decisiones tomadas (con el usuario)

1. **Alcance: las tres superficies juntas**, con el mismo mecanismo. Es el mismo hueco
   (`jugadorId` no es secreto) manifestado en tres lugares.
2. **Nivel del mecanismo: token de sesión liviano por jugador**, no JWT. El resto del
   proyecto es un juego de LAN/WiFi sin cuentas (el modo narrativo no tiene auth alguna; el
   JWT existente en `AuthService`/`middleware/auth.js` solo protege `/api/auth/*`). Exigir
   login para jugar rompería el modelo de "entrar con un código" que tiene el juego.
3. **Ubicación del secreto: fuera del dominio**, en el repositorio, nunca dentro de
   `estado.jugadores`. El dominio (`MapGame.js`, `aplicar.js`, las reglas) es deliberadamente
   puro y no debe saber de autenticación; así `vistaJugador` estructuralmente no puede
   filtrar el secreto, porque nunca está en lo que esa función recorre.
4. **`GET /:id?jugadorId=` también queda protegido**, no solo la escritura. Es el mismo
   hueco por lectura.
5. **`POST /:id/iniciar` queda sin cambios.** No es una acción de un jugador particular; el
   dominio no tiene noción de "host" y cualquiera de los jugadores ya unidos puede arrancar
   la partida hoy. Agregarle un token no tiene a quién atribuírselo.
6. **`POST /:id/unirse` queda sin proteger.** Es el punto de entrada: ahí es donde se emite
   el token, no donde se exige.

## 1. Emisión del token

Al `unirse`, `MapGameService._unirse` genera un token aleatorio de 32 bytes
(`crypto.randomBytes(32).toString('hex')`, 64 caracteres hex), lo guarda **hasheado**
(SHA-256) en el repositorio, y lo devuelve **en texto plano una sola vez**, en la respuesta
de esa llamada. El servicio nunca vuelve a exponerlo; no vive en el `estado` del dominio ni
en ninguna vista.

Forma de la respuesta de `unirse` (hoy es `vistaJugador(estado, id)`; se envuelve):

```js
{ vista: { /* lo que unirse devuelve hoy */ }, token: '<64 hex>' }
```

El cliente lo guarda del lado suyo (en el modo mapa, que todavía no tiene frontend, sería
`localStorage`, igual que el patrón que ya usa el modo narrativo para recordar al jugador).
Si `unirse` falla (partida llena, ya iniciada, etc.) no se genera ni persiste ningún token.

## 2. Transporte y verificación

- **REST**: header `X-Jugador-Token` en `POST /:id/accion` y `GET /:id`.
- **Socket**: tercer argumento de `map:join(gameId, jugadorId, token)`.

Verificación: el servicio hashea el token recibido (SHA-256) y lo compara contra el hash
guardado para ese `(gameId, jugadorId)`. Si no hay header/argumento, o no coincide con el
hash guardado:
- REST → `ReglaError('TOKEN_INVALIDO', ...)` → HTTP 400, mismo formato que cualquier otro
  `ReglaError` (`{ codigo, mensaje }`).
- Socket → el `join` no ocurre, en silencio, igual que hoy con un `jugadorId` vacío. No se
  emite ningún evento de error al cliente (mantiene el criterio ya usado en `map:join`).

No se usa comparación de tiempo constante: el riesgo de timing attack es despreciable para
este modelo de amenaza (LAN/WiFi, sin cuentas de por medio), y añadir esa complejidad no
está justificado.

## 3. Persistencia

Tabla nueva, declarada en el único punto de verdad del esquema (`mapSchema.js`), paralela a
`map_game_eventos`:

```js
{
  nombre: 'map_game_tokens',
  columnas: [
    ['game_id', { sqlite: 'TEXT NOT NULL', postgres: 'UUID NOT NULL' }],
    ['jugador_id', { sqlite: 'TEXT NOT NULL', postgres: 'TEXT NOT NULL' }],
    ['token_hash', { sqlite: 'TEXT NOT NULL', postgres: 'TEXT NOT NULL' }],
    ['creado', { sqlite: 'DATETIME DEFAULT CURRENT_TIMESTAMP', postgres: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }],
  ],
}
```

Clave primaria compuesta `(game_id, jugador_id)` en ambos dialectos (un jugador tiene un
único token vigente por partida; si `unirse` se reintenta para el mismo id ya existente, la
regla del dominio ya rechaza con `JUGADOR_DUPLICADO` antes de llegar a generar token, así
que no hay caso de sobrescritura a resolver aquí).

`MapGameRepo` gana dos métodos:

- `guardarToken(gameId, jugadorId, tokenHash)` — upsert (`INSERT ... ON CONFLICT` /
  `INSERT OR REPLACE`, según dialecto, siguiendo el patrón ya usado en `guardar()`).
- `verificarToken(gameId, jugadorId, tokenPlano)` — hashea `tokenPlano`, consulta el hash
  guardado, devuelve `true`/`false`. Si no hay fila para ese `(gameId, jugadorId)`, `false`.

Sobrevive a un reinicio del backend, igual que el resto del estado (mismo principio que
Task 14: la base es la fuente de verdad, el caché en memoria no).

## 4. Cambios en `MapGameService`

- `_unirse`: tras `_persistir`, generar el token, hashearlo, `repo.guardarToken(...)`,
  devolver `{ vista, token }` en vez de solo `vista`.
- Nuevo helper privado `_verificarToken(gameId, jugadorId, token)`: llama a
  `repo.verificarToken`; si es `false` lanza `ReglaError('TOKEN_INVALIDO', ...)`.
- `accion(id, jugadorId, accion, token)`: verifica el token **antes** de resolver el estado
  y ejecutar la regla (falla rápido, sin tocar el candado de concurrencia ni el caché).
- `vista(id, jugadorId, token)`: verifica el token antes de devolver `vistaJugador`.
- `iniciar` no cambia de firma.

## 5. Cambios en `mapRoutes.js`

- `POST /:id/accion`: leer `req.headers['x-jugador-token']`, pasarlo a `servicio.accion`.
- `GET /:id`: leer el mismo header, pasarlo a `servicio.vista`.
- `POST /:id/unirse`: sin cambios en la firma de la ruta; el `res.status(200).json(vista)`
  pasa a `res.status(200).json(resultado)` donde `resultado = { vista, token }`.
- Errores: `TOKEN_INVALIDO` es un `ReglaError` más, ya cubierto por `manejarError` (400) sin
  cambios en esa función.

## 6. Cambios en `server-dynamic.js`

- `map:join(id, jugadorId, token)`: antes de `socket.join(...)`, `await
  mapGameService._verificarToken(id, jugadorId, token)`; si lanza, no unirse a la sala (catch
  silencioso, mismo criterio que la validación de tipos que ya existe en el handler).
- `map:leave` no cambia: salir de una sala no es una operación sensible.

## 7. Testing

- `MapGameRepo`: `guardarToken` + `verificarToken` (token correcto → `true`; incorrecto →
  `false`; sin registro previo → `false`); round-trip del token sobrevive a un
  segundo repo sobre la misma DB (mismo patrón que el test de reinicio de Task 14).
- `MapGameService`: `unirse` devuelve un token de 64 hex chars distinto en cada llamada;
  `accion`/`vista` con token correcto funcionan igual que hoy; con token incorrecto o
  ausente lanzan `TOKEN_INVALIDO`; con el token de OTRO jugador del mismo juego también
  lanzan (cierra el caso central: no alcanza con "tener algún token válido de esa partida").
- `mapRoutes.js`: `POST /:id/unirse` devuelve `{ vista, token }`; `POST /:id/accion` y
  `GET /:id` con header correcto/incorrecto/ausente devuelven 200/400/400.
- Regresión explícita del hallazgo original: dado el token de p1, p2 no puede leer la vista
  de p1 ni actuar en su nombre, aunque conozca el `jugadorId` de p1 (que sí es visible vía
  `vistaJugador`).
- `server-dynamic.js` (socket): `map:join` con token correcto une la sala; con token
  incorrecto, ausente, o de otro jugador de la misma partida, no la une (verificar
  consultando las salas del socket, `socket.rooms`, tras el intento).

## Fuera de alcance

- Rotación o expiración de tokens (no hay sesiones largas que lo justifiquen hoy).
- Aplicar el mismo mecanismo al modo narrativo (fuera del pedido; queda como ítem de deuda
  aparte si se decide después).
- `POST /:id/iniciar` (ver decisión 5).
- Comparación de tiempo constante (ver sección 2).
