import { describe, it, expect } from 'vitest';
import { crearEstado, jugadorPorId } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { perfilGobiernoDe, cerrarRondaGobierno, declararEmergencia, multiplicadorProduccion } from '../../src/domain/mapa/reglas/gobierno.js';
import { poderExiste } from '../../src/domain/mapa/reglas/poderes.js';
import { vistaJugador } from '../../src/domain/mapa/reglas/visibilidad.js';
import { cerrarRondaProblemas } from '../../src/domain/mapa/reglas/problemas.js';
import { recuperarFronteras } from '../../src/domain/mapa/reglas/fronteras.js';
import { GOBIERNOS, PODERES_CONCENTRADOS, PODERES_SEPARADOS } from '../../src/domain/mapa/constantes.js';

const partida = (config = {}, raza = null) => {
  const e = crearEstado({ nombre: 'T', semilla: 's1', config });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas', raza }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));
  return e;
};
const yo = (e) => jugadorPorId(e, 'p1');
const codigo = (fn) => { try { fn(); } catch (err) { return err.codigo; } return null; };

describe('los poderes según el gobierno', () => {
  it('cada pieza de gobierno dice qué poderes concentra y ninguno es independiente y concentrado a la vez', () => {
    for (const pieza of Object.keys(GOBIERNOS)) {
      expect(PODERES_CONCENTRADOS[pieza], pieza).toBeDefined();
      const separados = PODERES_SEPARADOS[pieza] ?? [];
      expect(PODERES_CONCENTRADOS[pieza].filter(p => separados.includes(p)), pieza).toEqual([]);
    }
  });

  it('en el despotismo el Legislativo no existe y la Emergencia está concentrada', () => {
    const e = partida();
    expect(poderExiste(yo(e), 'legislativo')).toBe(false);
    expect(perfilGobiernoDe(yo(e)).concentrados.sort()).toEqual(['emergencia', 'federativo']);
  });

  it('si una pieza lo separa y otra lo concentra, queda independiente', () => {
    const e = partida();
    yo(e).gobierno = 'monarquia+parlamentarismo';
    const perfil = perfilGobiernoDe(yo(e));
    expect(perfil.poderes).toContain('legislativo');
    expect(perfil.concentrados).not.toContain('legislativo');
  });

  it('sin el poder de Emergencia no se declara', () => {
    const e = partida();
    yo(e).gobierno = 'teocracia';
    expect(codigo(() => declararEmergencia(e, 'p1'))).toBe('PODER_INEXISTENTE');
  });
});

describe('los poderes que elige la partida', () => {
  const sinControl = { poderes: { control: false, moderador: false, emergencia: false } };

  it('un poder apagado no existe para ningún gobierno y no cobra mantenimiento', () => {
    const e = partida(sinControl);
    yo(e).gobierno = 'republica_directa';
    expect(perfilGobiernoDe(yo(e)).poderes).not.toContain('control');
    expect(multiplicadorProduccion(yo(e), 'gold')).toBeCloseTo(1 + 0.1 - 0.06);
  });

  it('dos partidas con el mismo gobierno y distintos poderes no se pisan', () => {
    const conTodos = partida();
    const conMenos = partida(sinControl);
    yo(conTodos).gobierno = 'republica_directa';
    yo(conMenos).gobierno = 'republica_directa';
    expect(perfilGobiernoDe(yo(conTodos)).poderes).toContain('control');
    expect(perfilGobiernoDe(yo(conMenos)).poderes).not.toContain('control');
  });

  it('sin Emergencia en la partida no hay excepción', () => {
    const e = partida(sinControl);
    expect(codigo(() => declararEmergencia(e, 'p1'))).toBe('PODER_INEXISTENTE');
  });

  it('la vista dice qué poderes hay y el Ejecutivo no se puede apagar', () => {
    expect(vistaJugador(partida(sinControl), 'p1').reglas.poderes).not.toContain('control');
    expect(codigo(() => crearEstado({ nombre: 'T', semilla: 's', config: { poderes: { ejecutivo: false } } }))).toBe('CONFIG_INVALIDA');
  });
});

describe('casillas de sistemas que ya existían', () => {
  it('razas apagadas: nadie conserva bonos', () => {
    expect(yo(partida({ mecanicas: { razas: false } }, 'orcos')).raza).toBeNull();
    expect(yo(partida({}, 'orcos')).raza).toBe('orcos');
  });

  it('sin levantamientos no hay golpes ni revoluciones', () => {
    const e = partida({ mecanicas: { levantamientos: false } });
    yo(e).apoyo = { pueblo: 0, lideres: 0, militares: 0 };
    const tipos = cerrarRondaGobierno(e, () => 0).map(x => x.tipo);
    expect(tipos).not.toContain('Levantamiento');
    const conMecanica = partida();
    yo(conMecanica).apoyo = { pueblo: 0, lideres: 0, militares: 0 };
    expect(cerrarRondaGobierno(conMecanica, () => 0).map(x => x.tipo)).toContain('Levantamiento');
  });

  it('sin problemas sociales el Estado federal no los acumula', () => {
    const e = partida({ mecanicas: { problemas: false } });
    yo(e).formaEstado = 'federal';
    expect(cerrarRondaProblemas(e, () => 0)).toEqual([]);
  });

  it('sin fronteras vivas la casilla ajena no vuelve sola', () => {
    const armar = (config) => {
      const e = partida(config);
      const ciudad = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
      const vecina = e.mapa.find(t => Math.abs(t.x - ciudad.x) + Math.abs(t.y - ciudad.y) === 1 && t.terreno !== 'water');
      vecina.dueno = 'p2';
      return e;
    };
    expect(recuperarFronteras(armar({}))).toHaveLength(1);
    expect(recuperarFronteras(armar({ mecanicas: { fronteras: false } }))).toEqual([]);
  });

  it('sin niebla se ve todo el mapa; con niebla no', () => {
    expect(vistaJugador(partida({ mecanicas: { niebla: false } }), 'p1').mapa.every(t => t.descubierto)).toBe(true);
    expect(vistaJugador(partida(), 'p1').mapa.every(t => t.descubierto)).toBe(false);
  });
});
