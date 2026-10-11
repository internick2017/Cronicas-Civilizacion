import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { MapGameRepo } from '../../src/db/MapGameRepo.js';
import { MapGameService } from '../../src/services/MapGameService.js';

// Estos tests pasan por `svc.accion`, el mismo camino que el navegador: ahi `tipo`
// ya es el nombre de la ACCION, asi que el tipo de subdivision no puede llamarse
// `tipo` (un bug real que los tests de la regla sola no podian ver).
async function partidaFederal() {
  const db = new Database(':memory:');
  const repo = new MapGameRepo(db, 'sqlite');
  repo.init();
  const svc = new MapGameService({ repo });
  const { id } = await svc.crearPartida({ nombre: 'Solo', contraIA: true });
  const { token } = await svc.unirse(id, { id: 'yo', nombre: 'Yo', civilizacion: 'Incas' });
  await svc.iniciar(id);
  await svc.accion(id, 'yo', { tipo: 'cambiarFormaEstado', formaEstado: 'federal' }, token);
  return { svc, id, token };
}
const yo = (r) => r.vista.jugadores.find(j => j.id === 'yo');

describe('subdivisiones por el servicio (como las manda el navegador)', () => {
  it('crea un Departamento y una Freguesia dentro, y las renombra', async () => {
    const { svc, id, token } = await partidaFederal();
    let r = await svc.accion(id, 'yo', { tipo: 'crearSubdivision', nombre: 'Norte', tipoSubdivision: 'departamento' }, token);
    expect(yo(r).subdivisiones).toMatchObject([{ id: 'sub1', nombre: 'Norte', tipo: 'departamento', nivel: 2, padreId: null }]);

    const capital = r.vista.mapa.find(t => t.ciudad && t.dueno === 'yo');
    r = await svc.accion(id, 'yo', {
      tipo: 'crearSubdivision', nombre: 'San Pedro', tipoSubdivision: 'freguesia', padreId: 'sub1',
      ciudades: [{ x: capital.x, y: capital.y }],
    }, token);
    expect(yo(r).subdivisiones[1]).toMatchObject({ tipo: 'freguesia', nivel: 6, padreId: 'sub1' });

    r = await svc.accion(id, 'yo', { tipo: 'renombrarSubdivision', id: 'sub2', nombre: 'San Pablo' }, token);
    expect(yo(r).subdivisiones[1].nombre).toBe('San Pablo');
  });

  it('asignar y quitar funcionan por la acción', async () => {
    const { svc, id, token } = await partidaFederal();
    let r = await svc.accion(id, 'yo', { tipo: 'crearSubdivision', nombre: 'D', tipoSubdivision: 'distrito' }, token);
    const capital = r.vista.mapa.find(t => t.ciudad && t.dueno === 'yo');
    r = await svc.accion(id, 'yo', { tipo: 'asignarCiudades', id: 'sub1', ciudades: [{ x: capital.x, y: capital.y }] }, token);
    expect(yo(r).subdivisiones[0].ciudades).toEqual([{ x: capital.x, y: capital.y }]);
    r = await svc.accion(id, 'yo', { tipo: 'quitarSubdivision', id: 'sub1' }, token);
    expect(yo(r).subdivisiones).toEqual([]);
  });

  it('un tipo de subdivisión inválido da TIPO_INVALIDO, no ACCION_DESCONOCIDA', async () => {
    const { svc, id, token } = await partidaFederal();
    await expect(svc.accion(id, 'yo', { tipo: 'crearSubdivision', nombre: 'X', tipoSubdivision: 'imperio' }, token))
      .rejects.toMatchObject({ codigo: 'TIPO_INVALIDO' });
  });
});
