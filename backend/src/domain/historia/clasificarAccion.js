// Que tipo de cosa intenta hacer un jugador, mirando las palabras con que la escribio.
// No entiende el significado: busca el comienzo de verbos comunes en espanol y portugues
// (sin acentos) y se queda con la primera categoria que aparezca, en este orden de prioridad.
// Lo que no reconoce es 'otro', que tiene sus propias frases neutras.
const CATEGORIAS = [
  ['atacar', ['atac', 'golp', 'luch', 'lut', 'pelea', 'peleo', 'dispar', 'espad', 'apunal', 'embest', 'derrot', 'combat', 'matar', 'mato']],
  ['huir', ['huyo', 'huir', 'escapo', 'escapar', 'corro', 'correr', 'escond', 'retroced', 'fujo', 'fugir', 'fuga', 'salgo', 'salir', 'escabull', 'esquiv']],
  ['ayudar', ['curo', 'curar', 'ayud', 'proteg', 'salvo', 'salvar', 'defiend', 'defend', 'sano', 'sanar', 'cuido', 'rezo', 'rezar', 'consuel', 'consol', 'abrazo', 'abraco', 'auxili', 'socorr']],
  ['hablar', ['hablo', 'hablar', 'digo', 'dizer', 'pregunt', 'pergunt', 'interrog', 'negoci', 'convenc', 'salud', 'cumprimento', 'grito', 'gritar', 'canto', 'cantar', 'respond', 'explico', 'falo', 'falar', 'pido', 'pedir', 'peco', 'ordeno', 'ordenar']],
  ['usar', ['abro', 'abrir', 'abre', 'uso', 'usar', 'tomo', 'tomar', 'agarr', 'enciend', 'encender', 'acend', 'activ', 'ativ', 'empurr', 'empuj', 'levant', 'coloc', 'pongo', 'poner', 'lanz', 'lanc', 'arroj', 'construy', 'constru']],
  ['explorar', ['explor', 'busc', 'investig', 'miro', 'mirar', 'examin', 'avanz', 'camin', 'entro', 'entrar', 'sigo', 'seguir', 'rastre', 'revis', 'observ', 'procur', 'olho', 'olhar', 'vasculh', 'inspec']],
];

const sinAcentos = (texto) => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function clasificarAccion(texto) {
  const palabras = sinAcentos(texto).split(/[^a-z0-9ñ]+/).filter(Boolean);
  for (const [categoria, raices] of CATEGORIAS) {
    if (palabras.some(p => raices.some(r => p.startsWith(r)))) return categoria;
  }
  return 'otro';
}
