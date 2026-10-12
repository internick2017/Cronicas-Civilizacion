// Quien esta con quien. Modulo hoja (no importa otras reglas) porque lo
// consultan el combate, el movimiento, las fronteras, la victoria, la vista y
// la IA: si importara algo de ellos habria un ciclo.
//
// Una ALIANZA es un grupo ({ miembros: [ids] }) y cada jugador esta en una
// sola: asi "ganan juntos" tiene un significado unico (con pactos de a pares,
// A-B y B-C sin A-C no se sabria quien gana con quien).
// Una TREGUA es lo que queda al romper: { a, b, hasta } impide que se ataquen
// hasta que termine la ronda `hasta`.
//
// Una partida guardada antes de que existieran no trae ninguno de los campos.

export const alianzasDe = (estado) => estado.alianzas ?? [];
export const propuestasDe = (estado) => estado.propuestasAlianza ?? [];
export const treguasDe = (estado) => estado.treguas ?? [];

export const alianzaDe = (estado, jugadorId) =>
  alianzasDe(estado).find(a => a.miembros.includes(jugadorId)) ?? null;

export const aliadosDe = (estado, jugadorId) =>
  (alianzaDe(estado, jugadorId)?.miembros ?? []).filter(id => id !== jugadorId);

export const sonAliados = (estado, a, b) => a !== b && aliadosDe(estado, a).includes(b);

export const enTregua = (estado, a, b) => treguasDe(estado).some(t =>
  t.hasta >= estado.turno && ((t.a === a && t.b === b) || (t.a === b && t.b === a)));

// En paz = no se pueden atacar ni quitarse tierra: aliados, o en tregua.
export const enPaz = (estado, a, b) => sonAliados(estado, a, b) || enTregua(estado, a, b);

// El propio jugador mas todos con los que esta en paz. Para quien pregunta por
// muchas casillas seguidas (la IA, las fronteras): se arma una vez y se consulta.
export function amigosDe(estado, jugadorId) {
  const amigos = new Set([jugadorId, ...aliadosDe(estado, jugadorId)]);
  for (const t of treguasDe(estado)) {
    if (t.hasta < estado.turno) continue;
    if (t.a === jugadorId) amigos.add(t.b);
    if (t.b === jugadorId) amigos.add(t.a);
  }
  return amigos;
}

// Los bandos que disputan la partida: cada alianza es uno, y cada jugador sin
// alianza es un bando de uno. Solo cuenta a los jugadores de `activos`.
export function bandosDe(estado, activos) {
  const bandos = [];
  const vistos = new Set();
  for (const jugador of activos) {
    if (vistos.has(jugador.id)) continue;
    const aliados = new Set(aliadosDe(estado, jugador.id));
    const bando = activos.filter(j => j.id === jugador.id || aliados.has(j.id));
    for (const j of bando) vistos.add(j.id);
    bandos.push(bando);
  }
  return bandos;
}
