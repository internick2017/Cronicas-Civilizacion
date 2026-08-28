import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PresupuestoIA } from '../src/services/presupuestoIA.js';

let archivo;
let ahora;
const reloj = () => ahora;

beforeEach(() => {
  archivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'presupuesto-')), 'uso-ia.json');
  ahora = new Date('2026-08-28T10:00:00Z').getTime();
});
afterEach(() => {
  try { fs.rmSync(path.dirname(archivo), { recursive: true, force: true }); } catch { /* ya no estaba */ }
});

const crear = (opciones = {}) => new PresupuestoIA({ archivo, reloj, porMinuto: 3, porDia: 5, pausaCuotaMs: 60000, ...opciones });

describe('presupuesto de llamadas a la IA', () => {
  it('deja llamar mientras haya lugar', () => {
    const p = crear();
    expect(p.puedeLlamar().permitido).toBe(true);
  });

  it('corta al llegar al tope por minuto, y se recupera cuando pasa el minuto', () => {
    const p = crear();
    for (let i = 0; i < 3; i++) p.registrarLlamada();

    const bloqueado = p.puedeLlamar();
    expect(bloqueado.permitido).toBe(false);
    expect(bloqueado.motivo).toBe('limite_por_minuto');

    ahora += 61_000;
    expect(p.puedeLlamar().permitido).toBe(true);
  });

  it('corta al llegar al tope diario, y no se recupera hasta el dia siguiente', () => {
    const p = crear();
    for (let i = 0; i < 5; i++) { p.registrarLlamada(); ahora += 61_000; }

    expect(p.puedeLlamar()).toMatchObject({ permitido: false, motivo: 'limite_diario' });

    ahora += 3 * 60 * 60 * 1000; // mismas horas, mismo dia
    expect(p.puedeLlamar().permitido).toBe(false);

    ahora += 24 * 60 * 60 * 1000; // dia siguiente
    expect(p.puedeLlamar().permitido).toBe(true);
  });

  // Es lo que hace que un limite excedido no se convierta en una avalancha de
  // llamadas: la primera respuesta de cuota apaga la IA por un rato.
  it('el interruptor apaga la IA y se recupera solo al pasar la pausa', () => {
    const p = crear();
    p.registrarCuotaAgotada();

    expect(p.puedeLlamar()).toMatchObject({ permitido: false, motivo: 'cuota_agotada' });

    ahora += 59_000;
    expect(p.puedeLlamar().permitido).toBe(false);

    ahora += 2_000;
    expect(p.puedeLlamar().permitido).toBe(true);
  });

  it('sobrevive un reinicio: el conteo del dia se lee del archivo', () => {
    const p = crear();
    for (let i = 0; i < 5; i++) { p.registrarLlamada(); ahora += 61_000; }
    expect(p.puedeLlamar().permitido).toBe(false);

    const otroProceso = crear();
    expect(otroProceso.puedeLlamar()).toMatchObject({ permitido: false, motivo: 'limite_diario' });
  });

  it('un archivo corrupto no rompe nada: se arranca de cero', () => {
    fs.writeFileSync(archivo, 'esto no es json');
    const p = crear();
    expect(p.puedeLlamar().permitido).toBe(true);
  });

  it('no poder escribir el archivo tampoco rompe: el presupuesto sigue en memoria', () => {
    // El archivo apunta a un DIRECTORIO: escribir ahi falla siempre y en todos
    // los sistemas. (Una ruta inventada no sirve: en Windows se crea sola, y el
    // test se leia a si mismo en la corrida siguiente.)
    const p = new PresupuestoIA({ archivo: path.dirname(archivo), reloj, porMinuto: 2, porDia: 5 });
    expect(() => p.registrarLlamada()).not.toThrow();
    p.registrarLlamada();
    expect(p.puedeLlamar()).toMatchObject({ permitido: false, motivo: 'limite_por_minuto' });
  });

  it('estado() cuenta lo usado, para poder diagnosticar sin adivinar', () => {
    const p = crear();
    p.registrarLlamada();
    p.registrarLlamada();
    expect(p.estado()).toMatchObject({ usadasHoy: 2, topeDiario: 5, topePorMinuto: 3 });
  });
});
