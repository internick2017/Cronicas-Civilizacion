import { describe, it, expect } from 'vitest';
import { narrarRonda } from '../../src/domain/mapa/narradorLocal.js';

const JUGADORES = [
  { id: 'j1', nombre: 'Ana', civilizacion: 'Romanos' },
  { id: 'j2', nombre: 'Beto', civilizacion: 'Egipcios' }
];

// Tipos de evento que narrarRonda efectivamente narra (todos los demas caen en el
// "default: no se narran" de la funcion). Se usa tanto para el test transversal de
// robustez como para poder mantenerlo sincronizado si se agrega un tipo nuevo.
const TIPOS_NARRADOS = [
  'CiudadFundada',
  'EdificioConstruido',
  'UnidadReclutada',
  'CombateResuelto',
  'UnidadDestruida',
  'CiudadCapturada',
  'JugadorEliminado',
  'PartidaTerminada'
];

const CADENAS_PROHIBIDAS = ['undefined', 'null', '[object Object]'];

describe('narrarRonda', () => {
  it('nombra al jugador que funda una ciudad (texto completo)', () => {
    const texto = narrarRonda(
      [{ tipo: 'CiudadFundada', jugadorId: 'j1', datos: { nombre: 'Roma', x: 3, y: 4 } }],
      JUGADORES
    );
    expect(texto).toBe('Los colonos de Ana levantaron Roma en (3, 4).');
  });

  it('describe una construccion (texto completo)', () => {
    const texto = narrarRonda(
      [{ tipo: 'EdificioConstruido', jugadorId: 'j2', datos: { edificio: 'granary', x: 1, y: 1 } }],
      JUGADORES
    );
    expect(texto).toBe('Beto construyo un granero.');
  });

  it('describe un reclutamiento (texto completo)', () => {
    // El campo real del evento es `tipo` (no `unidad`), ver reglas/militar.js:reclutar.
    const texto = narrarRonda(
      [{ tipo: 'UnidadReclutada', jugadorId: 'j1', datos: { tipo: 'archer', x: 2, y: 2 } }],
      JUGADORES
    );
    expect(texto).toBe('Nuevas tropas de Ana: arqueros.');
  });

  it('describe un combate ganado por el atacante (texto completo)', () => {
    // Forma real (reglas/combate.js:atacar): jugadorId es siempre quien ataca; el evento
    // trae danoAtacante/danoDefensor/ganador, no un campo `dano` unico. El evento
    // UnidadDestruida solo trae {x, y}: no identifica al dueno de la unidad destruida,
    // asi que el narrador no puede nombrar al bando derrotado.
    const texto = narrarRonda(
      [
        {
          tipo: 'CombateResuelto',
          jugadorId: 'j1',
          datos: { desde: { x: 1, y: 1 }, hasta: { x: 1, y: 2 }, ganador: 'atacante', danoAtacante: 0, danoDefensor: 40 }
        },
        { tipo: 'UnidadDestruida', jugadorId: 'j1', datos: { x: 1, y: 2 } }
      ],
      JUGADORES
    );
    expect(texto).toBe('Ana ataco en (1, 2) y se impuso, causando 40 de dano. Una unidad cayo en combate en (1, 2).');
  });

  it('describe un combate ganado por el defensor (texto completo)', () => {
    const texto = narrarRonda(
      [
        {
          tipo: 'CombateResuelto',
          jugadorId: 'j1',
          datos: { desde: { x: 1, y: 1 }, hasta: { x: 1, y: 2 }, ganador: 'defensor', danoAtacante: 30, danoDefensor: 0 }
        }
      ],
      JUGADORES
    );
    expect(texto).toBe('Ana ataco en (1, 2) pero fue rechazado, sufriendo 30 de dano.');
  });

  it('destaca una ciudad capturada (texto completo)', () => {
    // Forma real (reglas/combate.js): datos solo trae {x, y}, sin `nombre` ni `anterior`.
    const texto = narrarRonda(
      [{ tipo: 'CiudadCapturada', jugadorId: 'j1', datos: { x: 5, y: 5 } }],
      JUGADORES
    );
    expect(texto).toBe('Ana tomo una ciudad en (5, 5). La ciudad cambio de manos.');
  });

  it('anuncia la eliminacion de un jugador (texto completo)', () => {
    // Forma real (reglas/turnos.js:terminarTurno): jugadorId del evento es quien cerro el
    // turno, no el eliminado; el eliminado va en datos.jugadorId.
    const texto = narrarRonda(
      [{ tipo: 'JugadorEliminado', jugadorId: 'j1', datos: { jugadorId: 'j2' } }],
      JUGADORES
    );
    expect(texto).toBe('Beto quedo sin ciudades y desaparecio del mapa.');
  });

  it('anuncia el fin de la partida por dominacion (texto completo)', () => {
    // Forma real (reglas/turnos.js:evaluarVictoria): datos.ganador es un objeto
    // { jugadorId, tipoVictoria, turno } o null, no un id de jugador plano.
    const texto = narrarRonda(
      [{ tipo: 'PartidaTerminada', datos: { ganador: { jugadorId: 'j1', tipoVictoria: 'dominacion', turno: 12 } } }],
      JUGADORES
    );
    expect(texto).toBe('La partida termino: Ana se impuso por dominacion.');
  });

  it('anuncia el fin de la partida sin vencedores (texto completo)', () => {
    const texto = narrarRonda(
      [{ tipo: 'PartidaTerminada', datos: { ganador: null } }],
      JUGADORES
    );
    expect(texto).toBe('La partida termino sin vencedores.');
  });

  it('una ronda sin eventos relevantes devuelve una linea de transicion, nunca vacio', () => {
    const texto = narrarRonda([{ tipo: 'RondaCompletada', jugadorId: 'j1', datos: {} }], JUGADORES);
    expect(texto).toBe('La ronda paso sin sobresaltos. Los pueblos siguieron con lo suyo.');
  });

  it('nunca emite "undefined", "null" ni "[object Object]", ni con datos ausentes ni con datos incompletos', () => {
    // Red de regresion para el bug detectado en la revision: `datos` ausente o con campos
    // faltantes NO debe filtrar valores crudos al texto. Se prueba cada tipo narrado con
    // tres variantes: sin `datos`, con `datos: {}`, y con `datos` parcial que ademas
    // incluye un valor "raro" (objeto/null) en el campo esencial.
    const variantesPorTipo = {
      CiudadFundada: [
        {},
        { nombre: null, x: undefined, y: undefined },
        { nombre: {}, x: 3, y: undefined }
      ],
      EdificioConstruido: [
        {},
        { edificio: undefined },
        { edificio: {} }
      ],
      UnidadReclutada: [
        {},
        { tipo: undefined },
        { tipo: null }
      ],
      CombateResuelto: [
        {},
        { ganador: 'atacante' },
        { ganador: 'defensor', hasta: {} },
        { ganador: undefined, hasta: { x: 1, y: 1 } }
      ],
      UnidadDestruida: [
        {},
        { x: undefined, y: undefined }
      ],
      CiudadCapturada: [
        {},
        { x: null, y: null }
      ],
      JugadorEliminado: [
        {},
        { jugadorId: undefined },
        { jugadorId: 'nadie-conocido' }
      ],
      PartidaTerminada: [
        {},
        { ganador: {} },
        { ganador: { jugadorId: undefined, tipoVictoria: undefined } }
      ]
    };

    for (const tipo of TIPOS_NARRADOS) {
      expect(variantesPorTipo[tipo], `falta cubrir el tipo ${tipo} en el test transversal`).toBeDefined();

      // Variante "sin datos en absoluto" (la propiedad `datos` ni existe en el evento).
      const eventoSinDatos = { tipo, jugadorId: 'j1' };
      const textoSinDatos = narrarRonda([eventoSinDatos], JUGADORES);
      for (const cadena of CADENAS_PROHIBIDAS) {
        expect(textoSinDatos, `tipo=${tipo} sin datos -> "${textoSinDatos}"`).not.toContain(cadena);
      }

      // Variantes con `datos` presente pero incompleto o con valores invalidos.
      for (const datos of variantesPorTipo[tipo]) {
        const evento = { tipo, jugadorId: 'j1', datos };
        const texto = narrarRonda([evento], JUGADORES);
        for (const cadena of CADENAS_PROHIBIDAS) {
          expect(texto, `tipo=${tipo} datos=${JSON.stringify(datos)} -> "${texto}"`).not.toContain(cadena);
        }
        expect(texto.length).toBeGreaterThan(0);
      }
    }
  });

  it('es determinista: mismos eventos => mismo texto', () => {
    const eventos = [{ tipo: 'CiudadFundada', jugadorId: 'j1', datos: { nombre: 'Roma', x: 3, y: 4 } }];
    expect(narrarRonda(eventos, JUGADORES)).toBe(narrarRonda(eventos, JUGADORES));
  });

  it('no rompe con un jugadorId desconocido', () => {
    const texto = narrarRonda(
      [{ tipo: 'CiudadFundada', jugadorId: 'fantasma', datos: { nombre: 'X', x: 0, y: 0 } }],
      JUGADORES
    );
    expect(typeof texto).toBe('string');
    expect(texto.length).toBeGreaterThan(0);
  });

  it('no rompe con datos ausentes', () => {
    const texto = narrarRonda(
      [{ tipo: 'CiudadFundada', jugadorId: 'j1' }],
      JUGADORES
    );
    expect(typeof texto).toBe('string');
    expect(texto.length).toBeGreaterThan(0);
  });

  it('no muta los eventos que recibe', () => {
    const eventos = [{ tipo: 'CiudadFundada', jugadorId: 'j1', datos: { nombre: 'Roma', x: 1, y: 1 } }];
    const copia = structuredClone(eventos);
    narrarRonda(eventos, JUGADORES);
    expect(eventos).toEqual(copia);
  });
});
