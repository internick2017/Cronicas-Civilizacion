import { GeminiClient } from './GeminiClient.js';
import config from '../config/index.js';
import { getNarratorSystemPrompt, getOpeningPrompt, getEpiloguePrompt, getSummaryPrompt } from './narrativePrompts.js';

export class AIService {
  constructor() {
    this.gemini = new GeminiClient(config.gemini);
  }

  /**
   * Generate narrative for a game action
   * @param {Object} actionData - The action data containing type, player, and details
   * @param {Object} gameContext - Current game state context
   * @returns {Promise<Object>} Generated narrative response
   */
  async generateActionNarrative(actionData, gameContext) {
    console.log('🤖 AI Service - isEnabled:', this.gemini.isConfigured());

    if (!this.gemini.isConfigured()) {
      console.log('🤖 AI Service - Using fallback (not enabled)');
      return this.getFallbackNarrative(actionData);
    }

    try {
      const prompt = this.buildActionPrompt(actionData, gameContext);

      const narrative = await this.gemini.generate(prompt, {
        systemPrompt: this.getSystemPrompt(),
        temperature: 0.8,
        maxOutputTokens: 400,
      });

      return {
        success: true,
        narrative,
        effects: this.extractEffects(narrative),
        timestamp: new Date()
      };
    } catch (error) {
      console.error('🔴 Gemini API Error:', error.message);
      console.log('🤖 Falling back to generic narrative');
      return this.getFallbackNarrative(actionData);
    }
  }

  /**
   * Generate story narrative for the narrative/collaborative mode.
   * Uses language- and genre-aware system prompts.
   * @param {string} prompt - The assembled story prompt
   * @param {Object} [options]
   * @param {string} [options.language='es'] - 'es' | 'pt'
   * @param {string} [options.genre='fantasy']
   * @returns {Promise<string|null>} Generated narrative text,
   *   or null cuando la IA no está configurada; el caller debe usar el fallback.
   */
  async generateStoryNarrative(prompt, { language = 'es', genre = 'fantasy', mode = 'colaborativo' } = {}) {
    if (!this.gemini.isConfigured()) {
      return null; // caller must handle fallback
    }

    return await this.gemini.generate(prompt, {
      systemPrompt: getNarratorSystemPrompt(language, genre, mode),
      temperature: 0.8,
      maxOutputTokens: 400,
    });
  }

  /**
   * Generate the opening narrative for a new story session.
   * @param {Object} [options]
   * @param {string} [options.language='es']
   * @param {string} [options.genre='fantasy']
   * @returns {Promise<string|null>} null cuando la IA no está configurada.
   */
  async generateOpening({ language = 'es', genre = 'fantasy', mode = 'colaborativo' } = {}) {
    if (!this.gemini.isConfigured()) return null;
    return await this.gemini.generate(getOpeningPrompt(language, genre, mode), {
      systemPrompt: getNarratorSystemPrompt(language, genre, mode),
      temperature: 0.9,
      maxOutputTokens: 300,
    });
  }

  /**
   * Generate or update the running story summary.
   * @param {string} previousSummary - The existing synopsis (may be empty)
   * @param {string} newNarrative - The latest AI narrative to incorporate
   * @param {Object} [options]
   * @param {string} [options.language='es']
   * @returns {Promise<string|null>} Updated synopsis string, or null when the IA is not configured.
   */
  async generateSummary(previousSummary, newNarrative, { language = 'es' } = {}) {
    if (!this.gemini.isConfigured()) return null;
    const prompt = `SINOPSIS ACTUAL:\n${previousSummary || '(la historia recién comienza)'}\n\n` +
      `HECHOS NUEVOS:\n${newNarrative}`;
    return await this.gemini.generate(prompt, {
      systemPrompt: getSummaryPrompt(language),
      temperature: 0.4,
      maxOutputTokens: 250,
    });
  }

  /**
   * Generate the epilogue narrative for a completed story session.
   * @param {string} storySummary - The story so far (AI narrative entries joined)
   * @param {Object} [options]
   * @param {string} [options.language='es']
   * @param {string} [options.genre='fantasy']
   * @returns {Promise<string|null>} null cuando la IA no está configurada.
   */
  async generateEpilogue(storySummary, { language = 'es', genre = 'fantasy' } = {}) {
    if (!this.gemini.isConfigured()) return null;
    return await this.gemini.generate(
      `${getEpiloguePrompt(language)}\n\nHISTORIA:\n${storySummary}`,
      { systemPrompt: getNarratorSystemPrompt(language, genre), temperature: 0.8, maxOutputTokens: 400 }
    );
  }

  /**
   * Generate world events and consequences
   * @param {Object} gameState - Current game state
   * @returns {Promise<Object>} Generated world event
   */
  async generateWorldEvent(gameState) {
    if (!this.gemini.isConfigured()) {
      return this.getFallbackWorldEvent();
    }

    try {
      const prompt = this.buildWorldEventPrompt(gameState);

      const event = await this.gemini.generate(prompt, {
        systemPrompt: this.getWorldEventSystemPrompt(),
        temperature: 0.9,
        maxOutputTokens: 400,
      });

      return {
        success: true,
        event,
        type: 'world_event',
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Gemini World Event Error:', error);
      return this.getFallbackWorldEvent();
    }
  }

  /**
   * Build system prompt for action narratives
   */
  getSystemPrompt() {
    return `You are the narrator for "Crónicas de Civilización", a turn-based strategy game.
Your role is to create engaging, immersive narratives for player actions.

Guidelines:
- Write in Spanish with epic, historical tone
- Keep responses under 200 words
- Focus on consequences and world-building
- Include sensory details and emotional impact
- Mention specific civilization names and locations when relevant
- Create continuity with previous actions
- End with hints about future possibilities

Resources: Comida, Oro, Madera, Piedra, Ciencia, Cultura, Ejército
Victory conditions: Dominio (60% territorio), Ciencia (1000 pts), Cultura (800 pts), Economía (1500 oro)`;
  }

  /**
   * Build system prompt for world events
   */
  getWorldEventSystemPrompt() {
    return `You are the world narrator for "Crónicas de Civilización". Generate random world events that affect all civilizations.

Guidelines:
- Write in Spanish with dramatic, historical tone
- Keep under 150 words
- Create events that impact resources, diplomacy, or strategy
- Include natural disasters, discoveries, or political changes
- Make events feel consequential but balanced
- Reference the medieval/ancient world setting`;
  }

  /**
   * Build prompt for specific action
   */
  buildActionPrompt(actionData, gameContext) {
    const { action, player, result } = actionData;
    const { currentTurn, mapSize, totalPlayers } = gameContext;

    let prompt = `Turno ${currentTurn}: La civilización ${player.civilizationName} ha realizado la acción: ${action.type}.\n\n`;

    switch (action.type) {
      case 'found_city':
        prompt += `Han fundado la ciudad "${action.cityName}" en las coordenadas (${action.x}, ${action.y}). `;
        prompt += `Recursos iniciales: ${JSON.stringify(result.resources)}. `;
        break;
      case 'collect_resources':
        prompt += `Han recolectado recursos en (${action.x}, ${action.y}). `;
        prompt += `Recursos obtenidos: ${JSON.stringify(result.resourcesGained)}. `;
        break;
      case 'move_army':
        prompt += `Han movido su ejército desde (${action.fromX}, ${action.fromY}) hasta (${action.toX}, ${action.toY}). `;
        if (result.battle) {
          prompt += `Batalla: ${result.battle.outcome}. `;
        }
        break;
      case 'build_infrastructure':
        prompt += `Han construido ${action.buildingType} en (${action.x}, ${action.y}). `;
        prompt += `Coste: ${JSON.stringify(action.cost)}. `;
        break;
      case 'diplomacy':
        prompt += `Han establecido ${action.diplomaticAction} con otra civilización. `;
        break;
      case 'free_action':
        prompt += `Acción libre: "${action.description}". `;
        break;
    }

    prompt += `\nContexto del juego: Mapa ${mapSize}x${mapSize}, ${totalPlayers} civilizaciones, turno ${currentTurn}.\n`;
    prompt += `Recursos actuales del jugador: ${JSON.stringify(player.resources)}.\n\n`;
    prompt += `Narra las consecuencias de esta acción de manera épica y envolvente.`;

    return prompt;
  }

  /**
   * Build prompt for world events
   */
  buildWorldEventPrompt(gameState) {
    const { currentTurn, players, mapSize } = gameState;
    const activePlayers = players.filter(p => p.isActive).length;

    return `Turno ${currentTurn} en un mundo de ${mapSize}x${mapSize} con ${activePlayers} civilizaciones activas.

Estado del mundo:
- Civilizaciones más poderosas: ${players.slice(0, 2).map(p => p.civilizationName).join(', ')}
- Recursos escasos detectados en el mundo
- Tensiones diplomáticas crecientes

Genera un evento mundial que afecte a todas las civilizaciones de manera interesante y equilibrada.`;
  }

  /**
   * Extract game effects from narrative (placeholder for future enhancement)
   */
  extractEffects(narrative) {
    // Future: Use AI to extract structured effects from narrative
    return {
      resourceChanges: {},
      diplomaticChanges: {},
      worldChanges: {}
    };
  }

  /**
   * Fallback narrative when Gemini is not available
   */
  getFallbackNarrative(actionData) {
    const { action, player } = actionData;
    const playerName = player.civilizationName || player.characterName || player.name || 'El jugador';

    // Enhanced fallback narratives with more variety
    const storyNarratives = [
      `Las palabras de ${playerName} resuenan por las tierras conocidas. Su declaración sobre el descubrimiento de América marca un punto de inflexión en la historia. Los vientos del océano parecen sussurrar secretos de nuevas tierras, mientras las estrellas brillan con promesas de aventuras épicas.`,

      `${playerName}, el audaz explorador, proclama su hazaña ante el mundo. Sus ojos brillan con la fuerza de quien ha visto horizontes que otros solo pueden imaginar. Las crónicas de esta civilización ahora incluirán relatos de tierras más allá del gran mar.`,

      `La historia se detiene un momento para escuchar las palabras de ${playerName}. El eco de su proclamación viajará de aldea en aldea, de reino en reino, llevando noticias de nuevos mundos y posibilidades infinitas. Los cronistas afilan sus plumas para registrar este momento trascendental.`,

      `Con la determinación de los grandes navegantes, ${playerName} comparte su visión del mundo expandido. Las cartas geográficas deberán ser redibujadas, las concepciones del mundo replanteadas. Esta es la hora en que las leyendas nacen y los destinos se forjan.`,

      `${playerName} se alza como una figura legendaria en los anales de la historia. Su proclamación sobre América reverberará a través de los siglos, inspirando a futuras generaciones de exploradores y soñadores. Los vientos del cambio soplan, llevando consigo el aroma de nuevas aventuras.`
    ];

    // Select a random narrative or specific one based on action content
    let selectedNarrative;
    if (action.description && action.description.toLowerCase().includes('america')) {
      selectedNarrative = storyNarratives[Math.floor(Math.random() * storyNarratives.length)];
    } else {
      // Generic fallbacks for other actions
      const fallbackMessages = {
        found_city: `La civilización ${playerName} establece una nueva ciudad, expandiendo su influencia por el mundo conocido.`,
        collect_resources: `Los ciudadanos de ${playerName} trabajan diligentemente para recolectar los recursos necesarios para su civilización.`,
        move_army: `Las fuerzas militares de ${playerName} se desplazan estratégicamente por el territorio.`,
        build_infrastructure: `${playerName} invierte en el desarrollo de su infraestructura, fortaleciendo su civilización.`,
        diplomacy: `${playerName} establece nuevas relaciones diplomáticas que podrían cambiar el equilibrio de poder.`,
        free_action: `${playerName} toma una acción decisiva que resonará a través de la historia.`,
        story_action: storyNarratives[Math.floor(Math.random() * storyNarratives.length)]
      };

      selectedNarrative = fallbackMessages[action.type] || `${playerName} ha realizado una acción significativa.`;
    }

    return {
      success: true,
      narrative: selectedNarrative,
      effects: {},
      timestamp: new Date(),
      fallback: true
    };
  }

  /**
   * Fallback world event when Gemini is not available
   */
  getFallbackWorldEvent() {
    const events = [
      'Un comerciante errante trae noticias de tierras lejanas, inspirando a todas las civilizaciones.',
      'Las estaciones cambian, afectando la producción de recursos en todo el mundo.',
      'Se descubren antiguas ruinas que contienen secretos del pasado.',
      'Los vientos del cambio soplan, alterando las relaciones entre las civilizaciones.',
      'Un eclipse solar genera presagios y supersticiones entre los pueblos.'
    ];

    return {
      success: true,
      event: events[Math.floor(Math.random() * events.length)],
      type: 'world_event',
      timestamp: new Date(),
      fallback: true
    };
  }

  /**
   * Check if AI service is properly configured
   */
  isConfigured() {
    return this.gemini.isConfigured();
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      enabled: this.gemini.isConfigured(),
      model: config.gemini.model,
      configured: this.isConfigured()
    };
  }
}

export default new AIService();
