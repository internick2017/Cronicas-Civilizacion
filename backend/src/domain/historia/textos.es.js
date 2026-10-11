// Frases del narrador local en espanol. Los huecos entre llaves los rellena narradorHistoria.js:
// {n} personaje, {frase} lo que escribio el jugador, y del genero: {lugar} {hallazgo} {peligro} {final}.
export const TEXTOS_ES = {
  conectores: ['Mientras tanto,', 'Al mismo tiempo,', 'Poco después,'],
  intencion: ['{n} decide: «{frase}».', '{n} se atreve: «{frase}».', '{n} propone: «{frase}».'],
  consecuencias: {
    atacar: [
      'El movimiento de {n} es rápido y certero, y la escena se llena de tensión.',
      '{n} no duda: el impacto resuena con fuerza y obliga a todos a reaccionar.',
      'La embestida de {n} abre un hueco y cambia el ritmo de todo lo que sucede.',
    ],
    hablar: [
      'Las palabras de {n} se oyen con claridad y alguien cerca baja la guardia.',
      'Tras hablar {n}, el silencio se vuelve pesado, hasta que llega una respuesta inesperada.',
      'La voz de {n} despierta curiosidad y todas las miradas se vuelven hacia allí.',
    ],
    explorar: [
      'Entre las sombras, {n} descubre {hallazgo}.',
      'Con paso atento, {n} encuentra {hallazgo}.',
      'La búsqueda de {n} da frutos: ante todos aparece {hallazgo}.',
    ],
    huir: [
      'Con un movimiento ágil, {n} gana distancia y deja atrás lo peor.',
      '{n} se escabulle justo a tiempo, aunque el eco de la persecución sigue cerca.',
      'El plan de {n} funciona, pero deja una pista que alguien podría seguir.',
    ],
    usar: [
      'Con manos seguras, {n} logra lo que buscaba y algo cambia a su alrededor.',
      '{n} lo consigue, y enseguida aparece {hallazgo}.',
      'El gesto de {n} activa algo que nadie había previsto.',
    ],
    ayudar: [
      'El gesto de {n} da ánimo al grupo, que recupera fuerzas.',
      '{n} cuida de los demás, y la confianza entre todos crece.',
      'Gracias a {n}, el grupo respira con alivio y sigue adelante.',
    ],
    otro: [
      'La decisión de {n} deja huella, y el mundo parece responder.',
      'Lo que hace {n} cambia el rumbo de la escena, aunque aún no se sabe hasta dónde.',
      'El camino de {n} se cruza con un detalle inquietante que nadie esperaba.',
    ],
  },
  recuerdo: [
    'Lo que {n} intentó antes («{frase}») todavía se siente en el ambiente.',
    'Nadie olvida que {n} había dicho antes: «{frase}».',
  ],
  cierre: [
    'El final se acerca, y cada decisión pesa más que nunca.',
    'Todo apunta a un desenlace cercano: es hora de cerrar lo que quedó abierto.',
  ],
  ultimaRonda: 'Es la última ronda: el desenlace está al alcance de todos.',
  invitacion: [
    '¿Qué hará cada quien a continuación?',
    'La historia queda abierta: la próxima jugada es de ustedes.',
    'El camino sigue abierto, ¿qué decidirán ahora?',
  ],
  ganchoGlobal: [
    'De pronto, {peligro}. Nadie puede quedarse quieto.',
    'De pronto, {peligro}, y todos sienten que el tiempo se acaba.',
  ],
  ganchoDirigido: [
    'De pronto, {peligro}, y todas las miradas se vuelven hacia {n}: ¿qué hará?',
    'De pronto, {peligro}. {n} es quien está más cerca, ¿cómo reaccionará?',
  ],
  apertura: 'Todo comienza en {lugar}. Allí se reúnen {nombres}, sin sospechar que algo está por cambiar.',
  aperturaColaborativa: 'La historia es de ustedes: ¿quién da el primer paso?',
  aperturaGancho: 'De pronto, {peligro}. Es hora de actuar.',
  epilogoInicio: 'Así llega el final de esta historia.',
  epilogoRecuerdo: ['Se recordará que {n} dijo: «{frase}».', 'Nadie olvidará cuando {n} propuso: «{frase}».'],
  epilogoCierre: 'Y así, {final}.',
  sinAcciones: 'Nadie se atreve a moverse todavía, y el mundo espera en silencio.',
  companero: {
    nombre: 'La Máquina',
    personajes: ['Chispa', 'Pícaro', 'Rufián', 'Travieso'],
    // Siempre un lio, y siempre con un verbo que clasificarAccion reconoce (para que el narrador le
    // dé una consecuencia a medida). Las que traen {otro} se meten con un companero por su nombre.
    acciones: [
      'Golpeo {objeto} para ver qué pasa',
      'Empujo {objeto} sin pensarlo dos veces',
      'Grito que {otro} sabe más de lo que dice',
      'Entro por donde nadie se atreve a entrar',
      'Me escondo con {objeto} y dejo que {otro} dé la cara',
      'Tomo {objeto} de las manos de {otro}',
      'Le digo a todos que tengo un plan, aunque es mentira',
      'Abro {objeto} aunque dijeron que no',
      'Lanzo {objeto} contra la primera sombra que veo',
      'Salgo corriendo con {objeto} bajo el brazo',
      'Pido a gritos que todos sigan a {otro}',
      'Ataco sin avisar a quien se me cruce',
      'Activo {objeto} aunque nadie me lo mandó',
      'Lanzo {objeto} hacia {otro}',
    ],
  },
  union: ' y ',
  generos: {
    fantasy: {
      lugar: ['un valle entre montañas donde la niebla huele a magia antigua', 'las ruinas de una torre élfica cubiertas de enredaderas luminosas', 'una aldea junto al bosque donde los faroles se encienden solos'],
      hallazgo: ['una runa antigua que late con luz tenue', 'un cofre de piedra grabado con símbolos olvidados', 'un sendero oculto que brilla bajo las raíces'],
      peligro: ['un rugido sacude las montañas', 'una sombra con alas cubre el cielo', 'un grupo de encapuchados bloquea el camino'],
      objeto: ['la runa antigua', 'el cofre de piedra', 'la puerta encantada'],
      final: ['el reino respira por fin en paz y los bardos ya cantan lo ocurrido', 'las runas se apagan una a una y el valle queda en calma', 'la niebla se disipa y deja ver un amanecer nuevo para todos'],
    },
    historical: {
      lugar: ['una ciudad amurallada en vísperas de una gran feria', 'un puerto bullicioso donde atracan barcos de tierras lejanas', 'un campamento junto a un río, con tiendas y estandartes al viento'],
      hallazgo: ['un pergamino sellado con cera roja', 'un mapa antiguo con una ruta marcada a mano', 'una carta olvidada que cambia lo que creían saber'],
      peligro: ['se oye el redoble de tambores de un ejército que se acerca', 'corren rumores de traición en el consejo', 'una tormenta amenaza con arruinar las cosechas'],
      objeto: ['el sello del consejo', 'el barril de pólvora', 'la bandera enemiga'],
      final: ['la historia escribe sus nombres entre los de quienes cambiaron su tiempo', 'los cronistas anotan lo ocurrido y el pueblo lo repetirá por generaciones', 'la paz llega por fin y las campanas anuncian una nueva época'],
    },
    'sci-fi': {
      lugar: ['una estación espacial en órbita, con luces tenues y pasillos metálicos', 'una nave a la deriva cerca de una nebulosa violeta', 'una colonia en un planeta lejano bajo dos lunas'],
      hallazgo: ['una señal cifrada en la consola principal', 'un módulo de datos que nadie había registrado', 'una puerta sellada que se abre al reconocer sus voces'],
      peligro: ['una alarma de proximidad se enciende en rojo', 'una falla en el reactor apaga las luces de a poco', 'una flota desconocida sale del hiperespacio'],
      objeto: ['la palanca roja', 'el panel de control', 'la cápsula de emergencia'],
      final: ['los sistemas vuelven a la normalidad y las estrellas parecen más cercanas', 'el último informe de la misión queda a salvo en el archivo central', 'la nave pone rumbo a casa con la misión cumplida'],
    },
    mystery: {
      lugar: ['una mansión antigua donde un reloj se detuvo a medianoche', 'un pueblo costero envuelto en niebla, con las ventanas cerradas', 'un teatro vacío donde todavía queda una luz encendida'],
      hallazgo: ['una huella de barro que no encaja con nadie', 'una nota escrita con tinta todavía fresca', 'un cajón con doble fondo y un nombre tachado'],
      peligro: ['unos pasos se detienen justo detrás de ellos', 'una luz se apaga y deja la sala a oscuras', 'un testigo cambia su versión a último momento'],
      objeto: ['el cuadro torcido', 'la caja fuerte', 'el reloj detenido'],
      final: ['la última pieza encaja y el misterio queda por fin resuelto', 'la verdad sale a la luz y nadie vuelve a mirar la mansión igual', 'el culpable queda al descubierto y el pueblo respira aliviado'],
    },
    'sports-sim': {
      lugar: ['un estadio lleno hasta el último asiento antes del partido decisivo', 'un vestuario donde el equipo se concentra antes de salir a la cancha', 'un torneo de verano con las gradas llenas de banderas'],
      hallazgo: ['una jugada ensayada que sorprende a los rivales', 'un hueco en la defensa que nadie había visto', 'un aliado inesperado que sube la energía del equipo'],
      peligro: ['un rival sube el ritmo en los minutos finales', 'una lesión obliga a cambiar el plan', 'una decisión polémica del árbitro cambia el rumbo'],
      objeto: ['el balón del rival', 'el silbato del árbitro', 'la pizarra del entrenador'],
      final: ['el pitazo final suena y el estadio entero se pone de pie', 'el trofeo brilla en alto mientras el equipo celebra junto', 'la temporada termina entre aplausos y un recuerdo que nadie olvidará'],
    },
  },
};
