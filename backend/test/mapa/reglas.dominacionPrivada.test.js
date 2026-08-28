import { describe, it, expect } from 'vitest';
import { crearEstado, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { vistaJugador } from '../../src/domain/mapa/reglas/visibilidad.js';
import { controlTerritorial, tierraAlcanzable } from '../../src/domain/mapa/reglas/dominacion.js';

function partida() {
  const e = crearEstado({ nombre: 'T', semilla: 'privada' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'X' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Y' }));
  aplicar(e, iniciar(e));
  return e;
}

describe('la vista no revela cuanto mundo hay', () => {
  // Jugando se vio esto: con 6 casillas descubiertas de 196, la vista informaba
  // totalTierra 74. O sea que antes de explorar nada ya sabias cuanta tierra
  // jugable existe. Cuidamos que el porcentaje del rival no diga DONDE esta su
  // territorio; el denominador decia CUANTO mundo hay.
  it('no manda el total de casillas de tierra', () => {
    const yo = vistaJugador(partida(), 'p1').jugadores.find(j => j.id === 'p1');
    expect(yo.dominacion).not.toHaveProperty('totalTierra');
  });

  // Con el total fuera pero el porcentaje exacto, el total se despeja: 1 casilla
  // y 0.0135 dan 74. Redondear a puntos enteros deja un rango, no un numero.
  it('el porcentaje viene redondeado, para que el total no se pueda despejar', () => {
    const e = partida();
    const yo = vistaJugador(e, 'p1').jugadores.find(j => j.id === 'p1');
    const exacto = controlTerritorial(e, 'p1').porcentaje;

    expect(yo.dominacion.porcentaje).toBe(Math.floor(exacto * 100) / 100);
    expect((yo.dominacion.porcentaje * 100) % 1).toBe(0);
  });

  // Hacia ABAJO y no al mas cercano: si redondeara hacia arriba, la barra podria
  // mostrar el objetivo cumplido en una ronda en la que todavia no ganaste.
  it('redondea hacia abajo: nunca muestra un objetivo que todavia no alcanzaste', () => {
    const e = partida();
    // Sobre la tierra ALCANZABLE, que es el denominador real: contarlo sobre
    // todo el mapa daba 63% y el escenario no probaba lo que decia probar.
    const tierra = tierraAlcanzable(e);
    const cuantas = Math.floor(tierra.length * 0.599); // 59.x%: sin llegar a 60
    tierra.slice(0, cuantas).forEach(t => { t.dueno = 'p1'; });

    const mostrado = vistaJugador(e, 'p1').jugadores.find(j => j.id === 'p1').dominacion.porcentaje;
    expect(controlTerritorial(e, 'p1').porcentaje).toBeLessThan(0.6);
    expect(mostrado).toBeLessThan(0.6);
  });

  it('sigue diciendo cuantas casillas tenes: eso es tuyo y ya lo ves en el mapa', () => {
    const yo = vistaJugador(partida(), 'p1').jugadores.find(j => j.id === 'p1');
    expect(yo.dominacion.tiles).toBeGreaterThan(0);
  });

  it('el aviso de rival dominante tampoco cambia de forma', () => {
    const e = partida();
    const tierra = e.mapa.filter(t => t.terreno !== 'water');
    tierra.slice(0, Math.floor(tierra.length * 0.5)).forEach(t => { t.dueno = 'p2'; });

    const aviso = vistaJugador(e, 'p1').dominacionRivales[0];
    expect(aviso).toMatchObject({ id: 'p2' });
    expect(aviso).not.toHaveProperty('tiles');
    expect((aviso.porcentaje * 100) % 1).toBe(0);
  });
});
