export class ReglaError extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = 'ReglaError';
    this.codigo = codigo;
  }
}
