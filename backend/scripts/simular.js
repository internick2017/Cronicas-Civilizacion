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
//
// --sin-armada apaga la flota de la maquina (topeBuques = 0 en las tres
// dificultades) sin tocar el mapa: es la comparacion que aisla el efecto de la
// armada, porque generar mapas sin mar cambiaria todo lo demas a la vez.

import { crearEstado } from '../src/domain/mapa/MapGame.js';
import { aplicar } from '../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../src/domain/mapa/reglas/partida.js';
import { jugarTurnoIA, PERFILES_DIFICULTAD } from '../src/domain/mapa/ia.js';
import { esCostera } from '../src/domain/mapa/reglas/comun.js';
import { crearRng } from '../src/domain/mapa/rng.js';

function leerArgs(argv) {
  const args = {
    partidas: 20,
    tamano: 20,
    dificultad: 'normal',
    semilla: 'lote',
    turnoMaximo: 300,
    sinArmada: false,
    islas: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sin-armada') { args.sinArmada = true; continue; }
    if (a === '--islas') { args.islas = true; continue; }
    const valor = argv[++i];
    if (a === '--partidas') args.partidas = Number(valor);
    else if (a === '--tamano') args.tamano = Number(valor);
    else if (a === '--dificultad') args.dificultad = valor;
    else if (a === '--semilla') args.semilla = valor;
    else if (a === '--turno-maximo') args.turnoMaximo = Number(valor);
  }
  return args;
}

function jugarPartida(semilla, { tamano, dificultad, turnoMaximo, islas }) {
  const e = crearEstado({ nombre: 'sim', semilla, config: { tamanoMapa: tamano, islas } });
  aplicar(e, unirse(e, { id: 'a', nombre: 'A', civilizacion: 'Incas', esBot: true, dificultadIA: dificultad }));
  aplicar(e, unirse(e, { id: 'b', nombre: 'B', civilizacion: 'Mayas', esBot: true, dificultadIA: dificultad }));
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
    ...metricas,
  };
}

const args = leerArgs(process.argv.slice(2));

if (args.sinArmada) {
  for (const perfil of Object.values(PERFILES_DIFICULTAD)) perfil.topeBuques = 0;
}

const resultados = [];
for (let i = 0; i < args.partidas; i++) {
  resultados.push(jugarPartida(`${args.semilla}-${i}`, args));
}

const terminadas = resultados.filter(r => r.termino);
const suma = (f) => resultados.reduce((a, r) => a + f(r), 0);
const promedio = (lista, f) => (lista.length ? lista.reduce((a, r) => a + f(r), 0) / lista.length : 0);

console.log(`\n== ${args.partidas} partidas | tamano ${args.tamano} | dificultad ${args.dificultad} | semillas "${args.semilla}-*"${args.sinArmada ? ' | SIN ARMADA' : ''}`);
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
