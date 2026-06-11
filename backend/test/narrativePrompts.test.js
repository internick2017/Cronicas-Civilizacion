import { describe, it, expect } from 'vitest';
import { getNarratorSystemPrompt, getEpiloguePrompt } from '../src/services/narrativePrompts.js';

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
});
