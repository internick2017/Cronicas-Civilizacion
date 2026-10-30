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
    // 'Oro' es la moneda por defecto del backend: en minuscula como los demas recursos.
    ? { icono: moneda.simbolo, nombre: moneda.nombre === 'Oro' ? 'oro' : moneda.nombre }
    : RECURSO[recurso]

// { gold: 40, food: 20 } -> "💰 40 de oro · 🌾 20 de comida"
export const textoCosto = (costo, moneda = null) =>
  Object.entries(costo ?? {})
    .map(([r, m]) => {
      const info = recursoDe(r, moneda)
      return `${info?.icono ?? ''} ${m} de ${info?.nombre ?? r}`.trim()
    })
    .join(' · ')

// { stone: 40 } teniendo 30 -> "falta: 10 de piedra". Null si alcanza.
export const textoFalta = (costo, recursos, moneda = null) => {
  const faltan = Object.entries(costo ?? {})
    .map(([r, m]) => [r, m - (recursos[r] || 0)])
    .filter(([, falta]) => falta > 0)
    .map(([r, falta]) => `${falta} de ${recursoDe(r, moneda)?.nombre ?? r}`)
  return faltan.length ? `falta: ${faltan.join(' y ')}` : null
}
