import { randomInt } from './crypto-navegador.js'

// El id de cada navegador en el broker de PeerJS es PREFIJO + codigo de sala: asi el codigo
// que se comparte entre amigos es lo unico que hace falta para encontrar al anfitrion.
export const PREFIJO = 'cronicas-civ-'
// Sin 0/O/1/I/L: el codigo se dicta por voz o se copia a mano.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function codigoDeSala() {
  let codigo = ''
  for (let i = 0; i < 6; i++) codigo += ALFABETO[randomInt(ALFABETO.length)]
  return codigo
}

export const normalizarCodigo = (texto) => String(texto ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
