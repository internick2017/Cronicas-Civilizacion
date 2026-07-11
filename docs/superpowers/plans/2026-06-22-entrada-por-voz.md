# Entrada por voz (speech-to-text) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que el jugador dicte su acción del turno por voz, llenando el cuadro de texto para revisar antes de enviar.

**Architecture:** Toda la Web Speech API se aísla en un composable nuevo (`useSpeechToText.js`). El componente `StoryInput.vue` agrega un botón 🎤 que enciende/apaga el dictado; las frases definitivas se agregan a `actionText` y la transcripción provisional se ve en vivo en el textarea. Sin cambios de backend.

**Tech Stack:** Vue 3 (`<script setup>`, Composition API), Web Speech API (`webkitSpeechRecognition`), Vite.

## Global Constraints

- Sin cambios en el backend.
- Sin dependencias nuevas (Web Speech API es nativa del navegador).
- Tope de la acción: **280 caracteres** (igual que hoy).
- Idioma de reconocimiento: `es-ES`.
- Degradación elegante: si el navegador no soporta la API, el botón 🎤 **no se renderiza**.
- Verificación por **checklist manual** (el frontend no tiene runner de tests; Vitest se difiere).
- Seguir el estilo existente de `StoryInput.vue` (botones tipo `.clear-btn`, área táctil ≥44px en móvil).

---

### Task 1: Composable `useSpeechToText`

**Files:**
- Create: `frontend/src/composables/useSpeechToText.js`

**Interfaces:**
- Consumes: nada (solo Vue + Web Speech API del navegador).
- Produces:
  - `useSpeechToText({ lang?: string, onFinal?: (text: string) => void }) => { isSupported: boolean, isListening: Ref<boolean>, interimText: Ref<string>, error: Ref<string|null>, start: () => void, stop: () => void, toggle: () => void }`
  - `onFinal` se invoca con cada frase **definitiva** (ya `.trim()`).

- [ ] **Step 1: Crear el composable con todo el state machine**

Create `frontend/src/composables/useSpeechToText.js`:

```js
import { ref, shallowRef, onUnmounted } from 'vue'

// Detección de soporte una sola vez al cargar el módulo
const SpeechRecognitionImpl =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : undefined

export function useSpeechToText({ lang = 'es-ES', onFinal } = {}) {
  const isSupported = !!SpeechRecognitionImpl
  const isListening = ref(false)
  const interimText = ref('')
  const error = ref(null)

  const recognition = shallowRef(null)
  // "Intención" del usuario: en iOS/Safari el reconocimiento corta tras cada
  // pausa; mientras esta bandera sea true, lo reiniciamos en onend.
  let wantsToListen = false

  const resolveLang = () => {
    if (lang) return lang
    const navLang = typeof navigator !== 'undefined' ? navigator.language : ''
    return navLang && navLang.toLowerCase().startsWith('es') ? navLang : 'es-ES'
  }

  const createRecognition = () => {
    const rec = new SpeechRecognitionImpl()
    rec.lang = resolveLang()
    rec.continuous = true
    rec.interimResults = true

    rec.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const transcript = result[0].transcript
        if (result.isFinal) {
          const text = transcript.trim()
          if (text && typeof onFinal === 'function') onFinal(text)
        } else {
          interim += transcript
        }
      }
      interimText.value = interim
    }

    rec.onerror = (event) => {
      // no-speech / aborted son no-fatales: ignorar en silencio
      if (event.error === 'no-speech' || event.error === 'aborted') return
      error.value = event.error
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        wantsToListen = false
        isListening.value = false
      }
    }

    rec.onend = () => {
      interimText.value = ''
      if (wantsToListen) {
        // Auto-reinicio para Safari/iOS mientras el usuario quiera escuchar
        try {
          rec.start()
        } catch (e) {
          isListening.value = false
        }
      } else {
        isListening.value = false
      }
    }

    return rec
  }

  const start = () => {
    if (!isSupported || isListening.value) return
    error.value = null
    if (!recognition.value) recognition.value = createRecognition()
    wantsToListen = true
    try {
      recognition.value.start()
      isListening.value = true
    } catch (e) {
      // start() lanza si ya estaba iniciado: lo dejamos como no-listening
      isListening.value = false
    }
  }

  const stop = () => {
    wantsToListen = false
    interimText.value = ''
    isListening.value = false
    if (recognition.value) {
      try {
        recognition.value.stop()
      } catch (e) {
        /* no estaba iniciado */
      }
    }
  }

  const toggle = () => {
    if (isListening.value) stop()
    else start()
  }

  onUnmounted(() => {
    wantsToListen = false
    if (recognition.value) {
      try {
        recognition.value.abort()
      } catch (e) {
        /* noop */
      }
    }
  })

  return { isSupported, isListening, interimText, error, start, stop, toggle }
}
```

- [ ] **Step 2: Verificar que el build no rompe**

Run: `cd frontend && npx vite build`
Expected: build termina sin errores de sintaxis/parseo (genera `dist/`).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/composables/useSpeechToText.js
git commit -m "feat(voz): composable useSpeechToText con Web Speech API"
```

---

### Task 2: Botón de voz en `StoryInput.vue`

**Files:**
- Modify: `frontend/src/components/StoryInput.vue` (template `.input-controls`, `<script setup>`, `<style scoped>`)

**Interfaces:**
- Consumes: `useSpeechToText` de Task 1.
- Produces: nada para otras tareas (feature terminal de UI).

- [ ] **Step 1: Importar el composable y montar la lógica de voz en `<script setup>`**

En `frontend/src/components/StoryInput.vue`, después de `import { ref, computed, watch, nextTick } from 'vue'` (línea ~91), agregar:

```js
import { useSpeechToText } from '../composables/useSpeechToText.js'
```

Después de la definición de `errorMessage` (línea ~129), agregar:

```js
const MAX_LEN = 280

// Une dos fragmentos con un único espacio intermedio
const joinWithSpace = (base, addition) => {
  if (!base) return addition
  if (!addition) return base
  return base.endsWith(' ') ? base + addition : base + ' ' + addition
}

// Cada frase definitiva del dictado se agrega a la acción, respetando el tope
const appendFinal = (text) => {
  const next = joinWithSpace(actionText.value, text)
  actionText.value = next.length > MAX_LEN ? next.slice(0, MAX_LEN) : next
}

const {
  isSupported: voiceSupported,
  isListening,
  interimText,
  error: voiceError,
  toggle: toggleVoice,
  stop: stopVoice,
} = useSpeechToText({ lang: 'es-ES', onFinal: appendFinal })

// El micrófono se rige por las mismas reglas que el textarea
const micDisabled = computed(() => !props.isMyTurn || props.isSubmitting)

// Valor mostrado en el textarea: incluye la transcripción provisional en vivo
const displayValue = computed(() =>
  isListening.value && interimText.value
    ? joinWithSpace(actionText.value, interimText.value)
    : actionText.value
)

const onTextInput = (event) => {
  actionText.value = event.target.value
}

// Mensaje legible para los errores de voz relevantes
const voiceHint = computed(() => {
  if (!voiceError.value) return ''
  if (voiceError.value === 'not-allowed' || voiceError.value === 'service-not-allowed') {
    return 'Activa el permiso de micrófono para dictar'
  }
  if (voiceError.value === 'network') {
    return 'Sin conexión para el reconocimiento de voz'
  }
  return 'No se pudo usar el micrófono'
})
```

Y dentro del watcher existente que limpia el error al cambiar de turno (línea ~286-289), agregar el corte de la escucha. Reemplazar:

```js
// Clear error when turn changes
watch(() => props.isMyTurn, () => {
  errorMessage.value = ''
  emit('clear-error')
})
```

por:

```js
// Clear error and stop dictation when turn changes
watch(() => props.isMyTurn, (mine) => {
  errorMessage.value = ''
  voiceError.value = null
  emit('clear-error')
  if (!mine && isListening.value) stopVoice()
})
```

- [ ] **Step 2: Cambiar el textarea para mostrar la transcripción provisional**

En el template, reemplazar el binding del textarea (líneas ~29-42). Cambiar:

```html
        <textarea
          ref="actionInput"
          v-model="actionText"
          :placeholder="getPlaceholder()"
          :disabled="!props.isMyTurn || props.isSubmitting"
          @keydown.ctrl.enter="submitAction"
          @keydown.meta.enter="submitAction"
          class="action-textarea"
          maxlength="280"
          rows="3"
          autocapitalize="sentences"
          autocomplete="off"
          autocorrect="on"
        ></textarea>
```

por:

```html
        <textarea
          ref="actionInput"
          :value="displayValue"
          @input="onTextInput"
          :placeholder="getPlaceholder()"
          :disabled="!props.isMyTurn || props.isSubmitting"
          @keydown.ctrl.enter="submitAction"
          @keydown.meta.enter="submitAction"
          class="action-textarea"
          maxlength="280"
          rows="3"
          autocapitalize="sentences"
          autocomplete="off"
          autocorrect="on"
        ></textarea>
```

- [ ] **Step 3: Agregar el botón 🎤 y el indicador de escucha al template**

Reemplazar el bloque `.input-controls` (líneas ~44-68). Cambiar:

```html
        <div class="input-controls">
          <div class="char-counter" :class="{ warning: actionText.length > 250 }">
            {{ actionText.length }}/280
          </div>
          <div class="input-buttons">
            <button
              @click="clearInput"
              class="clear-btn"
              :disabled="!actionText.trim() || props.isSubmitting"
              title="Limpiar"
            >
              🗑️
            </button>
            <button
              @click="submitAction"
              class="submit-btn"
              :disabled="!canSubmit"
              :class="{ loading: props.isSubmitting }"
              title="Enviar acción (Ctrl+Enter)"
            >
              <span v-if="!props.isSubmitting">📤 Enviar</span>
              <span v-else class="loading-text">Generando...</span>
            </button>
          </div>
        </div>
```

por:

```html
        <div class="input-controls">
          <div class="counter-area">
            <div class="char-counter" :class="{ warning: actionText.length > 250 }">
              {{ actionText.length }}/280
            </div>
            <span v-if="isListening" class="listening-indicator">🎙️ Escuchando…</span>
          </div>
          <div class="input-buttons">
            <button
              v-if="voiceSupported"
              @click="toggleVoice"
              class="mic-btn"
              :class="{ listening: isListening }"
              :disabled="micDisabled"
              :title="isListening ? 'Detener dictado' : 'Dictar por voz'"
            >
              {{ isListening ? '🔴' : '🎤' }}
            </button>
            <button
              @click="clearInput"
              class="clear-btn"
              :disabled="!actionText.trim() || props.isSubmitting"
              title="Limpiar"
            >
              🗑️
            </button>
            <button
              @click="submitAction"
              class="submit-btn"
              :disabled="!canSubmit"
              :class="{ loading: props.isSubmitting }"
              title="Enviar acción (Ctrl+Enter)"
            >
              <span v-if="!props.isSubmitting">📤 Enviar</span>
              <span v-else class="loading-text">Generando...</span>
            </button>
          </div>
        </div>
```

- [ ] **Step 4: Agregar el aviso de error de voz al template**

Justo después del bloque `error-message` existente (línea ~83-86, el `<div v-if="errorMessage" ...>`), agregar:

```html
    <!-- Voice hint -->
    <div v-if="voiceHint" class="voice-hint">
      <div class="error-icon">🎤</div>
      <span>{{ voiceHint }}</span>
    </div>
```

- [ ] **Step 5: Agregar estilos del micrófono e indicadores**

En el `<style scoped>`, después del bloque `.clear-btn { ... }` (después de la línea ~474), agregar:

```css
.mic-btn {
  background: rgba(155, 89, 182, 0.2);
  color: #9b59b6;
  border: 1px solid rgba(155, 89, 182, 0.3);
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9em;
  transition: all 0.3s ease;
}

.mic-btn:hover:not(:disabled) {
  background: rgba(155, 89, 182, 0.3);
  border-color: rgba(155, 89, 182, 0.5);
}

.mic-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.mic-btn.listening {
  background: rgba(231, 76, 60, 0.25);
  color: #e74c3c;
  border-color: rgba(231, 76, 60, 0.6);
  animation: pulse 1.2s infinite;
}

.counter-area {
  display: flex;
  align-items: center;
  gap: 10px;
}

.listening-indicator {
  font-size: 0.85em;
  color: #e74c3c;
  font-weight: bold;
  animation: pulse 1.2s infinite;
}

.voice-hint {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(155, 89, 182, 0.1);
  border: 1px solid rgba(155, 89, 182, 0.3);
  border-radius: 6px;
  padding: 12px;
  margin-top: 15px;
  color: #c39bd3;
  font-size: 0.9em;
}
```

Y dentro del `@media (max-width: 768px)`, después del bloque `.submit-btn { ... }` (después de la línea ~610), agregar el área táctil del micrófono:

```css
  .mic-btn {
    min-height: 44px;
    min-width: 44px;
    padding: 10px 14px;
    font-size: 1em;
  }
```

- [ ] **Step 6: Verificar que el build no rompe**

Run: `cd frontend && npx vite build`
Expected: build termina sin errores.

- [ ] **Step 7: QA manual (checklist por dispositivo)**

Con `yarn dev` (front) + backend corriendo, abrir una sesión y, en tu turno:
- [ ] Android/Chrome: tocar 🎤 → hablar → ver texto provisional en vivo → se fija al parar → editar → 📤 Enviar.
- [ ] iPhone/Safari: dictar con pausas → el dictado sigue (auto-reinicio) hasta tocar 🔴.
- [ ] PC/Chrome o Edge: idem + **negar el permiso** del micro → aparece "Activa el permiso de micrófono para dictar".
- [ ] Firefox (sin soporte): el botón 🎤 **no aparece**; el textarea funciona normal.
- [ ] Estando fuera de turno → el botón 🎤 está deshabilitado; si pierdes el turno mientras dictas, la escucha se corta.
- [ ] Dictar hasta pasar 280 → deja de agregar; el contador se pone naranja.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/StoryInput.vue
git commit -m "feat(voz): boton de dictado por voz en StoryInput"
```

---

## Self-Review

**1. Spec coverage:**
- Composable aislado + botón → Task 1 + Task 2. ✅
- Flujo "llenar y revisar" (sin auto-envío) → `appendFinal` llena `actionText`; el envío sigue siendo manual. ✅
- Agregar texto (no reemplazar) → `joinWithSpace`. ✅
- Tope 280 → `appendFinal` recorta. ✅
- Gating por turno + ocultar si no hay soporte → `micDisabled`, `v-if="voiceSupported"`. ✅
- Corte al perder turno → watcher de `isMyTurn`. ✅
- Auto-reinicio iOS → `onend` + `wantsToListen`. ✅
- Errores (permiso, red, no-speech) → `onerror` + `voiceHint`. ✅
- Texto provisional en vivo en el textarea → `displayValue` + `:value`/`@input`. ✅
- QA manual por dispositivo → Task 2 Step 7. ✅

**2. Placeholder scan:** sin TBD/TODO; todo el código está completo. ✅

**3. Type consistency:** `useSpeechToText` devuelve exactamente `{ isSupported, isListening, interimText, error, start, stop, toggle }`; en Task 2 se consumen `isSupported`→`voiceSupported`, `isListening`, `interimText`, `error`→`voiceError`, `toggle`→`toggleVoice`, `stop`→`stopVoice`. `joinWithSpace` se usa igual en composable-consumer y en `displayValue`. ✅
