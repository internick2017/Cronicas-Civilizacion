// Arnes de simulacion: juega N partidas completas de bot contra bot sobre el
// dominio puro (sin base de datos ni HTTP) y mide el estado final.
//
// Por que vive en el repo y no es un script descartable: casi todos los bugs
// importantes de este juego salieron de simular y medir, no de leer el codigo,
// y hasta ahora el script se tiraba despues de cada investigacion y habia que
// reescribirlo. Los numeros que ya estan anotados en los ADR y en la memoria
// del proyecto salieron de corridas como esta.
//
// La regla de oro al usarlo: comparar SIEMPRE contra un lote de semillas
// FRESCO, no contra las semillas con las que se venia iterando. Un cambio de
// la IA dio 8/8 en las 8 semillas de trabajo y 18/20 en 20 nuevas, que era
// exactamente el resultado de antes de tocar nada.
//
// Uso:
//   node scripts/simular.js
//   node scripts/simular.js --partidas 20 --tamano 20 --dificultad normal
//   node scripts/simular.js --semilla lote-b --sin-armada
//   node scripts/simular.js --raza-a orcos --raza-b elfos --partidas 40
//   node scripts/simular.js --matriz --partidas 30
//
// --matriz juega TODOS los cruces de razas en los DOS asientos (el primer
// jugador mueve primero y eso pesa) y reparte las victorias por raza. Una raza
// sana gana cerca del 50% de los cruces; mucho mas o mucho menos es desbalance.
// Ojo con el ruido: con menos de ~100 partidas por raza, tomarlo como orientativo.
//
// --sin-armada apaga la flota de la maquina (topeBuques = 0 en las tres
// dificultades) sin tocar el mapa: es la comparacion que aisla el efecto de la
// armada, porque generar mapas sin mar cambiaria todo lo demas a la vez.
//
// --sin-mecanicas apaga las seis casillas elegibles (ciencia, cultura, armada,
// alianzas, moneda, capital) al crear la partida: es el modo "guerra pura".

import { crearEstado } from '../src/domain/mapa/MapGame.js';
import { aplicar } from '../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../src/domain/mapa/reglas/partida.js';
import { jugarTurnoIA, PERFILES_DIFICULTAD } from '../src/domain/mapa/ia.js';
import { esCostera } from '../src/domain/mapa/reglas/comun.js';
import { crearRng } from '../src/domain/mapa/rng.js';
import { RAZAS } from '../src/domain/mapa/constantes.js';

function leerArgs(argv) {
  const args = {
    partidas: 20,
    tamano: 20,
    dificultad: 'normal',
    semilla: 'lote',
    turnoMaximo: 300,
    sinArmada: false,
    sinMecanicas: false,
    islas: false,
    razaA: null,
    razaB: null,
    matriz: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sin-armada') { args.sinArmada = true; continue; }
    if (a === '--sin-mecanicas') { args.sinMecanicas = true; continue; }
    if (a === '--islas') { args.islas = true; continue; }
    if (a === '--matriz') { args.matriz = true; continue; }
    const valor = argv[++i];
    if (a === '--partidas') args.partidas = Number(valor);
    else if (a === '--tamano') args.tamano = Number(valor);
    else if (a === '--dificultad') args.dificultad = valor;
    else if (a === '--semilla') args.semilla = valor;
    else if (a === '--turno-maximo') args.turnoMaximo = Number(valor);
    else if (a === '--raza-a') args.razaA = valor;
    else if (a === '--raza-b') args.razaB = valor;
  }
  return args;
}

function jugarPartida(semilla, { tamano, dificultad, turnoMaximo, islas, sinMecanicas = false, razaA = null, razaB = null }) {
  const mecanicas = sinMecanicas
    ? { ciencia: false, cultura: false, armada: false, alianzas: false, moneda: false, capital: false }
    : undefined;
  const e = crearEstado({ nombre: 'sim', semilla, config: { tamanoMapa: tamano, islas, ...(mecanicas && { mecanicas }) } });
  aplicar(e, unirse(e, { id: 'a', nombre: 'A', civilizacion: 'Incas', raza: razaA, esBot: true, dificultadIA: dificultad }));
  aplicar(e, unirse(e, { id: 'b', nombre: 'B', civilizacion: 'Mayas', raza: razaB, esBot: true, dificultadIA: dificultad }));
  aplicar(e, iniciar(e));

  const rng = crearRng(`sim:${semilla}`);
  const metricas = {
    combatesNavales: 0, combatesTotales: 0,
    buques: 0, puertos: 0,
    saqueos: 0, oroSaqueado: 0,
    capturas: 0, capturasCosteras: 0,
    transportes: 0, embarques: 0, desembarcos: 0,
  };
  // Con islas, importa saber si las capitales quedaron REALMENTE separadas: la
  // reparticion cae al comportamiento de siempre cuando la semilla no da dos
  // masas jugables, y una partida asi no prueba nada sobre invasiones.
  const masaDe = (t) => {
    const vistos = new Set([`${t.x},${t.y}`]); const cola = [t];
    for (let i = 0; i < cola.length; i++) {
      const a = cola[i];
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const v = e.mapa.find(m => m.x === a.x + dx && m.y === a.y + dy);
        if (v && v.terreno !== 'water' && !vistos.has(`${v.x},${v.y}`)) { vistos.add(`${v.x},${v.y}`); cola.push(v); }
      }
    }
    return vistos;
  };
  const capitales = e.mapa.filter(t => t.ciudad);
  const separadas = capitales.length === 2 && !masaDe(capitales[0]).has(`${capitales[1].x},${capitales[1].y}`);

  // El bucle corta por estado terminado o por tope de turnos. El tope es un
  // backstop: una partida que lo alcanza cuenta como NO terminada, que es
  // justamente una de las cosas que interesa medir.
  while (e.estado === 'jugando' && e.turno <= turnoMaximo) {
    const actual = e.jugadores[e.indiceJugadorActual];
    const eventos = jugarTurnoIA(e, actual.id, rng);
    for (const ev of eventos) {
      const d = ev.datos ?? {};
      if (ev.tipo === 'CombateResuelto') {
        metricas.combatesTotales++;
        if (d.naval) metricas.combatesNavales++;
      } else if (ev.tipo === 'UnidadReclutada' && d.tipo === 'warship') metricas.buques++;
      else if (ev.tipo === 'EdificioConstruido' && d.edificio === 'port') metricas.puertos++;
      else if (ev.tipo === 'CiudadSaqueada') { metricas.saqueos++; metricas.oroSaqueado += d.oro ?? 0; }
      else if (ev.tipo === 'UnidadReclutada' && d.tipo === 'transport') metricas.transportes++;
      else if (ev.tipo === 'TropaEmbarcada') metricas.embarques++;
      else if (ev.tipo === 'TropaDesembarcada') metricas.desembarcos++;
      else if (ev.tipo === 'CiudadCapturada') {
        metricas.capturas++;
        // El terreno no cambia durante la partida, asi que preguntar por la
        // costa al final da la misma respuesta que en el momento del evento.
        if (esCostera(e, d.x, d.y)) metricas.capturasCosteras++;
      }
    }
  }

  return {
    separadas,
    termino: e.estado === 'terminado',
    turnos: e.turno,
    tipoVictoria: e.ganador?.tipoVictoria ?? null,
    ganador: e.ganador?.jugadorId ?? null, // 'a' | 'b' | null
    ...metricas,
  };
}

const args = leerArgs(process.argv.slice(2));

if (args.sinArmada) {
  for (const perfil of Object.values(PERFILES_DIFICULTAD)) perfil.topeBuques = 0;
}

if (args.matriz) {
  // Todos los cruces entre razas distintas, en los dos asientos. Las MISMAS
  // semillas para cada cruce: asi la unica diferencia entre dos corridas es la raza.
  const ids = Object.keys(RAZAS);
  const tabla = Object.fromEntries(ids.map(id => [id, { gana: 0, juega: 0, contra: {} }]));
  for (const ra of ids) {
    for (const rb of ids) {
      if (ra === rb) continue;
      let ganaA = 0; let ganaB = 0; let sinGanador = 0;
      for (let i = 0; i < args.partidas; i++) {
        const r = jugarPartida(`${args.semilla}-${i}`, { ...args, razaA: ra, razaB: rb });
        if (r.ganador === 'a') ganaA++; else if (r.ganador === 'b') ganaB++; else sinGanador++;
      }
      tabla[ra].gana += ganaA; tabla[ra].juega += ganaA + ganaB;
      tabla[rb].gana += ganaB; tabla[rb].juega += ganaA + ganaB;
      tabla[ra].contra[rb] = (tabla[ra].contra[rb] ?? { gana: 0, juega: 0 });
      tabla[ra].contra[rb].gana += ganaA; tabla[ra].contra[rb].juega += ganaA + ganaB;
      tabla[rb].contra[ra] = (tabla[rb].contra[ra] ?? { gana: 0, juega: 0 });
      tabla[rb].contra[ra].gana += ganaB; tabla[rb].contra[ra].juega += ganaA + ganaB;
      console.log(`${ra.padEnd(7)} (asiento 1) vs ${rb.padEnd(7)} (asiento 2): ${ganaA}-${ganaB}` +
        (sinGanador ? ` (${sinGanador} sin ganador)` : ''));
    }
  }
  const pct = (g, j) => (j ? `${Math.round((100 * g) / j)}%` : '-');
  console.log(`\n== MATRIZ | ${args.partidas} partidas por cruce y asiento | tamano ${args.tamano} | ${args.dificultad} | semillas "${args.semilla}-*"`);
  console.log('victorias por raza (50% = equilibrada):');
  for (const id of ids) {
    const t = tabla[id];
    const contra = ids.filter(o => o !== id).map(o => `${o} ${pct(t.contra[o].gana, t.contra[o].juega)}`).join(', ');
    console.log(`  ${id.padEnd(7)} ${pct(t.gana, t.juega).padStart(4)}  (${t.gana}/${t.juega})   vs: ${contra}`);
  }
  process.exit(0);
}

const resultados = [];
for (let i = 0; i < args.partidas; i++) {
  resultados.push(jugarPartida(`${args.semilla}-${i}`, args));
}

const terminadas = resultados.filter(r => r.termino);
const suma = (f) => resultados.reduce((a, r) => a + f(r), 0);
const promedio = (lista, f) => (lista.length ? lista.reduce((a, r) => a + f(r), 0) / lista.length : 0);

console.log(`\n== ${args.partidas} partidas | tamano ${args.tamano} | dificultad ${args.dificultad} | semillas "${args.semilla}-*"${args.sinArmada ? ' | SIN ARMADA' : ''}${args.sinMecanicas ? ' | SIN MECANICAS' : ''}`);
if (args.razaA || args.razaB) {
  const gana = (id) => resultados.filter(r => r.ganador === id).length;
  console.log(`razas                      A=${args.razaA ?? 'sin raza'} (asiento 1) vs B=${args.razaB ?? 'sin raza'} (asiento 2)`);
  console.log(`victorias                  A ${gana('a')} | B ${gana('b')} | sin ganador ${resultados.length - gana('a') - gana('b')}`);
}
console.log(`terminadas                 ${terminadas.length}/${resultados.length}`);
console.log(`turnos hasta la victoria   ${promedio(terminadas, r => r.turnos).toFixed(1)} promedio` +
  (terminadas.length ? ` (min ${Math.min(...terminadas.map(r => r.turnos))}, max ${Math.max(...terminadas.map(r => r.turnos))})` : ''));
const porVictoria = {};
for (const r of terminadas) porVictoria[r.tipoVictoria] = (porVictoria[r.tipoVictoria] ?? 0) + 1;
console.log(`tipo de victoria           ${JSON.stringify(porVictoria)}`);
console.log(`--- el mar se usa? ---`);
console.log(`puertos construidos        ${suma(r => r.puertos)}`);
console.log(`buques botados             ${suma(r => r.buques)}`);
console.log(`combates navales           ${suma(r => r.combatesNavales)} de ${suma(r => r.combatesTotales)} combates`);
console.log(`saqueos                    ${suma(r => r.saqueos)} (${suma(r => r.oroSaqueado)} de oro)`);
console.log(`capturas de ciudad         ${suma(r => r.capturas)}, de ellas costeras ${suma(r => r.capturasCosteras)}`);
console.log(`partidas con algo naval    ${resultados.filter(r => r.buques > 0).length}/${resultados.length}`);
if (args.islas) {
  // `separadas` es la unica columna que dice si la partida probaba algo: el
  // reparto por islas CAE al comportamiento de siempre cuando la semilla no da
  // dos masas de tierra jugables, y en esas partidas no hay nada que invadir.
  const sep = resultados.filter(r => r.separadas);
  console.log(`--- se cruza el mar? ---`);
  console.log(`capitales en islas distintas ${sep.length}/${resultados.length}`);
  console.log(`transportes botados          ${suma(r => r.transportes)}`);
  console.log(`embarques                    ${suma(r => r.embarques)}`);
  console.log(`DESEMBARCOS                  ${suma(r => r.desembarcos)}`);
  console.log(`partidas con desembarco      ${resultados.filter(r => r.desembarcos > 0).length}/${resultados.length}`);
  console.log(`de las separadas, terminadas ${sep.filter(r => r.termino).length}/${sep.length || 0}`);
}
console.log('');
