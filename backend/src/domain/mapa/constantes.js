// Constants for game rules extracted from legacy system
// All values are balance parameters for the turn-based civilization map mode

// 'water' es el MAR: se navega y no se camina. 'river' es el rio: se camina
// (vadeandolo) y no se navega. Eran un solo terreno hasta ahora, y separarlos
// es lo que permite que el mar exista como frente propio sin que una flota
// pueda meterse hasta el centro de un continente por un arroyo de una casilla.
// Ver docs/adr/0001-mar-y-rio-son-terrenos-distintos.md.
//
// Importante para quien agregue reglas: media docena de lugares del dominio y
// de la IA preguntan `terreno !== 'water'` para decir "es tierra". El rio cae
// del lado correcto en TODOS ellos sin tocarlos, justamente porque es un
// terreno propio y no una bandera sobre el agua.
export const TERRENOS = ['plains', 'forest', 'mountains', 'desert', 'water', 'hills', 'river'];

export const RECURSOS = ['food', 'gold', 'wood', 'stone', 'science', 'culture'];

export const RECURSOS_DE_TILE = ['food', 'gold', 'wood', 'stone'];

// Los dos recursos que se apagan con las mecanicas Ciencia y Cultura (config.mecanicas):
// apagados, no se producen ni se gastan.
export const RECURSOS_CIVILES = ['science', 'culture'];

// Las mecanicas que se eligen al crear la partida (config.mecanicas). Todas prendidas por defecto.
export const MECANICAS = ['ciencia', 'cultura', 'armada', 'alianzas', 'moneda', 'capital', 'gobierno'];

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
  },
  // La llave de la armada, y la unica condicion ademas de estar en la costa:
  // NO hace falta ninguna tecnologia. Eso es deliberado y esta razonado en
  // docs/adr/0003: para tener un buque ya hacen falta dos cosas (ciudad
  // costera + puerto), y una tercera repetiria el error de la biblioteca, que
  // era imposible de construir en toda la partida. El riesgo que se evita no
  // es que la armada quede desbalanceada, es que no aparezca NUNCA.
  //
  // No es solo una llave: produce oro por comercio maritimo, para que valga la
  // pena incluso antes de que el mar importe, y cura buques en el mar contiguo
  // (ver PUERTO). El cuartel ya habia ensenado que un edificio que solo
  // desbloquea es un edificio a medias.
  port: {
    costo: { wood: 40, stone: 30 },
    produccion: { gold: 3 },
    requiereCosta: true
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
  },
  // El unico buque del juego. `naval: true` es lo que lo ata al mar: no puede
  // pisar tierra en ninguna circunstancia, y ninguna unidad de tierra puede
  // pisar el mar (ver reglas/movimiento.js).
  //
  // Los numeros dicen "hostiga, no domina", que es la decision de diseno (ver
  // docs/adr/0003-la-armada-hostiga-no-conquista.md): pega casi como una
  // caballeria (20), se muere mas facil que un arquero (80 de salud) y corre
  // mas que nada en el juego. Y hay algo que lo hace estructuralmente fragil y
  // no se ve en esta tabla: BONO_TERRENO_DEFENSA no tiene entrada para el mar,
  // asi que un buque pelea SIEMPRE sin cobertura, mientras la tropa de tierra
  // se parapeta en montana o bosque. El movimiento 4 no encadena ataques:
  // atacar deja el movimiento en cero (ver aplicar.js).
  //
  // El costo va cargado a madera para que armar flota compita de verdad contra
  // construir, y sin piedra, que ya se la pelean el puerto, la biblioteca y la
  // cantera.
  warship: {
    ataque: 18,
    defensa: 6,
    salud: 70,
    movimiento: 4,
    costo: { wood: 50, gold: 40, food: 10 },
    requiereBarracks: false,
    naval: true,
    requierePuerto: true
  },
  // El transporte: la unica unidad del juego que NO PUEDE ATACAR (ataque 0), y
  // el unico lugar donde eso es una virtud. Sin escolta es carne, y por eso
  // llevar tropa a otra isla es una decision con riesgo en vez de un tramite.
  //
  // Es una unidad aparte y no "el buque de guerra que ademas carga": si el
  // mismo casco peleara y transportara, cada combate naval podria ahogar un
  // ejercito, y la maquina en dificultad normal tiene UN solo buque, asi que
  // tendria que elegir entre pelear y hacer de ferry.
  //
  // Movimiento 3 y no 4: el buque de guerra es mas rapido, asi que puede
  // escoltarlo y adelantarse.
  transport: {
    ataque: 0,
    defensa: 4,
    salud: 60,
    movimiento: 3,
    costo: { wood: 35, gold: 25, food: 10 },
    requiereBarracks: false,
    naval: true,
    requierePuerto: true,
    capacidad: 2
  }
};

// Cuanta tropa puede llevar adentro. Cero para todo lo que no sea transporte.
export const CAPACIDAD_DE = (tipo) => UNIDADES[tipo]?.capacidad ?? 0;
export const esTransporte = (tipo) => CAPACIDAD_DE(tipo) > 0;
// Hay unidades que solo se defienden. Se pregunta por el ataque y no por una
// bandera aparte para que no puedan desincronizarse: si algo tiene ataque 0,
// no hay combate que pueda ganar, asi que ofrecerlo seria mentir.
export const puedeAtacar = (tipo) => (UNIDADES[tipo]?.ataque ?? 0) > 0;

// Una unidad naval vive en el mar y solo en el mar. Se pregunta por el tipo y
// no por un campo del ejercito para que la respuesta salga siempre de la misma
// tabla, y no de lo que alguien haya guardado en un tile.
export const esNaval = (tipo) => UNIDADES[tipo]?.naval === true;

// Efectos propios del cuartel (ver el comentario junto a EDIFICIOS.barracks):
// hasta ahora era el unico edificio sin ninguno.
export const CUARTEL = {
  curacionPorRonda: 15,   // vida que recupera una tropa parada ahi, al cerrar la ronda
  bonoDefensaCiudad: 3,   // suma PLANA a defensaCiudad(nivel) al defenderse
  descuentoReclutar: 0.15, // 15% menos en el costo de lo reclutado ahi
  bonoMovimiento: 1       // punto de movimiento extra para lo reclutado ahi
};

// Efectos propios del puerto, igual que CUARTEL lo es del cuartel.
//
// La curacion es EL MISMO numero que CUARTEL.curacionPorRonda a proposito: el
// astillero es el espejo del cuartel (uno cura tropa parada en la ciudad, el
// otro cura buques en el mar contiguo) y no merece una constante distinta para
// decir lo mismo. Si algun dia se separan, que sea por una razon medida.
export const PUERTO = {
  curacionPorRonda: 15
};

// Saqueo: lo que un buque le roba a una ciudad costera cuando la vence y no
// puede tomarla (ver docs/adr/0003). Es proporcional con piso y techo, que es
// el mismo patron que ya usa el dano de combate (DANO_MINIMO / REPLICA_MINIMA
// sobre un reparto proporcional).
//
// Una cantidad fija seria irrelevante contra un jugador rico y brutal contra
// uno pobre; un porcentaje puro convertiria a quien acumula oro en un premio
// cada vez mas grande por no gastarlo.
//
// Ademas del oro, la ciudad saqueada deja de producir `rondasSinProduccion`
// rondas. El oro depende de lo que la victima tenga en la mano (contra un bot
// que gasta todo es cero), asi que el golpe que no depende de eso es este.
// Ver docs/superpowers/specs/2026-10-10-saqueo-asedia-la-ciudad-design.md.
export const SAQUEO = {
  fraccion: 0.10,
  minimo: 5,
  maximo: 25,
  rondasSinProduccion: 2
};

export const BONO_TERRENO_PRODUCCION = {
  plains: { food: 2, gold: 1 },
  forest: { wood: 3, food: 1 },
  mountains: { stone: 4, gold: 2 },
  hills: { stone: 2, gold: 1, food: 1 },
  desert: { gold: 1 },
  water: {},
  // El rio es tierra fertil: da comida y nada mas. Junto con su penalidad de
  // defensa (ver BONO_TERRENO_DEFENSA) hace que fundar sobre un rio sea una
  // decision y no un accidente del terreno: comes mejor y te defendes peor.
  river: { food: 2 }
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
  },
  creenciasYReligion: {
    nombre: 'Creencias y religión',
    costo: 35,
    descripcion: 'La fe sostiene a la comunidad: cada ciudad rinde mas comida.',
    produccionCiudad: { food: 1 }
  },
  valoresYNormas: {
    nombre: 'Valores y normas',
    costo: 45,
    descripcion: 'Reglas claras organizan mejor la defensa de cada ciudad.',
    bonoDefensaCiudad: 0.15
  },
  organizacionSocial: {
    nombre: 'Organización social',
    costo: 40,
    descripcion: 'Una comunidad bien organizada administra mejor sus recursos.',
    produccionCiudad: { gold: 1 }
  },
  saberes: {
    nombre: 'Saberes',
    costo: 45,
    descripcion: 'El conocimiento transmitido oralmente tambien es ciencia.',
    produccionCiudad: { science: 1 }
  },
  artesanias: {
    nombre: 'Artesanías',
    costo: 35,
    descripcion: 'Manos que tallan y trabajan la materia prima rinden mas madera.',
    produccionCiudad: { wood: 1 }
  },
  tradicionesYCostumbres: {
    nombre: 'Tradiciones y costumbres',
    costo: 40,
    descripcion: 'Celebrar lo propio fortalece la identidad cultural.',
    produccionCiudad: { culture: 1 }
  },
  vestimenta: {
    nombre: 'Vestimenta',
    costo: 35,
    descripcion: 'La ropa tipica distingue a cada pueblo y alimenta su cultura.',
    produccionCiudad: { culture: 1 }
  }
};

// --- Razas -----------------------------------------------------------------
// Cada jugador elige una al unirse y la conserva toda la partida. Son SOLO bonos
// y penalizaciones: reusan los mismos efectos genericos que los rasgos y las
// tecnologias (produccion porcentual, ataque/defensa plano de unidades, vision,
// defensa de ciudad), asi que agregar una raza es tocar solo esta tabla.
//
// Cada una gana algo y paga algo, para que ninguna sea "la correcta":
//   produccionPorcentual  fraccion por recurso, puede ser NEGATIVA (-0.25 = -25%)
//   bonoAtaqueUnidades    suma plana al ataque de todas las unidades
//   bonoDefensaUnidades   suma plana a la defensa de las unidades (no de ciudades)
//   visionExtra           casillas extra al descubrir terreno
//   bonoDefensaCiudad     multiplicador extra de defensa de ciudad (0.25 = +25%)
//
// Un jugador SIN raza (partidas guardadas antes de que existieran) no tiene
// ningun bono ni penalizacion: se comporta exactamente como siempre.
export const RAZAS = {
  humanos: {
    nombre: 'Humanos',
    icono: '👑',
    descripcion: 'Mercaderes y sabios: más oro y ciencia, pero tropas menos curtidas.',
    produccionPorcentual: { gold: 0.1, science: 0.1 },
    bonoDefensaUnidades: -1
  },
  orcos: {
    nombre: 'Orcos',
    icono: '🪓',
    descripcion: 'Una horda guerrera: golpean más fuerte y saquean madera, pero descuidan el saber.',
    bonoAtaqueUnidades: 2,
    produccionPorcentual: { wood: 0.15, science: -0.25, culture: -0.25 }
  },
  elfos: {
    nombre: 'Elfos',
    icono: '🏹',
    descripcion: 'Pueblo del bosque: ven más lejos y cultivan mejor, pero pelean peor.',
    visionExtra: 1,
    bonoAtaqueUnidades: -1,
    produccionPorcentual: { food: 0.25, culture: 0.15 }
  },
  enanos: {
    nombre: 'Enanos',
    icono: '⛏️',
    descripcion: 'Gente de la montaña: ciudades y tropas muy duras y mucha piedra, pero poca comida.',
    bonoDefensaCiudad: 0.25,
    bonoDefensaUnidades: 1,
    produccionPorcentual: { stone: 0.25, food: -0.1 }
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
  },
  // Las seis siguientes reusan los mismos efectos genericos (bonos planos a
  // unidades y produccionPorcentual): agregar una tecnologia asi es tocar solo
  // esta tabla y el icono en MapCiencia.vue. Los bonos de ataque y defensa se SUMAN
  // con los de metalurgia y fortificacion, por eso cuestan casi el doble.
  carpinteria: {
    nombre: 'Carpintería',
    costo: { science: 35 },
    descripcion: '+20% de producción de madera en todas tus ciudades.',
    produccionPorcentual: { wood: 0.2 }
  },
  canteria: {
    nombre: 'Cantería',
    costo: { science: 35 },
    descripcion: '+20% de producción de piedra en todas tus ciudades.',
    produccionPorcentual: { stone: 0.2 }
  },
  escritura: {
    nombre: 'Escritura',
    costo: { science: 50 },
    descripcion: '+25% de producción de ciencia en todas tus ciudades.',
    produccionPorcentual: { science: 0.25 }
  },
  literatura: {
    nombre: 'Literatura',
    costo: { science: 45 },
    descripcion: '+25% de producción de cultura en todas tus ciudades.',
    produccionPorcentual: { culture: 0.25 }
  },
  acero: {
    nombre: 'Acero',
    costo: { science: 80 },
    descripcion: 'Armas de acero: +3 de ataque para todas tus unidades (se suma a Metalurgia).',
    bonoAtaqueUnidades: 3
  },
  murallas: {
    nombre: 'Murallas',
    costo: { science: 80 },
    descripcion: 'Defensas reforzadas: +3 de defensa para todas tus unidades (se suma a Fortificación).',
    bonoDefensaUnidades: 3
  }
};

// El rio es el PRIMER multiplicador menor a 1 de esta tabla: hasta ahora el
// terreno solo podia ayudar al defensor, nunca perjudicarlo. Vadear un rio
// expone, que es lo que un rio hace en la realidad y lo que evita que sea una
// franja de terreno decorativa. `bonoDefensa` cae a 1.0 por defecto, asi que
// agregar una entrada aca es todo lo que hace falta.
export const BONO_TERRENO_DEFENSA = {
  mountains: 1.25,
  hills: 1.25,
  forest: 1.1,
  river: 0.8
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

// Vida de la ciudad. Es DISTINTA de la defensa: la defensa decide quien gana la
// tirada, la vida decide cuantos golpes aguanta antes de caer. Una ciudad se
// captura al llegar a 0, no en una sola tirada. Las partidas viejas no traen
// `salud` en la ciudad: `saludDeCiudad` cae al maximo.
export const saludMaximaCiudad = (nivel) => 100 + 25 * (nivel - 1);
export const saludDeCiudad = (ciudad) => ciudad.salud ?? saludMaximaCiudad(ciudad.nivel);
// Lo que se cura por ronda, y la fraccion de la vida maxima con la que la
// ciudad pasa a manos del conquistador (no se la entrega entera: acaba de caer).
export const REGENERACION_CIUDAD = 5;
export const FRACCION_SALUD_AL_CAPTURAR = 0.5;

// Mejorar el nivel de una ciudad es repetible (a diferencia de una
// tecnologia): cada nivel cuesta mas que el anterior, y el beneficio ya
// existia de antes sin usarse — defensaCiudad(nivel) escala con esto desde
// el principio, solo que nada permitia subir `nivel` mas alla de 1.
export const COSTO_MEJORA_CIUDAD = (nivel) => ({ science: 15 * nivel, gold: 10 * nivel });

// --- Gobierno ------------------------------------------------------------
// El gobierno es POR JUGADOR y cambia QUIEN DECIDE, no las reglas del mapa
// (ver docs/superpowers/specs/2026-10-11-gobierno-design.md). `electorado` es
// quien tiene que aprobar un cambio de gobierno estando en ese gobierno:
// `jugador` = nadie mas, `mixto` = pueblo y lideres al 50% cada uno.
export const GOBIERNOS = {
  despotismo: { nombre: 'Despotismo', electorado: 'jugador' },
  monarquia: { nombre: 'Monarquía', electorado: 'jugador' },
  estratocracia: { nombre: 'Estratocracia', electorado: 'militares' },
  republica_indirecta: { nombre: 'República representativa', electorado: 'lideres' },
  republica_semidirecta: { nombre: 'República semidirecta', electorado: 'mixto' },
  republica_directa: { nombre: 'República directa', electorado: 'pueblo' },
};
export const FORMAS_ESTADO = ['unitario', 'federal'];
export const GRUPOS_DE_APOYO = ['pueblo', 'lideres', 'militares'];

// Un turno son 6 meses: 159 turnos son ~80 años de vida, y 1/159 es el 0,63%
// por turno que dio el usuario para la sucesion.
export const ESPERANZA_DE_VIDA_TURNOS = 159;

// Todo lo que sigue es AJUSTABLE: lo fijo el redactor del plan, no el usuario,
// y la tarea de balance lo mide contra partidas simuladas.
export const APOYO_INICIAL = 50;
// Respeto extra por gobierno (monarquia: te respeta la gente; estratocracia: el
// ejercito). Se SUMA al leer el apoyo, no se guarda, asi que cambiar de
// gobierno lo da o lo quita sin tocar el estado.
export const RESPETO = {
  monarquia: { pueblo: 10, lideres: 10 },
  estratocracia: { militares: 10 },
};
// Que tanto prefiere cada grupo cada gobierno (0 a 100). En una votacion pesa
// la DIFERENCIA entre el propuesto y el actual.
export const PREFERENCIAS = {
  pueblo: { despotismo: 20, monarquia: 30, estratocracia: 25, republica_indirecta: 60, republica_semidirecta: 70, republica_directa: 80 },
  lideres: { despotismo: 40, monarquia: 70, estratocracia: 30, republica_indirecta: 75, republica_semidirecta: 65, republica_directa: 25 },
  militares: { despotismo: 50, monarquia: 55, estratocracia: 90, republica_indirecta: 30, republica_semidirecta: 30, republica_directa: 30 },
};
export const PESO_PREFERENCIA = 0.6; // "principalmente" lo que prefieren
export const PESO_APOYO = 0.4;
export const ORO_A_VOTOS = 0.5;      // puntos de voto por oro ofrecido
export const UMBRAL_APROBACION = 50;
export const ENFRIAMIENTO_VOTO = 3;  // turnos sin volver a proponer tras perder
export const PROBABILIDAD_CRISIS = 0.02;
export const UMBRAL_EXPULSION = 25;
export const UMBRAL_REGRESO_MILITAR = 70;
export const UMBRAL_ELECCION = 50;
export const BONO_PRODUCCION_REPUBLICA = 0.1; // a TODOS los recursos
// Bonos concretos de los otros gobiernos (ademas del respeto de RESPETO), para
// que no sean peores que el despotismo sin pagar nada: la monarquia cobra
// tributos y la estratocracia arma sus arsenales con madera y piedra.
export const BONO_PRODUCCION_GOBIERNO = {
  monarquia: { gold: 0.2 },
  estratocracia: { wood: 0.2, stone: 0.2 },
};
// Hasta que nivel mejora ciudades SOLA el Estado federal (el jugador puede
// seguir subiendolas a mano): sin tope vaciaba la ciencia y el oro.
export const NIVEL_MAXIMO_ADMINISTRADO = 3;
export const ORO_POR_PUNTO_APOYO = 5;
export const VARIACION_APOYO_POR_RONDA = 2; // sube 2 por ronda por encima del promedio
// Bajar es MAS LENTO que subir y tiene piso: medido en una partida real, con -2 por
// ronda el apoyo caia a 4-6 en 40 rondas y perder el poder era casi permanente.
export const BAJADA_APOYO_POR_RONDA = 1;
export const PISO_APOYO_POR_TERRITORIO = 20;
// Quien no manda recupera un poco por ronda hacia el punto de partida: la gente olvida.
export const RECUPERACION_APOYO_SIN_PODER = 1;

// --- Subdivisiones del Estado federal -----------------------------------------
// Jerarquia dictada por el usuario, de mayor (2) a menor (6). El nivel 1 es el
// Pais: es el Estado entero, un nodo VIRTUAL que no se guarda ni se renombra.
// Departamento/Provincia y Municipio/Concejo son el mismo nivel con otro nombre.
export const TIPOS_SUBDIVISION = {
  departamento: { nombre: 'Departamento', nivel: 2 },
  provincia: { nombre: 'Provincia', nivel: 2 },
  distrito: { nombre: 'Distrito', nivel: 3 },
  condado: { nombre: 'Condado', nivel: 4 },
  municipio: { nombre: 'Municipio', nivel: 5 },
  concejo: { nombre: 'Concejo', nivel: 5 },
  freguesia: { nombre: 'Freguesia', nivel: 6 },
};
// Las subdivisiones guardadas antes de la jerarquia no traen tipo: se leen asi.
export const TIPO_SUBDIVISION_LEGADO = 'municipio';

// --- Problemas sociales (solo en el Estado federal) --------------------------
// Los diez dictados por el usuario. El efecto de cada uno vive en
// reglas/efectosProblemas.js; que mueve cada medidor, en reglas/problemas.js.
export const PROBLEMAS = {
  inseguridad: { nombre: 'Inseguridad y delincuencia' },
  desempleo: { nombre: 'Desempleo' },
  // `global`: es una crisis NACIONAL, no se limita a las ciudades cercanas.
  inflacion: { nombre: 'Inflación y crisis económica', global: true },
  pobreza: { nombre: 'Pobreza y desigualdad social' },
  salud: { nombre: 'Deficiencias en el sistema de salud' },
  // `recurso`: el unico que castiga. Si el modo de la partida lo apaga, el problema no existe.
  educacion: { nombre: 'Baja calidad educativa', recurso: 'science' },
  infraestructura: { nombre: 'Falta de infraestructura y vivienda' },
  corrupcion: { nombre: 'Corrupción política' },
  clima: { nombre: 'Crisis climática y escasez de agua' },
  inmigracion: { nombre: 'Inmigración y control fronterizo' },
};
// Todo lo siguiente es AJUSTABLE: lo fijo el redactor del plan y se mide.
export const MEDIDOR_NEUTRO = 30;
// Cada ciudad nace con su medidor a +-JITTER_INICIAL del neutro (determinista): si todas
// empezaran iguales cruzarian el limite en la misma ronda y explotarian diez problemas de golpe.
export const JITTER_INICIAL = 10;
// Tope de problemas NUEVOS por jugador y por ronda: el resto espera a la ronda siguiente.
export const MAX_PROBLEMAS_NUEVOS_POR_RONDA = 2;
export const LIMITE_SENAL = 60;     // desde aca la zona muestra una señal de aviso
export const LIMITE_PROBLEMA = 80;  // al cruzarlo aparece el problema
export const GRAVEDAD_MAXIMA = 3;   // sin oro el problema empeora hasta aca
export const DISTANCIA_PROPAGACION = 3; // un problema abarca tambien a las ciudades en aviso a esta distancia
export const RONDAS_RECUPERACION = 3;   // cuanto dura la señal de recuperacion
// Quien lo resuelve (por nivel de la subdivision, 1 = Pais) cuanto tarda y cuanto cuesta:
// las chicas resuelven rapido y barato, el Pais lento y caro.
export const RESOLUCION_POR_NIVEL = {
  1: { rondas: 3, oro: 60 },
  2: { rondas: 3, oro: 50 },
  3: { rondas: 2, oro: 40 },
  4: { rondas: 2, oro: 30 },
  5: { rondas: 1, oro: 20 },
  6: { rondas: 1, oro: 10 },
};

// Cuanto castiga cada problema mientras esta activo (ver reglas/efectosProblemas.js).
// El efecto se multiplica por 1 + ESCALA_GRAVEDAD * (gravedad - 1). AJUSTABLE.
export const ESCALA_GRAVEDAD = 0.5;
export const EFECTOS_PROBLEMAS = {
  desempleo: 0.2,        // -20% de produccion de la ciudad
  educacion: 0.5,        // -50% de la ciencia de la ciudad
  clima: 0.4,            // -40% de la comida de la ciudad
  corrupcion: 3,         // oro fijo perdido por ciudad y ronda
  inmigracion: 2,        // comida extra consumida por ciudad y ronda
  inseguridad: 2,        // defensa plana perdida por la ciudad
  infraestructura: 2,    // defensa plana perdida (un nivel de ciudad)
  inflacion: 0.25,       // +25% a los costos de construir, reclutar y mejorar
  salud: 25,             // poblacion perdida por ronda
  pobreza: 1,            // puntos de apoyo del pueblo perdidos por ronda
};

// Si la maquina arma sola su Estado federal con subdivisiones (ver iaSubdivisiones.js).
// Prendido el 2026-10-12 tras MEDIR que no cambia la fuerza de la IA (24 partidas: 62,5% de victorias con y sin; criterio ±10 puntos
// de victorias en 24 partidas). Una partida puede forzarlo con config.iaOrganizaSubdivisiones.
export const IA_ORGANIZA_SUBDIVISIONES = true;

// Cuantas ciudades puede abarcar (contando las de sus hijas) una subdivision segun su nivel.
// Sin tope, UNA Freguesia con todas las ciudades resolveria cualquier problema barato y
// rapido (cobertura total al menor nivel) y el arbol no importaria. El nivel 2 no tiene tope.
// AJUSTABLE.
export const CAPACIDAD_CIUDADES_POR_NIVEL = { 3: 81, 4: 27, 5: 9, 6: 3 };

// --- Capital -----------------------------------------------------------------
// Una ciudad por jugador (ver reglas/capital.js): rinde mas y se defiende mejor, y
// mudarla cuesta oro y deja a la nueva sin producir. AJUSTABLE.
export const BONO_PRODUCCION_CAPITAL = 0.2;   // +20% de todo lo que produce la ciudad
export const BONO_DEFENSA_CAPITAL = 1;        // defensa plana extra
export const COSTO_MOVER_CAPITAL = { gold: 60 };
export const RONDAS_SIN_PRODUCIR_MUDANZA = 1;

// --- Cabecera de subdivision ---------------------------------------------------
// La ciudad que encabeza una subdivision (ver reglas/subdivisiones.js#cabeceraDe).
// AJUSTABLE.
export const BONO_PRODUCCION_CABECERA = 0.05;       // a las demas ciudades que cubre, sin acumular niveles
export const DESCUENTO_RESOLUCION_CABECERA = 0.2;   // resolver un problema cuesta 20% menos

// --- Gobierno configurable -------------------------------------------------------
// Cuanto oro de mas (o de menos) rinde cada nivel de impuestos y cuanto apoyo del
// pueblo gana o pierde por ronda (ver reglas/gobierno.js). AJUSTABLE.
export const IMPUESTOS = {
  bajos: { oro: -0.2, apoyoPueblo: 1 },
  normales: { oro: 0, apoyoPueblo: 0 },
  altos: { oro: 0.25, apoyoPueblo: -2 },
};
export const LARGO_MAXIMO_NOMBRE_GOBIERNO = 40;

// --- Moneda --------------------------------------------------------------------
// El oro de cada jugador se muestra con el nombre y el simbolo de su moneda (ver
// reglas/moneda.js). 💰 y no 🪙: la moneda es Emoji 13 y la fuente de Windows 10 no la trae.
export const MONEDA_POR_DEFECTO = { nombre: 'Oro', simbolo: '💰' };
export const LARGO_MAXIMO_NOMBRE_MONEDA = 20;
export const LARGO_MAXIMO_SIMBOLO_MONEDA = 3;
// Acuñar da oro a cambio de inflacion: puntos porcentuales que encarecen todo lo
// que cuesta y bajan solos al cerrar cada ronda. AJUSTABLE.
export const ACUNACION = {
  maximoPorRonda: 100,  // oro acuñable por jugador y por ronda
  puntosPorOro: 0.2,    // 50 de oro = +10% a los costos
  techo: 100,           // la inflacion acuñada nunca pasa de aca
  bajadaPorRonda: 3,
};
