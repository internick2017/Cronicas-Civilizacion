import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

export class AIService {
  constructor() {
    this.isEnabled = !!process.env.OPENAI_API_KEY;
    this.model = process.env.OPENAI_MODEL || 'gpt-4';
    
    if (this.isEnabled) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    } else {
      console.log('ℹ️ OpenAI API key not found. Using fallback narratives.');
    }
  }

  /**
   * Generate narrative for a game action
   * @param {Object} actionData - The action data containing type, player, and details
   * @param {Object} gameContext - Current game state context
   * @returns {Promise<Object>} Generated narrative response
   */
  async generateActionNarrative(actionData, gameContext) {
    if (!this.isEnabled) {
      return this.getFallbackNarrative(actionData);
    }

    try {
      const prompt = this.buildActionPrompt(actionData, gameContext);
      
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt()
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 300,
        temperature: 0.8,
        presence_penalty: 0.1,
        frequency_penalty: 0.1
      });

      const narrative = response.choices[0].message.content.trim();
      
      return {
        success: true,
        narrative,
        effects: this.extractEffects(narrative),
        timestamp: new Date()
      };
    } catch (error) {
      console.error('OpenAI API Error:', error);
      return this.getFallbackNarrative(actionData);
    }
  }

  /**
   * Generate world events and consequences
   * @param {Object} gameState - Current game state
   * @returns {Promise<Object>} Generated world event
   */
  async generateWorldEvent(gameState) {
    if (!this.isEnabled) {
      return this.getFallbackWorldEvent();
    }

    try {
      const prompt = this.buildWorldEventPrompt(gameState);
      
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: this.getWorldEventSystemPrompt()
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 200,
        temperature: 0.9,
        presence_penalty: 0.2
      });

      const event = response.choices[0].message.content.trim();
      
      return {
        success: true,
        event,
        type: 'world_event',
        timestamp: new Date()
      };
    } catch (error) {
      console.error('OpenAI World Event Error:', error);
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
   * Fallback narrative when OpenAI is not available
   */
  getFallbackNarrative(actionData) {
    const { action, player } = actionData;
    
    const fallbackMessages = {
      found_city: `La civilización ${player.civilizationName} establece una nueva ciudad, expandiendo su influencia por el mundo conocido.`,
      collect_resources: `Los ciudadanos de ${player.civilizationName} trabajan diligentemente para recolectar los recursos necesarios para su civilización.`,
      move_army: `Las fuerzas militares de ${player.civilizationName} se desplazan estratégicamente por el territorio.`,
      build_infrastructure: `${player.civilizationName} invierte en el desarrollo de su infraestructura, fortaleciendo su civilización.`,
      diplomacy: `${player.civilizationName} establece nuevas relaciones diplomáticas que podrían cambiar el equilibrio de poder.`,
      free_action: `${player.civilizationName} toma una acción decisiva que resonará a través de la historia.`
    };

    return {
      success: true,
      narrative: fallbackMessages[action.type] || `${player.civilizationName} ha realizado una acción significativa.`,
      effects: {},
      timestamp: new Date(),
      fallback: true
    };
  }

  /**
   * Fallback world event when OpenAI is not available
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
    return this.isEnabled;
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      enabled: this.isEnabled,
      model: this.model,
      configured: this.isConfigured()
    };
  }
}

export default new AIService(); 