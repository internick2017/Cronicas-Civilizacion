# Diseño — Entrada por voz (speech-to-text) en la acción del jugador

- **Fecha:** 2026-06-22
- **Estado:** Aprobado (brainstorming)
- **Feature:** #1 del backlog de mejoras ([memory/mejoras-backlog.md])
- **Alcance:** una sola feature. Las otras 3 (escritura simultánea, modo mapa de ciudades, modo dominación) se diseñan por separado.

## Contexto y motivación

El juego se juega en celulares por WiFi y teclear la acción del turno en el móvil es molesto.
Queremos permitir **dictar la acción por voz** en lugar de escribirla, sin agregar costo ni
fricción. El componente de entrada actual es [frontend/src/components/StoryInput.vue]: un
`textarea` con `v-model="actionText"`, botones Limpiar/Enviar, contador de 280 caracteres y
estilos ya optimizados para móvil.

## Decisiones tomadas (brainstorming)

| Decisión | Elección | Razón |
|----------|----------|-------|
| Flujo | **Llenar y revisar** (no auto-envío) | El reconocimiento se equivoca y la acción alimenta la historia; conviene una revisión antes de enviar. |
| Motor | **Web Speech API** (navegador) | $0 costo, sin backend, sin subir audio, texto en vivo. Whisper queda como posible fallback futuro. |
| Dispositivos | Android/Chrome, iPhone/Safari, PC/Chrome-Edge | Soportar los tres; iOS necesita auto-reinicio. |
| Inserción de texto | **Agregar** al contenido existente | Permite mezclar tecleo y dictado, o dictar por partes. |
| Pruebas | **Checklist manual** por dispositivo | El frontend no tiene runner de tests hoy; Vitest se difiere. |

## Arquitectura y límites

Toda la complejidad de la Web Speech API se aísla en un **composable nuevo**; el componente
solo lo consume. **El backend no cambia.**

### Archivo nuevo: `frontend/src/composables/useSpeechToText.js`

Encapsula 100% la Web Speech API. El resto de la app no referencia `webkitSpeechRecognition`.

**Firma:**

```js
useSpeechToText({ lang = 'es-ES', onFinal }) => {
  isSupported,   // boolean reactivo: hay SpeechRecognition disponible
  isListening,   // ref<boolean>: el micro está activo
  interimText,   // ref<string>: transcripción provisional en vivo
  error,         // ref<string|null>: código de error legible o null
  start,         // () => void: pide permiso y empieza a escuchar
  stop,          // () => void: detiene y fija intención = idle
  toggle         // () => void: start/stop según estado
}
```

- `onFinal(texto)` se llama por cada frase **definitiva** que entrega el navegador. El
  componente decide qué hacer con ella (agregar a `actionText`).
- Detección de soporte: `window.SpeechRecognition || window.webkitSpeechRecognition`.
- Config: `continuous = true`, `interimResults = true`, `lang`.
- **Auto-reinicio iOS:** se guarda una "intención" (`listening` vs `idle`). En `onend`, si la
  intención sigue siendo `listening`, se vuelve a llamar `start()`. `stop()` pone la intención
  en `idle` y evita el reinicio.
- Mapeo de errores `onerror` → `error.value` (`not-allowed`, `no-speech`, `network`, etc.).
- Limpieza: al desmontar, abortar el reconocimiento y soltar listeners.

### Archivo modificado: `frontend/src/components/StoryInput.vue`

- Botón 🎤 nuevo dentro de `.input-buttons` (junto a Limpiar/Enviar).
- Consume el composable. `onFinal` agrega el texto a `actionText` (con un espacio adelante si
  ya hay contenido), respetando el tope de 280.
- Mismo gating que el textarea: el botón solo se habilita con `isMyTurn && !isSubmitting`.
- Si `isSupported === false`, el botón **no se renderiza** (degradación elegante).
- Si `isMyTurn` pasa a `false` mientras se escucha → `stop()`.

## UX e interacción

**Estados del botón 🎤:**
- **Inactivo:** icono 🎤 neutro. Tap → `start()`.
- **Escuchando:** icono animado/rojo + etiqueta "Escuchando…". Tap → `stop()`.
- Auto-stop cuando el navegador corta (`onend`); en iPhone, se reinicia solo mientras la
  intención sea `listening`.

**Texto:**
- `interimText` se muestra en vivo en el textarea como texto provisional.
- Cada frase definitiva se fija en `actionText`, agregada al contenido previo.
- Tope de **280 caracteres**: si el dictado lo excedería, se deja de agregar y el contador
  existente avisa (ya se pone naranja > 250).
- **No hay auto-envío.** El jugador revisa, corrige y toca 📤 Enviar.

**Móvil:**
- Botón con área táctil ≥44px, consistente con Limpiar/Enviar.
- El estado "escuchando" debe ser visualmente evidente (color + animación), porque en el cel
  no siempre se nota que el micrófono está activo.

## Casos de borde y errores

| Caso | Manejo |
|------|--------|
| Navegador sin soporte (Firefox, webviews in-app) | Botón 🎤 no se renderiza; textarea funciona como hoy. |
| Permiso de micrófono denegado (`not-allowed` / `service-not-allowed`) | Cortar escucha + aviso inline: "Activa el permiso de micrófono para dictar". |
| `no-speech` / `aborted` / silencio | Parar en silencio, sin error visible. |
| iPhone/Safari corta `continuous` | Auto-reinicio mientras intención = `listening`. |
| Error de red (`network`) | Aviso inline: "Sin conexión para el reconocimiento de voz". La voz **requiere internet** aunque el juego sea por WiFi local. |
| Pierde el turno mientras dicta (timeout / skip / cierre de ronda) | `watch(isMyTurn)` → `stop()`. |
| Idioma | `es-ES` por defecto (o `navigator.language` si ya es español). |

## Pruebas

**Checklist manual por dispositivo (verificación principal):**
- [ ] Android/Chrome: dictar frase larga → aparece en vivo → se fija → editar → Enviar.
- [ ] iPhone/Safari: dictar con pausas → el auto-reinicio mantiene la escucha.
- [ ] PC/Chrome o Edge: idem + **negar permiso** de micro → se ve el aviso.
- [ ] Firefox (sin soporte): el botón 🎤 no aparece; el textarea funciona igual.
- [ ] Dictar fuera de turno / perder el turno → la escucha se corta.
- [ ] Dictado que supera 280 → deja de agregar; contador en naranja.

**Diferido (anotado):** montar Vitest en el frontend para un test unitario del composable
(máquina de estados `start`/`stop`/`onFinal`/auto-reinicio/errores con un `SpeechRecognition`
simulado). Se hará la primera vez que toquemos lógica de frontend más seria. YAGNI por ahora.

## Fuera de alcance

- Whisper / STT en servidor (posible fallback futuro si la precisión decepciona).
- Auto-envío manos libres y modo híbrido (descartados en brainstorming).
- Las otras 3 features del backlog (escritura simultánea, modo mapa de ciudades, modo
  dominación de mapa) — cada una con su propio spec.
