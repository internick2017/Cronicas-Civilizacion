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
