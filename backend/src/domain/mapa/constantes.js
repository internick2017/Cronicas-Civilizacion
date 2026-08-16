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
  barracks: {
    costo: { gold: 40, stone: 30 },
    produccion: {}
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
  }
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

export const BONO_TERRENO_DEFENSA = {
  mountains: 1.25,
  hills: 1.25,
  forest: 1.1
};

export const PRODUCCION_BASE_CIUDAD = {
  food: 5,
  gold: 3,
  culture: 2
};

export const PORCENTAJE_VICTORIA_DOMINACION = 0.6;

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
