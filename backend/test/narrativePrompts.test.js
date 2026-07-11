import { describe, it, expect } from 'vitest';
import { getNarratorSystemPrompt, getEpiloguePrompt, getOpeningPrompt,
  getClosingArcsInstruction, getSummaryPrompt } from '../src/services/narrativePrompts.js';

describe('prompts por idioma', () => {
  it('es: narrador en español', () => {
    const p = getNarratorSystemPrompt('es', 'fantasy');
    expect(p).toContain('español');
    expect(p).toContain('fantasía');
  });

  it('pt: narrador en portugués', () => {
    const p = getNarratorSystemPrompt('pt', 'fantasy');
    expect(p).toContain('português');
    expect(p).toContain('fantasia');
  });

  it('idioma desconocido cae a español', () => {
    expect(getNarratorSystemPrompt('fr', 'mystery')).toContain('español');
  });

  it('epílogo respeta idioma', () => {
    expect(getEpiloguePrompt('pt')).toContain('epílogo');
    expect(getEpiloguePrompt('pt')).toContain('português');
  });

  it('el narrador tiene instrucciones de coherencia en ambos idiomas', () => {
    expect(getNarratorSystemPrompt('es', 'fantasy')).toContain('coherencia');
    expect(getNarratorSystemPrompt('pt', 'fantasy')).toContain('coerência');
  });

  it('el narrador tiene prohibido repetir lo ya narrado (es y pt)', () => {
    expect(getNarratorSystemPrompt('es', 'fantasy')).toMatch(/NUNCA repitas/);
    expect(getNarratorSystemPrompt('pt', 'fantasy')).toMatch(/NUNCA repita/);
  });

  it('narrador-activo agrega la instrucción de evento (es y pt); colaborativo no', () => {
    const esActivo = getNarratorSystemPrompt('es', 'fantasy', 'narrador-activo');
    expect(esActivo).toContain('evento');
    expect(esActivo).toContain('protagonismo');
    const ptActivo = getNarratorSystemPrompt('pt', 'fantasy', 'narrador-activo');
    expect(ptActivo).toContain('evento');
    const colaborativo = getNarratorSystemPrompt('es', 'fantasy', 'colaborativo');
    expect(colaborativo).not.toContain('protagonismo');
  });

  it('la apertura en narrador-activo termina con el primer evento', () => {
    expect(getOpeningPrompt('es', 'fantasy', 'narrador-activo')).toContain('primer evento');
    expect(getOpeningPrompt('pt', 'fantasy', 'narrador-activo')).toContain('primeiro evento');
    expect(getOpeningPrompt('es', 'fantasy', 'colaborativo')).not.toContain('primer evento');
  });

  it('instrucción de cierre de arcos según rondas restantes (es y pt)', () => {
    expect(getClosingArcsInstruction('es', 2)).toContain('2');
    expect(getClosingArcsInstruction('es', 2)).toContain('arcos');
    expect(getClosingArcsInstruction('pt', 1)).toContain('arcos');
  });

  it('prompt de resumen pide máximo 150 palabras (es y pt)', () => {
    expect(getSummaryPrompt('es')).toContain('150');
    expect(getSummaryPrompt('pt')).toContain('150');
  });
});
