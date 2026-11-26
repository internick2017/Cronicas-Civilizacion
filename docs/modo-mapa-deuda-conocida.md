# Modo mapa: deuda conocida y próximos pasos

Escrito el 2026-08-08, tras completar la nueva capa de dominio. Puntos 2, 4 y 5 actualizados el 2026-11-26;
el resto no se volvió a revisar, salvo que el punto 3 sigue sin un test del repositorio contra Postgres.

El modo mapa está completo a nivel backend: dominio puro, persistencia, servicio, API REST y
sockets. 235 tests en verde. Esta página lista lo que quedó afuera a propósito, para que no se
pierda entre sesiones.

## Bloqueantes de la auditoría: cerrados

Los seis problemas que motivaron el rediseño (`docs/auditoria-sistema-legacy.md`) se
verificaron cerrados con un probe real contra base de datos, no solo con tests:

| Problema original | Cómo se cerró |
|---|---|
| Ciudades y recursos se perdían al reiniciar | Snapshot JSON completo + test de round-trip que cubre ciudades, ejércitos, edificios y niebla |
| Niebla de guerra global | `descubiertoPor: []` por tile, más `vistaJugador` que filtra en el backend |
| Dos capitales por jugador | `iniciar()` es el único lugar que reparte capitales |
| Coordenada fuera de rango daba 500 | `tileEn` devuelve `null` y las reglas lanzan `POSICION_INVALIDA` (400) |
| Costo con recurso inexistente dejaba `NaN` | `puedePagar` lanza `RECURSO_DESCONOCIDO` |
| Esquema mantenido a mano en dos archivos | `mapSchema.js` lo declara una vez y genera ambos dialectos |

## Pendiente, en orden de prioridad

### 1. Autorización de sockets y REST — ✅ resuelto (2026-08-08)

`map:join` acepta un tercer argumento con el token de sesión del jugador (emitido una
única vez por `unirse`); `POST /:id/accion` y `GET /:id` exigen el header
`X-Jugador-Token`.

### 2. Los dos lockfiles se contradicen — ✅ resuelto

Quedó solo `backend/yarn.lock`.

### 3. La ruta Postgres del repositorio no tiene tests

Todo `test/mapa/repo.test.js` corre sobre SQLite en memoria. La mitad Postgres de
`MapGameRepo` (`adaptarPlaceholders`, el upsert con `ON CONFLICT`, el desempaquetado de
`res.rows`) se revisó a mano y no se le encontró defecto, pero es código sin cobertura que sí
corre en producción. Lo barato: testear `adaptarPlaceholders` en aislamiento y correr la suite
del repo contra un `db.query` falso que registre SQL y parámetros.

### 4. Borrar el sistema legacy — ✅ resuelto

En `backend/src/models` y `backend/src/routes` ya no están el modelo ni los servicios viejos.

### 5. Frontend del modo mapa — ✅ resuelto

Existe en `frontend/src/components/mapa/`.

## Detalles menores anotados

- `GET /api/map` llama a `servicio.repo.listarActivas()` salteando el servicio. Hoy es seguro
  (esa consulta solo devuelve id, código, nombre y estado), pero conviene exponer
  `MapGameService.listarActivas()` y que la ruta no toque el repo.
- `puedePagar` corta con `false` en el primer recurso insuficiente, así que una clave
  desconocida posterior no se detecta en ese caso. Todos los costos vienen de `constantes.js`,
  cuyo test ya prueba que solo usa claves válidas.
- `movimiento.js` y `combate.js` repiten las mismas cuatro validaciones de entrada
  (tiles existen, ejército propio, adyacencia, movimiento restante). Es el único lugar donde
  se pueden desincronizar; conviene extraerlas a `comun.js`.
- `adaptarPlaceholders` se rompería si alguna consulta llegara a tener un `?` dentro de un
  string literal. Ninguna lo tiene.
- El candado de concurrencia de `MapGameService` es intra-proceso. Con más de una instancia del
  backend contra la misma base haría falta versionado optimista en el repositorio.
- Los tests de constantes validan forma (clave válida, mayor que cero) pero no magnitudes: un
  typo que cambie 10 por 100 en un stat no lo detecta ningún test.
