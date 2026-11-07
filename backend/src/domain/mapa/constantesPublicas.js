// Reglas publicas del juego (sin estado de ninguna partida). Las usan la ruta
// GET /api/map/constantes y el anfitrion del modo online, que corre en el navegador.
import { PRIORIDADES } from './reglas/subdivisiones.js';
import {
  TIPOS_SUBDIVISION, PROBLEMAS, RESOLUCION_POR_NIVEL, LIMITE_SENAL, LIMITE_PROBLEMA, GRAVEDAD_MAXIMA,
  EFECTOS_PROBLEMAS, ESCALA_GRAVEDAD, CAPACIDAD_CIUDADES_POR_NIVEL,
  BONO_PRODUCCION_CAPITAL, BONO_DEFENSA_CAPITAL, COSTO_MOVER_CAPITAL, RONDAS_SIN_PRODUCIR_MUDANZA,
  BONO_PRODUCCION_CABECERA, DESCUENTO_RESOLUCION_CABECERA,
  MONEDA_POR_DEFECTO, LARGO_MAXIMO_NOMBRE_MONEDA, LARGO_MAXIMO_SIMBOLO_MONEDA, ACUNACION,
  IMPUESTOS, LARGO_MAXIMO_NOMBRE_GOBIERNO,
} from './constantes.js';
import { LIMITES_CONFIG } from './MapGame.js';
import {
  GOBIERNOS, GRUPOS_DE_APOYO, ENFRIAMIENTO_VOTO, ESPERANZA_DE_VIDA_TURNOS, ORO_POR_PUNTO_APOYO,
  BONO_PRODUCCION_REPUBLICA, BONO_PRODUCCION_GOBIERNO, PODERES, EFECTOS_PODERES, PODERES_SEPARADOS, PODERES_CONCENTRADOS, EJES_GOBIERNO, INCOMPATIBLES, NIVEL_MAXIMO_ADMINISTRADO, RESPETO,
  UMBRAL_EXPULSION, UMBRAL_ELECCION, UMBRAL_REGRESO_MILITAR, UMBRAL_APROBACION, UMBRAL_LEVANTAMIENTO, PUNTOS_MANIFESTACION,
  VARIACION_APOYO_POR_RONDA, BAJADA_APOYO_POR_RONDA, PISO_APOYO_POR_TERRITORIO,
  RECUPERACION_APOYO_SIN_PODER, PREFERENCIAS,
  EDIFICIOS, UNIDADES, COSTO_CIUDAD, MIN_JUGADORES,
  PRODUCCION_BASE_CIUDAD, BONO_TERRENO_PRODUCCION, BONO_TERRENO_DEFENSA,
  BONO_DEFENSA_CIUDAD, PORCENTAJE_VICTORIA_DOMINACION, UMBRAL_AVISO_DOMINACION, RASGOS_CULTURALES,
  DIFICULTADES_IA, DIFICULTAD_IA_DEFAULT, TECNOLOGIAS, COSTO_MEJORA_CIUDAD, CUARTEL, RAZAS
} from './constantes.js';

// Nombres en espanol para la interfaz. Viven aca y no en el dominio porque
// son presentacion, no regla de juego.
const NOMBRE_EDIFICIO = {
  granary: 'Granero', market: 'Mercado', library: 'Biblioteca',
  barracks: 'Cuartel', sawmill: 'Aserradero', quarry: 'Cantera', university: 'Universidad',
  port: 'Puerto'
};
const NOMBRE_UNIDAD = {
  warrior: 'Guerrero', archer: 'Arquero', spearman: 'Lancero', cavalry: 'Caballería',
  catapult: 'Catapulta', legionary: 'Legionario', warship: 'Buque de guerra',
  transport: 'Transporte'
};
// 'Mar' y no 'Agua': desde que el rio es un terreno propio, "agua" nombra a
// dos cosas con reglas opuestas (una detiene, la otra se vadea) y deja de
// servir como etiqueta. Ver CONTEXT.md.
const NOMBRE_TERRENO = {
  plains: 'Llanura', forest: 'Bosque', mountains: 'Montaña',
  hills: 'Colinas', desert: 'Desierto', water: 'Mar', river: 'Río'
};
const DIFICULTAD_IA_INFO = {
  facil: { nombre: 'Fácil', descripcion: 'Ataca sin calcular y a veces se distrae; buena para aprender el juego.' },
  normal: { nombre: 'Normal', descripcion: 'Evita los combates que va a perder y construye con criterio.' },
  dificil: { nombre: 'Difícil', descripcion: 'Solo pelea cuando tiene ventaja clara y prioriza unidades fuertes.' },
};

export function constantesPublicas() {
  return {
    costoCiudad: COSTO_CIUDAD,
    minJugadores: MIN_JUGADORES,
    edificios: Object.entries(EDIFICIOS).map(([tipo, datos]) => ({
      tipo,
      nombre: NOMBRE_EDIFICIO[tipo] || tipo,
      costo: datos.costo,
      produccion: datos.produccion,
      requiereTecnologia: datos.requiereTecnologia ?? null,
      // El puerto es el unico edificio con una condicion de geografia. La
      // vista lo necesita para poder decir "requiere costa" en vez de
      // ofrecer un boton que el backend va a rechazar.
      requiereCosta: datos.requiereCosta ?? false
    })),
    unidades: Object.entries(UNIDADES).map(([tipo, datos]) => ({
      tipo,
      nombre: NOMBRE_UNIDAD[tipo] || tipo,
      ataque: datos.ataque,
      defensa: datos.defensa,
      salud: datos.salud,
      movimiento: datos.movimiento,
      costo: datos.costo,
      requiereBarracks: datos.requiereBarracks,
      requiereTecnologia: datos.requiereTecnologia ?? null,
      // `naval` cambia como se juega la unidad, no solo como se recluta: la
      // vista lo usa para invertir el filtro de casillas alcanzables (un
      // buque solo entra al mar) y para no aplicarle el bono del cuartel.
      naval: datos.naval ?? false,
      requierePuerto: datos.requierePuerto ?? false,
      // Cuanta tropa lleva adentro. Cero para todo lo que no transporta; la
      // vista lo usa para ofrecer subir y bajar tropa.
      capacidad: datos.capacidad ?? 0
    })),
    // Tecnologias (que se pagan con ciencia) y el costo de subir el nivel de
    // una ciudad, que no es una tecnologia (es repetible, por ciudad): se
    // exponen por separado para que el frontend no los confunda.
    tecnologias: Object.entries(TECNOLOGIAS).map(([tipo, datos]) => ({
      tipo,
      nombre: datos.nombre,
      descripcion: datos.descripcion,
      costo: datos.costo,
      bonoAtaqueUnidades: datos.bonoAtaqueUnidades ?? 0,
      bonoDefensaUnidades: datos.bonoDefensaUnidades ?? 0,
      produccionPorcentual: datos.produccionPorcentual ?? {},
      desbloqueaUnidad: datos.desbloqueaUnidad ?? null,
      desbloqueaEdificio: datos.desbloqueaEdificio ?? null
    })),
    costoMejoraCiudadPorNivel: COSTO_MEJORA_CIUDAD(1),
    // Efectos del cuartel (ver el comentario junto a EDIFICIOS.barracks en
    // el dominio): no son "produccion" de un recurso, por eso van aparte.
    cuartel: CUARTEL,
    // Reglas de economia y combate, para que el panel de ayuda las explique
    // leyendolas de aca en vez de copiarlas (y quedar desactualizado al
    // primer cambio de balance).
    produccionBaseCiudad: PRODUCCION_BASE_CIUDAD,
    terrenos: Object.entries(BONO_TERRENO_PRODUCCION).map(([tipo, produccion]) => ({
      tipo,
      nombre: NOMBRE_TERRENO[tipo] || tipo,
      produccion,
      bonoDefensa: BONO_TERRENO_DEFENSA[tipo] ?? 1
    })),
    rasgosCulturales: Object.entries(RASGOS_CULTURALES).map(([tipo, datos]) => ({
      tipo,
      nombre: datos.nombre,
      descripcion: datos.descripcion,
      costo: { culture: datos.costo },
      produccionCiudad: datos.produccionCiudad ?? {},
      visionExtra: datos.visionExtra ?? 0,
      bonoDefensaCiudad: datos.bonoDefensaCiudad ?? 0
    })),
    // Razas jugables: el lobby las ofrece y el panel explica sus bonos leyendolos de aca.
    razas: Object.entries(RAZAS).map(([tipo, datos]) => ({
      tipo,
      nombre: datos.nombre,
      icono: datos.icono,
      descripcion: datos.descripcion,
      produccionPorcentual: datos.produccionPorcentual ?? {},
      bonoAtaqueUnidades: datos.bonoAtaqueUnidades ?? 0,
      bonoDefensaUnidades: datos.bonoDefensaUnidades ?? 0,
      visionExtra: datos.visionExtra ?? 0,
      bonoDefensaCiudad: datos.bonoDefensaCiudad ?? 0
    })),
    dificultadesIA: DIFICULTADES_IA.map((tipo) => ({
      tipo,
      nombre: DIFICULTAD_IA_INFO[tipo]?.nombre || tipo,
      descripcion: DIFICULTAD_IA_INFO[tipo]?.descripcion || '',
      porDefecto: tipo === DIFICULTAD_IA_DEFAULT,
    })),
    // Gobierno: el panel lista las opciones y explica quien aprueba cada
    // cambio leyendolo de aca, no copiandolo.
    gobiernos: Object.entries(GOBIERNOS).map(([tipo, datos]) => ({ tipo, ...datos })),
    gruposDeApoyo: GRUPOS_DE_APOYO,
    enfriamientoVoto: ENFRIAMIENTO_VOTO,
    esperanzaDeVidaTurnos: ESPERANZA_DE_VIDA_TURNOS,
    oroPorPuntoApoyo: ORO_POR_PUNTO_APOYO,
    prioridadesSubdivision: Object.keys(PRIORIDADES),
    problemasSociales: Object.entries(PROBLEMAS).map(([tipo, datos]) => ({ tipo, ...datos })),
    resolucionPorNivel: RESOLUCION_POR_NIVEL,
    capacidadCiudadesPorNivel: CAPACIDAD_CIUDADES_POR_NIVEL,
    efectosProblemas: EFECTOS_PROBLEMAS,
    limitesProblemas: { senal: LIMITE_SENAL, problema: LIMITE_PROBLEMA, gravedadMaxima: GRAVEDAD_MAXIMA, escalaGravedad: ESCALA_GRAVEDAD },
    // Del mas grande al mas chico: el panel los ofrece en ese orden.
    tiposSubdivision: Object.entries(TIPOS_SUBDIVISION)
      .map(([tipo, datos]) => ({ tipo, ...datos }))
      .sort((a, b) => a.nivel - b.nivel),
    // Numeros del manual de instrucciones (MapAyuda): el texto los lee de aca.
    bonoProduccionRepublica: BONO_PRODUCCION_REPUBLICA,
    bonosProduccionGobierno: BONO_PRODUCCION_GOBIERNO,
    respetoGobierno: RESPETO,
    poderes: Object.entries(PODERES).map(([clave, datos]) => ({ clave, ...datos })),
    efectosPoderes: EFECTOS_PODERES,
    poderesGobierno: PODERES_SEPARADOS,
    poderesConcentrados: PODERES_CONCENTRADOS,
    ejesGobierno: EJES_GOBIERNO,
    gobiernosIncompatibles: INCOMPATIBLES,
    preferenciasGobierno: PREFERENCIAS,
    nivelMaximoAdministrado: NIVEL_MAXIMO_ADMINISTRADO,
    puntosManifestacion: PUNTOS_MANIFESTACION,
    umbralesGobierno: {
      expulsion: UMBRAL_EXPULSION, eleccion: UMBRAL_ELECCION, levantamiento: UMBRAL_LEVANTAMIENTO,
      regresoMilitar: UMBRAL_REGRESO_MILITAR, aprobacion: UMBRAL_APROBACION,
    },
    variacionApoyo: {
      sube: VARIACION_APOYO_POR_RONDA, baja: BAJADA_APOYO_POR_RONDA,
      piso: PISO_APOYO_POR_TERRITORIO, recuperacion: RECUPERACION_APOYO_SIN_PODER,
    },
    bonoDefensaCiudad: BONO_DEFENSA_CIUDAD,
    porcentajeVictoriaDominacion: PORCENTAJE_VICTORIA_DOMINACION,
    umbralAvisoDominacion: UMBRAL_AVISO_DOMINACION,
    capital: {
      bonoProduccion: BONO_PRODUCCION_CAPITAL, bonoDefensa: BONO_DEFENSA_CAPITAL,
      costoMover: COSTO_MOVER_CAPITAL, rondasSinProducir: RONDAS_SIN_PRODUCIR_MUDANZA,
    },
    cabecera: { bonoProduccion: BONO_PRODUCCION_CABECERA, descuentoResolucion: DESCUENTO_RESOLUCION_CABECERA },
    moneda: {
      porDefecto: MONEDA_POR_DEFECTO, largoNombre: LARGO_MAXIMO_NOMBRE_MONEDA, largoSimbolo: LARGO_MAXIMO_SIMBOLO_MONEDA,
    },
    acunacion: ACUNACION,
    impuestos: IMPUESTOS,
    limitesMandato: LIMITES_CONFIG.rondasEntreElecciones,
    limitesTamanoMapa: LIMITES_CONFIG.tamanoMapa,
    largoNombreGobierno: LARGO_MAXIMO_NOMBRE_GOBIERNO,
  };
}
