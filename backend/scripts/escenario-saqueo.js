// Arma una partida lista para ver el saqueo naval con tus propios ojos, sin
// jugar los 20 o 30 turnos que hacen falta para que ocurra de casualidad.
//
// Escribe DIRECTO en la base sqlite del backend (data/cronicas.db), por el
// mismo MapGameRepo que usa el servidor. Una partida nueva no esta en el cache
// del servidor, asi que la carga de la base la primera vez que se la pide: no
// hace falta reiniciarlo.
//
// El escenario (mapa todo llanura, con un mar chico):
//   - Vos: capital con puerto y DOS buques en el mar, pegados a una ciudad rival.
//   - La maquina: su capital lejos, y "Puerto rival", una ciudad costera SIN
//     tropa y con 100 de oro. Es exactamente lo que el saqueo necesita.
//   - La semilla se busca para que la primera tirada de ataque la gane el buque:
//     el combate es azar, y una demo que depende de la suerte no demuestra nada.
//     Funciona porque no se guarda ningun evento, asi que la semilla del primer
//     ataque (combate:<semilla>:1:0) es conocida de antemano.
//
// Uso:
//   node scripts/escenario-saqueo.js            crea la partida y muestra como abrirla
//   node scripts/escenario-saqueo.js --ver      muestra el estado del cerco de la ultima
//   node scripts/escenario-saqueo.js --ver <id> idem, de una partida puntual

import crypto from 'crypto';
import { db } from '../src/config/database-sqlite.js';
import { MapGameRepo } from '../src/db/MapGameRepo.js';
import { crearEstado, tileEn, jugadorPorId } from '../src/domain/mapa/MapGame.js';
import { aplicar } from '../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../src/domain/mapa/reglas/partida.js';
import { atacar } from '../src/domain/mapa/reglas/combate.js';
import { producirParaJugador } from '../src/domain/mapa/reglas/turnos.js';
import { estaSaqueada } from '../src/domain/mapa/reglas/saqueo.js';
import { evento, radio1 } from '../src/domain/mapa/reglas/comun.js';
import { crearRng } from '../src/domain/mapa/rng.js';

const NOMBRE = 'Escenario saqueo';
const YO = 'nick-escenario';
const BOT = 'bot-ia';
const TAMANO = 14;

const repo = new MapGameRepo(db, 'sqlite');
repo.init();

// Arma el tablero sobre una partida ya iniciada. Devuelve null si la semilla
// dejo las capitales donde el escenario no entra (hace falta lugar al norte y
// a la izquierda de la capital, y distancia entre las dos).
function armar(estado) {
  for (const t of estado.mapa) t.terreno = 'plains';
  const capital = estado.mapa.find(t => t.ciudad && t.dueno === YO);
  const rival = estado.mapa.find(t => t.ciudad && t.dueno === BOT);
  const mx = capital.x - 1, my = capital.y;
  const vx = mx, vy = my - 1;
  if (mx < 1 || vy < 0) return null;
  if (Math.abs(rival.x - vx) + Math.abs(rival.y - vy) < 5) return null;

  // Dos casillas de mar, las dos pegadas a la ciudad rival.
  const mares = [{ x: mx, y: my }, { x: mx - 1, y: vy }];
  for (const m of mares) tileEn(estado, m.x, m.y).terreno = 'water';

  aplicar(estado, [
    evento('EdificioConstruido', estado, YO, { x: capital.x, y: capital.y, edificio: 'port' }),
    evento('CiudadFundada', estado, BOT, { x: vx, y: vy, nombre: 'Puerto rival' }),
    ...mares.map(m => evento('UnidadReclutada', estado, YO, { x: m.x, y: m.y, tipo: 'warship' })),
    // El jugador tiene que ver el mar y la ciudad rival para poder atacarla.
    evento('TerritorioDescubierto', estado, YO, {
      tiles: [...radio1(capital.x, capital.y), ...mares.flatMap(m => radio1(m.x, m.y)), ...radio1(vx, vy)]
        .filter(p => tileEn(estado, p.x, p.y)),
    }),
  ]);
  jugadorPorId(estado, BOT).recursos.gold = 100;
  return { vx, vy, mar: mares[0] };
}

function crearEscenario() {
  for (let i = 0; i < 400; i++) {
    const semilla = `escenario-saqueo-${i}`;
    const estado = crearEstado({
      nombre: NOMBRE, semilla,
      config: { tamanoMapa: TAMANO, maxJugadores: 2, contraIA: true, dificultadIA: 'normal' },
    });
    aplicar(estado, unirse(estado, { id: YO, nombre: 'Vos', civilizacion: 'Incas' }));
    aplicar(estado, unirse(estado, { id: BOT, nombre: 'La Máquina', civilizacion: 'Autómatas', esBot: true, dificultadIA: 'normal' }));
    aplicar(estado, iniciar(estado));

    const sitio = armar(estado);
    if (!sitio) continue;

    // Prueba en un clon: la primera tirada tiene que dar saqueo.
    const prueba = structuredClone(estado);
    const evs = atacar(prueba, YO,
      { desde: sitio.mar, hasta: { x: sitio.vx, y: sitio.vy } },
      crearRng(`combate:${semilla}:1:0`));
    if (!evs.some(ev => ev.tipo === 'CiudadSaqueada')) continue;

    estado.codigo = `ESC${String(i).padStart(3, '0')}`.slice(0, 6);
    repo.guardar(estado, estado.codigo);
    const token = crypto.randomBytes(32).toString('hex');
    repo.guardarToken(estado.id, YO, crypto.createHash('sha256').update(token).digest('hex'));
    return { estado, token, sitio };
  }
  throw new Error('No encontre una semilla que sirva en 400 intentos');
}

function resumen(estado) {
  console.log(`partida ${estado.id}  turno ${estado.turno}`);
  for (const t of estado.mapa.filter(t => t.ciudad)) {
    const duenoNombre = jugadorPorId(estado, t.dueno)?.nombre ?? t.dueno;
    const marca = t.ciudad.saqueadaHasta ?? '-';
    console.log(`  ${t.ciudad.nombre.padEnd(22)} (${t.x},${t.y}) de ${duenoNombre.padEnd(12)} ` +
      `saqueadaHasta=${String(marca).padEnd(3)} saqueada ahora: ${estaSaqueada(t.ciudad, estado.turno)}`);
  }
  for (const j of estado.jugadores) {
    const p = producirParaJugador(estado, j.id);
    console.log(`  ${j.nombre.padEnd(12)} oro ${String(j.recursos.gold).padEnd(5)} produce por ronda: ` +
      Object.entries(p).map(([r, c]) => `${r} ${c}`).join(', '));
  }
}

const args = process.argv.slice(2);
if (args[0] === '--ver') {
  let id = args[1];
  if (!id) {
    const fila = db.prepare(
      "SELECT id FROM map_games WHERE json_extract(estado_json, '$.nombre') = ? ORDER BY rowid DESC LIMIT 1"
    ).get(NOMBRE);
    if (!fila) { console.error('No hay ninguna partida de escenario. Corre sin argumentos para crear una.'); process.exit(1); }
    id = fila.id;
  }
  const estado = repo.cargar(id);
  if (!estado) { console.error(`No existe la partida ${id}`); process.exit(1); }
  resumen(estado);
} else {
  const { estado, token, sitio } = crearEscenario();
  resumen(estado);
  console.log(`\nTus buques estan en (${sitio.mar.x},${sitio.mar.y}) y (${sitio.mar.x - 1},${sitio.vy}). ` +
    `Ataca "Puerto rival" en (${sitio.vx},${sitio.vy}).`);
  console.log('\nPara abrirla en el navegador, pega esto en la consola de http://localhost:5174 y recarga:\n');
  console.log([
    `for (const k of ['id','codigo','jugadorId','token']) { const v = localStorage.getItem('cronicas-mapa-'+k); if (v !== null) localStorage.setItem('cronicas-mapa-'+k+'-previo', v); }`,
    `localStorage.setItem('cronicas-mapa-id', ${JSON.stringify(estado.id)});`,
    `localStorage.setItem('cronicas-mapa-codigo', ${JSON.stringify(estado.codigo)});`,
    `localStorage.setItem('cronicas-mapa-jugadorId', ${JSON.stringify(YO)});`,
    `localStorage.setItem('cronicas-mapa-token', ${JSON.stringify(token)});`,
  ].join('\n'));
}
