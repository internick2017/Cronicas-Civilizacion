import { describe, it, expect } from 'vitest';
import { generateRoomCode, ROOM_CODE_ALPHABET } from '../src/utils/roomCode.js';

describe('generateRoomCode', () => {
  it('genera códigos de 5 caracteres del alfabeto sin ambiguos', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(5);
      for (const ch of code) expect(ROOM_CODE_ALPHABET).toContain(ch);
    }
  });

  it('no contiene caracteres ambiguos I, L, O, 0, 1', () => {
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[ILO01]/);
  });

  it('reintenta hasta dar un código que no exista', () => {
    const existing = new Set();
    const first = generateRoomCode(c => existing.has(c));
    existing.add(first);
    const second = generateRoomCode(c => existing.has(c));
    expect(second).not.toBe(first);
  });
});
