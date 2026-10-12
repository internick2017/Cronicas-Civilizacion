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

// { gold: 40, food: 20 } -> "💰 40 de oro · 🌾 20 de comida"
export const textoCosto = (costo) =>
  Object.entries(costo ?? {})
    .map(([r, m]) => `${RECURSO[r]?.icono ?? ''} ${m} de ${RECURSO[r]?.nombre ?? r}`.trim())
    .join(' · ')
