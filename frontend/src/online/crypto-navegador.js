// Reemplazo de 'crypto' de Node para el navegador (ver el alias en vite.config.js).
// Solo ofrece lo que usan MapGame.js y MapGameService.js: randomUUID, randomInt,
// randomBytes y createHash('sha256').update(x).digest('hex').
//
// shortcut: el "hash" NO es sha256 real, es un mezclador simple (cyrb53 x4). Alcanza
// porque los tokens viven solo en la memoria del anfitrion y miden 256 bits al azar;
// si alguna vez se guardan en un lugar compartido, cambiar por un sha256 de verdad.
const web = globalThis.crypto

// getRandomValues sirve tambien por HTTP plano; randomUUID solo en contexto seguro
// (las tablets de la casa entran por HTTP), por eso el respaldo.
export function randomUUID() {
  if (web.randomUUID) return web.randomUUID()
  const b = web.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

// Entero uniforme en [0, max) sin sesgo (descarta los valores que sobran).
export function randomInt(max) {
  const limite = Math.floor(0x100000000 / max) * max
  const buf = new Uint32Array(1)
  do { web.getRandomValues(buf) } while (buf[0] >= limite)
  return buf[0] % max
}

export function randomBytes(n) {
  const bytes = web.getRandomValues(new Uint8Array(n))
  return { toString: () => [...bytes].map(x => x.toString(16).padStart(2, '0')).join('') }
}

function cyrb53(str, semilla) {
  let h1 = 0xdeadbeef ^ semilla
  let h2 = 0x41c6ce57 ^ semilla
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
}

export function hashToken(valor) {
  const s = String(valor ?? '')
  return [0, 1, 2, 3].map(i => cyrb53(s, i)).join('')
}

export function createHash() {
  let acumulado = ''
  return {
    update(x) { acumulado += String(x); return this },
    digest() { return hashToken(acumulado) },
  }
}

export default { randomUUID, randomInt, randomBytes, createHash }
