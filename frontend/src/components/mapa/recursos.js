// Como se le muestra un recurso al jugador: en español y con el mismo icono en
// todos lados. "40 gold" no se leia como un precio (visto jugando: se gastaban
// el oro sin querer).
export const RECURSO = {
  food: { icono: '🌾', nombre: 'comida' },
  gold: { icono: '💰', nombre: 'oro' },
  wood: { icono: '🌲', nombre: 'madera' },
  stone: { icono: '⛰️', nombre: 'piedra' },
  science: { icono: '🔬', nombre: 'ciencia' },
  culture: { icono: '🎭', nombre: 'cultura' }
}

// El oro propio se muestra con el nombre y el simbolo de la moneda del jugador
// (vista.jugadores[i].moneda). Sin moneda, como siempre.
export const recursoDe = (recurso, moneda = null) =>
  recurso === 'gold' && moneda
    ? { icono: moneda.simbolo, nombre: moneda.nombre }
    : RECURSO[recurso]

// { gold: 40, food: 20 } -> "💰 40 de oro · 🌾 20 de comida"
export const textoCosto = (costo, moneda = null) =>
  Object.entries(costo ?? {})
    .map(([r, m]) => {
      const info = recursoDe(r, moneda)
      return `${info?.icono ?? ''} ${m} de ${info?.nombre ?? r}`.trim()
    })
    .join(' · ')
