// Constants for game rules extracted from legacy system
// All values are balance parameters for the turn-based civilization map mode

export const TERRENOS = ['plains', 'forest', 'mountains', 'desert', 'water', 'hills'];

export const RECURSOS = ['food', 'gold', 'wood', 'stone', 'science', 'culture'];

export const RECURSOS_DE_TILE = ['food', 'gold', 'wood', 'stone'];

export const RECURSOS_INICIALES = {
  food: 100,
  gold: 50,
  wood: 80,
  stone: 30,
  science: 0,
  culture: 0
};

export const COSTO_CIUDAD = {
  food: 50,
  wood: 30,
  stone: 20
};

export const EDIFICIOS = {
  granary: {
    costo: { food: 30, wood: 20 },
    produccion: { food: 3 }
  },
  market: {
    costo: { gold: 50, wood: 30 },
    produccion: { gold: 5 }
  },
  // La biblioteca costaba 20 de ciencia, pero la ciencia empieza en 0 y su UNICA
  // fuente es la propia biblioteca: era imposible de construir en toda partida.
  // Ahora cuesta solo materiales, asi que la ciencia pasa a ser algo que se
  // genera y nunca un requisito previo para generarla.
  library: {
    costo: { wood: 20, stone: 40 },
    produccion: { science: 3 }
  },
  // Aserradero y cantera son la salida al callejon sin salida de la economia:
  // hasta ahora madera y piedra SOLO entraban si habias fundado sobre bosque o
  // montaña, y si no, tu ingreso era cero para siempre y no podias expandirte.
  // Ninguno de los dos cuesta el recurso que produce, y los dos se pagan sobre
  // todo con oro, que toda ciudad genera: asi no se repite el candado de la
  // biblioteca, donde hacia falta el recurso para poder producirlo.
  sawmill: {
    costo: { food: 20, gold: 40 },
    produccion: { wood: 3 }
  },
  quarry: {
    costo: { food: 20, gold: 50 },
    produccion: { stone: 2 }
  },
  // Antes el cuartel SOLO desbloqueaba reclutar caballeria/catapulta: era el
  // unico edificio sin ningun efecto propio (produccion: {}). Ahora, ademas
  // de eso, la ciudad donde esta construido cura a la tropa que para ahi,
  // se defiende mejor, y lo que reclutes ahi sale mas barato y con mas
  // movimiento (ver CUARTEL mas abajo, junto a EDIFICIOS a proposito: son
  // valores del MISMO edificio, no una regla de combate/reclutamiento aparte).
  barracks: {
    costo: { gold: 40, stone: 30 },
    produccion: {}
  },
  // Desbloqueada por la tecnologia 'filosofia' (ver TECNOLOGIAS): la ciencia
  // pasa a alimentarse sola, igual que el teatro hace con la cultura.
  university: {
    costo: { gold: 70, stone: 40 },
    produccion: { science: 4 },
    requiereTecnologia: 'filosofia'
  }
};

export const UNIDADES = {
  warrior: {
    ataque: 10,
    defensa: 8,
    salud: 100,
    movimiento: 2,
    costo: { food: 20, gold: 30, wood: 10 },
    requiereBarracks: false
  },
  archer: {
    ataque: 15,
    defensa: 5,
    salud: 80,
    movimiento: 2,
    costo: { food: 15, gold: 25, wood: 15 },
    requiereBarracks: false
  },
  spearman: {
    ataque: 12,
    defensa: 15,
    salud: 90,
    movimiento: 2,
    costo: { food: 18, gold: 20, wood: 12 },
    requiereBarracks: false
  },
  cavalry: {
    ataque: 20,
    defensa: 12,
    salud: 120,
    movimiento: 3,
    costo: { food: 25, gold: 40, wood: 5 },
    requiereBarracks: true
  },
  catapult: {
    ataque: 25,
    defensa: 3,
    salud: 60,
    movimiento: 1,
    costo: { food: 10, gold: 50, wood: 30, stone: 20 },
    requiereBarracks: true
  },
  // Desbloqueada por la tecnologia 'formacionMilitar' (ver TECNOLOGIAS), no
  // por un cuartel: infanteria pesada, entre el guerrero y la caballeria.
  legionary: {
    ataque: 16,
    defensa: 18,
    salud: 110,
    movimiento: 2,
    costo: { food: 22, gold: 35, wood: 15 },
    requiereBarracks: false,
    requiereTecnologia: 'formacionMilitar'
  }
};

// Efectos propios del cuartel (ver el comentario junto a EDIFICIOS.barracks):
// hasta ahora era el unico edificio sin ninguno.
export const CUARTEL = {
  curacionPorRonda: 15,   // vida que recupera una tropa parada ahi, al cerrar la ronda
  bonoDefensaCiudad: 3,   // suma PLANA a defensaCiudad(nivel) al defenderse
  descuentoReclutar: 0.15, // 15% menos en el costo de lo reclutado ahi
  bonoMovimiento: 1       // punto de movimiento extra para lo reclutado ahi
};

export const BONO_TERRENO_PRODUCCION = {
  plains: { food: 2, gold: 1 },
  forest: { wood: 3, food: 1 },
  mountains: { stone: 4, gold: 2 },
  hills: { stone: 2, gold: 1, food: 1 },
  desert: { gold: 1 },
  water: {}
};

// --- Rasgos culturales ---------------------------------------------------
// La cultura se producia (+2 por ciudad) y no se gastaba en NADA: era un
// contador decorativo. Ahora se cambia por rasgos que la civilizacion adopta
// una sola vez y conserva para siempre. Son acumulativos: se pueden tener
// todos, y el costo creciente marca el orden en que conviene tomarlos.
// Cada rasgo le da ademas material propio al narrador, que es donde este
// juego se diferencia de un juego de estrategia cualquiera.
export const RASGOS_CULTURALES = {
  gastronomia: {
    nombre: 'Gastronomía',
    costo: 30,
    descripcion: 'Vuestra cocina alimenta mejor a cada ciudad.',
    produccionCiudad: { food: 2 }
  },
  idioma: {
    nombre: 'Idioma propio',
    costo: 40,
    descripcion: 'Vuestras palabras viajan lejos: se explora mas terreno de una vez.',
    visionExtra: 1
  },
  teatro: {
    nombre: 'Teatro',
    costo: 50,
    descripcion: 'Las plazas se llenan y la cultura alimenta mas cultura.',
    produccionCiudad: { culture: 1 }
  },
  arte: {
    nombre: 'Arte',
    costo: 60,
    descripcion: 'Una ciudad que se ama a si misma se defiende mejor.',
    bonoDefensaCiudad: 0.25
  }
};

// --- Tecnologias -----------------------------------------------------------
// La ciencia tenia el mismo problema que tenia la cultura antes de los
// rasgos: se producia (biblioteca, +3/turno) y no se gastaba en NADA. Mismo
// patron que RASGOS_CULTURALES: independientes (sin arbolito de requisitos
// entre ellas), se compran una sola vez y valen para siempre, acumulables.
// Ademas de estas, la ciencia habilita subir el NIVEL de una ciudad (ver
// COSTO_MEJORA_CIUDAD mas abajo): eso es una accion repetible por ciudad,
// no una tecnologia global, asi que vive aparte.
export const TECNOLOGIAS = {
  metalurgia: {
    nombre: 'Metalurgia',
    costo: { science: 40 },
    descripcion: 'Mejores armas: +2 de ataque para todas tus unidades.',
    bonoAtaqueUnidades: 2
  },
  fortificacion: {
    nombre: 'Fortificación',
    costo: { science: 40 },
    descripcion: 'Mejores corazas: +2 de defensa para todas tus unidades.',
    bonoDefensaUnidades: 2
  },
  irrigacion: {
    nombre: 'Irrigación',
    costo: { science: 35 },
    descripcion: '+20% de producción de comida en todas tus ciudades.',
    produccionPorcentual: { food: 0.2 }
  },
  mineria: {
    nombre: 'Minería',
    costo: { science: 35 },
    descripcion: '+20% de producción de oro en todas tus ciudades.',
    produccionPorcentual: { gold: 0.2 }
  },
  formacionMilitar: {
    nombre: 'Formación militar',
    costo: { science: 45 },
    descripcion: 'Desbloquea al legionario: infantería pesada, sin necesitar cuartel.',
    desbloqueaUnidad: 'legionary'
  },
  filosofia: {
    nombre: 'Filosofía',
    costo: { science: 60 },
    descripcion: 'Desbloquea la universidad: la ciencia empieza a alimentarse sola.',
    desbloqueaEdificio: 'university'
  }
};

export const BONO_TERRENO_DEFENSA = {
  mountains: 1.25,
  hills: 1.25,
  forest: 1.1
};

export const PRODUCCION_BASE_CIUDAD = {
  food: 5,
  gold: 3,
  culture: 2,
  // La ciencia rinde desde la primera ciudad, igual que la cultura. Antes era
  // 0 y su UNICA fuente era la biblioteca, que cuesta 40 de piedra: el mismo
  // recurso que se come fundar (20 por ciudad), asi que la ciencia siempre
  // perdia la carrera contra la expansion. Medido: 8 de 9 partidas de 40
  // turnos terminaban con CERO ciencia y cero tecnologias, o sea que media
  // rama del juego no existia en una partida normal.
  //
  // +1 y no +2 como la cultura a proposito: la biblioteca produce +3, asi que
  // construirla cuadruplica la ciencia de esa ciudad y sigue siendo una
  // decision que vale la pena. Con +2 solo la duplicaria.
  science: 2
};

export const PORCENTAJE_VICTORIA_DOMINACION = 0.6;

// A partir de que porcentaje se le avisa al resto que un rival se esta volviendo
// peligroso (ver reglas/dominacion.js#rivalesDominantes). Esta por debajo del
// umbral de victoria a proposito: el aviso tiene que llegar con tiempo de
// reaccionar, no cuando la partida ya esta decidida.
export const UMBRAL_AVISO_DOMINACION = 0.4;

// Cantidad minima de jugadores para poder iniciar una partida (ver
// reglas/partida.js#iniciar). Vive aca, junto al resto de las constantes
// publicas del juego, para que el frontend pueda leerla de /api/map/constantes
// en vez de tener que adivinarla o copiarla a mano.
export const MIN_JUGADORES = 2;

// Niveles del jugador-bot (ver domain/mapa/ia.js). Viven aca, junto al resto
// de las constantes publicas, porque tanto la vista (que informa que
// dificultad tiene el rival) como el propio modulo de IA los necesitan, y
// esto evita que uno dependa del otro.
export const DIFICULTADES_IA = ['facil', 'normal', 'dificil'];
export const DIFICULTAD_IA_DEFAULT = 'normal';

export const BONO_DEFENSA_CIUDAD = 1.5;

// --- Combate -------------------------------------------------------------
// Antes el ganador salia INTACTO y el perdedor se llevaba todo el dano. Eso
// convertia cada ataque en una moneda al aire y borraba el desgaste, que es
// justamente lo que hace interesante decidir CUANDO pelear: una unidad fuerte
// podia encadenar peleas sin consecuencia.
// Ahora los dos se hacen dano segun su peso en el combate, y el golpe del
// perdedor vale la mitad, para que atacar siga valiendo la pena.
export const DANO_COMBATE = 50;
export const FACTOR_REPLICA = 0.5;
export const DANO_MINIMO = 10;   // piso del golpe del ganador
export const REPLICA_MINIMA = 3; // hasta la derrota mas aplastante araña algo

// Helper functions for terrain and city defense bonuses
export const bonoDefensa = (terreno) => BONO_TERRENO_DEFENSA[terreno] ?? 1.0;

export const defensaCiudad = (nivel) => 8 + 2 * nivel;

// Mejorar el nivel de una ciudad es repetible (a diferencia de una
// tecnologia): cada nivel cuesta mas que el anterior, y el beneficio ya
// existia de antes sin usarse — defensaCiudad(nivel) escala con esto desde
// el principio, solo que nada permitia subir `nivel` mas alla de 1.
export const COSTO_MEJORA_CIUDAD = (nivel) => ({ science: 15 * nivel, gold: 10 * nivel });
