/**
 * Language-aware prompt builders for the narrative AI narrator.
 *
 * Supported languages: 'es' (español, default), 'pt' (português).
 * Any unknown language code falls back to 'es'.
 */

const GENRES = {
  es: {
    fantasy: 'fantasía',
    historical: 'histórico',
    'sci-fi': 'ciencia ficción',
    mystery: 'misterio',
  },
  pt: {
    fantasy: 'fantasia',
    historical: 'histórico',
    'sci-fi': 'ficção científica',
    mystery: 'mistério',
  },
};

const NARRATOR = {
  es: (genre) =>
    `Eres el narrador maestro de una historia colaborativa de ${genre} ` +
    `que una familia escribe por turnos. Narra en español, en segunda persona plural, ` +
    `con tono épico pero apto para todas las edades. Integra TODAS las acciones de la ` +
    `ronda en una narración continua de 100 a 180 palabras que termine dejando la ` +
    `historia abierta para la próxima ronda. No inventes acciones de los jugadores. ` +
    `Mantén SIEMPRE la coherencia con todo lo narrado antes: personajes, lugares, objetos y ` +
    `hechos establecidos no cambian sin explicación. Si una acción de un jugador contradice la ` +
    `historia, es anacrónica o absurda para el género, NO la ignores ni rompas el mundo: ` +
    `intégrala con ingenio dándole una interpretación o consecuencia dentro de la lógica de la ` +
    `historia (un objeto extraño puede ser un artefacto misterioso, una contradicción puede ser ` +
    `un engaño, un sueño o un giro). Tú eres la autoridad narrativa: las acciones de los ` +
    `jugadores son intentos, y tú decides su resultado manteniendo el tono y la continuidad.`,
  pt: (genre) =>
    `Você é o narrador mestre de uma história colaborativa de ${genre} ` +
    `que uma família escreve por turnos. Narre em português, na segunda pessoa do plural, ` +
    `com tom épico mas adequado para todas as idades. Integre TODAS as ações da rodada em ` +
    `uma narração contínua de 100 a 180 palavras que termine deixando a história aberta ` +
    `para a próxima rodada. Não invente ações dos jogadores. ` +
    `Mantenha SEMPRE a coerência com tudo o que foi narrado antes: personagens, lugares, objetos e ` +
    `fatos estabelecidos não mudam sem explicação. Se uma ação de um jogador contradiz a história, ` +
    `é anacrônica ou absurda para o gênero, NÃO a ignore nem quebre o mundo: ` +
    `integre-a com engenho dando-lhe uma interpretação ou consequência dentro da lógica da história ` +
    `(um objeto estranho pode ser um artefato misterioso, uma contradição pode ser uma traição, ` +
    `um sonho ou uma reviravolta). Você é a autoridade narrativa: as ações dos jogadores são ` +
    `tentativas, e você decide seu resultado mantendo o tom e a continuidade.`,
};

const EPILOGUE = {
  es: `Escribe el epílogo de la historia en español: cierra los arcos de los ` +
    `personajes en 120-200 palabras con un final satisfactorio y emotivo.`,
  pt: `Escreva o epílogo da história em português: feche os arcos dos personagens ` +
    `em 120-200 palavras com um final satisfatório e emocionante.`,
};

const OPENING = {
  es: (genre) =>
    `Escribe en español la introducción (80-140 palabras) de una nueva ` +
    `historia de ${genre}. Presenta el escenario y un gancho inicial. Termina invitando ` +
    `a los protagonistas a actuar.`,
  pt: (genre) =>
    `Escreva em português a introdução (80-140 palavras) de uma nova ` +
    `história de ${genre}. Apresente o cenário e um gancho inicial. Termine convidando ` +
    `os protagonistas a agir.`,
};

/**
 * Normalize language code: only 'es' and 'pt' are supported; everything else → 'es'.
 * @param {string} language
 * @returns {'es'|'pt'}
 */
export function normalizeLanguage(language) {
  return language === 'pt' ? 'pt' : 'es';
}

/**
 * Build the system prompt for the narrator AI.
 * @param {string} language - 'es' | 'pt' (unknown → 'es')
 * @param {string} [genre='fantasy']
 * @returns {string}
 */
export function getNarratorSystemPrompt(language, genre = 'fantasy') {
  const l = normalizeLanguage(language);
  const translatedGenre = GENRES[l][genre] || genre;
  return NARRATOR[l](translatedGenre);
}

/**
 * Build the epilogue prompt for the narrator AI.
 * @param {string} language - 'es' | 'pt' (unknown → 'es')
 * @returns {string}
 */
export function getEpiloguePrompt(language) {
  return EPILOGUE[normalizeLanguage(language)];
}

/**
 * Build the opening/introduction prompt for a new story.
 * @param {string} language - 'es' | 'pt' (unknown → 'es')
 * @param {string} [genre='fantasy']
 * @returns {string}
 */
export function getOpeningPrompt(language, genre = 'fantasy') {
  const l = normalizeLanguage(language);
  const translatedGenre = GENRES[l][genre] || genre;
  return OPENING[l](translatedGenre);
}
