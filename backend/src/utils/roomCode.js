import crypto from 'crypto';

// Sin I, L, O (confundibles con 1/0) — solo letras para poder dictarlo en voz alta.
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';

/**
 * Genera un código de sala de 5 letras.
 * @param {(code: string) => boolean} [exists] — predicado de colisión; si retorna
 *   true se genera otro código (máx. 50 intentos).
 */
export function generateRoomCode(exists = () => false) {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += ROOM_CODE_ALPHABET[crypto.randomInt(ROOM_CODE_ALPHABET.length)];
    }
    if (!exists(code)) return code;
  }
  throw new Error('No se pudo generar un código de sala único');
}
