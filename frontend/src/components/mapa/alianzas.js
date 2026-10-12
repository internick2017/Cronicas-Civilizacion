// Quien esta con quien, leido de la vista. Espejo de backend/reglas/bandos.js:
// la sesion lo usa para no ofrecer como ataque lo que el backend va a rechazar,
// y los paneles para mostrarlo.

export const aliadosDe = (vista, jugadorId) =>
  ((vista.alianzas ?? []).find(a => a.miembros.includes(jugadorId))?.miembros ?? [])
    .filter(id => id !== jugadorId)

// Con quien hay tregua (ex aliados): la vista solo trae las propias.
export const enTreguaCon = (vista) => (vista.treguas ?? []).map(t => t.con)

// El propio jugador mas todos con los que esta en paz: ni se atacan ni se quitan tierra.
export const amigosDe = (vista, jugadorId) =>
  new Set([jugadorId, ...aliadosDe(vista, jugadorId), ...enTreguaCon(vista)])

export const propuestasPara = (vista, jugadorId) =>
  (vista.propuestasAlianza ?? []).filter(p => p.para === jugadorId)
