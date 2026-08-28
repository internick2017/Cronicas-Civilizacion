import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';

/**
 * Presupuesto de llamadas a la IA, para NUNCA pasarse del limite del plan
 * gratuito.
 *
 * La red de seguridad que ya existia (caer al narrador local si la IA falla)
 * atiende el problema DESPUES de chocar: igual gastaste la llamada, y el
 * cliente ademas reintentaba, asi que cada narracion que chocaba contra el
 * limite consumia tres. Esto lo evita ANTES: si la proxima llamada no entra en
 * el presupuesto, no se hace.
 *
 * Los topes son configurables por variables de entorno a proposito: los limites
 * reales del plan gratuito de Gemini cambian con el tiempo y por modelo, asi
 * que clavarlos en el codigo seria condenarlos a quedar viejos. Los valores por
 * defecto son deliberadamente conservadores.
 *
 * El conteo diario se guarda en un archivo porque tiene que sobrevivir a un
 * reinicio del backend: si no, apagar y prender el juego reseteaba el
 * presupuesto y el limite real se pasaba igual.
 */
export class PresupuestoIA {
  constructor({
    archivo,
    reloj = () => Date.now(),
    porMinuto = Number(process.env.GEMINI_RPM || 10),
    porDia = Number(process.env.GEMINI_RPD || 200),
    pausaCuotaMs = Number(process.env.GEMINI_PAUSA_CUOTA_MS || 15 * 60 * 1000),
  } = {}) {
    // Bajo test NUNCA se toca el archivo real: correr la suite gastaba el
    // presupuesto del dia de verdad (medido: 9 llamadas anotadas sin que nadie
    // jugara), y con suficientes corridas habria dejado al juego sin IA.
    this.soloEnMemoria = Boolean(process.env.VITEST) && !archivo;
    this.archivo = archivo || path.join(process.cwd(), 'data', 'uso-ia.json');
    this.reloj = reloj;
    this.porMinuto = porMinuto;
    this.porDia = porDia;
    this.pausaCuotaMs = pausaCuotaMs;

    this.llamadasRecientes = []; // timestamps del ultimo minuto
    this.dia = this._hoy();
    this.usadasHoy = 0;
    this.pausadaHasta = 0;
    this._cargar();
  }

  _hoy() {
    return new Date(this.reloj()).toISOString().slice(0, 10);
  }

  _cargar() {
    if (this.soloEnMemoria) return;
    try {
      const guardado = JSON.parse(fs.readFileSync(this.archivo, 'utf8'));
      // Un conteo de ayer no cuenta para hoy.
      if (guardado.dia === this.dia) {
        this.usadasHoy = guardado.usadasHoy ?? 0;
        this.pausadaHasta = guardado.pausadaHasta ?? 0;
      }
    } catch {
      // No existe, esta corrupto o no se puede leer: se arranca de cero. Un
      // presupuesto que no se puede leer no puede ser motivo para romper el
      // juego; lo peor que pasa es que se permita un puñado de llamadas de mas.
    }
  }

  _guardar() {
    if (this.soloEnMemoria) return;
    try {
      fs.mkdirSync(path.dirname(this.archivo), { recursive: true });
      fs.writeFileSync(this.archivo, JSON.stringify({
        dia: this.dia, usadasHoy: this.usadasHoy, pausadaHasta: this.pausadaHasta,
      }));
    } catch (error) {
      // Idem: no poder persistir degrada la proteccion tras un reinicio, pero
      // nunca puede tumbar una partida en curso.
      logger.warn?.(`No se pudo guardar el uso de IA: ${error.message}`);
    }
  }

  _rotarDia() {
    const hoy = this._hoy();
    if (hoy !== this.dia) {
      this.dia = hoy;
      this.usadasHoy = 0;
    }
  }

  /**
   * @returns {{permitido: boolean, motivo?: string}} si conviene llamar a la IA
   *   ahora mismo. El motivo sirve para loguear y para explicarle al jugador
   *   por que la cronica salio del narrador local.
   */
  puedeLlamar() {
    this._rotarDia();
    const ahora = this.reloj();

    if (ahora < this.pausadaHasta) {
      return { permitido: false, motivo: 'cuota_agotada' };
    }
    if (this.usadasHoy >= this.porDia) {
      return { permitido: false, motivo: 'limite_diario' };
    }
    this.llamadasRecientes = this.llamadasRecientes.filter(t => ahora - t < 60_000);
    if (this.llamadasRecientes.length >= this.porMinuto) {
      return { permitido: false, motivo: 'limite_por_minuto' };
    }
    return { permitido: true };
  }

  registrarLlamada() {
    this._rotarDia();
    this.llamadasRecientes.push(this.reloj());
    this.usadasHoy += 1;
    this._guardar();
  }

  /**
   * La API contesto que la cuota esta agotada (429, o 403 de cuota). Apaga la
   * IA por un rato en vez de seguir intentando: insistir contra un limite
   * excedido solo lo empeora.
   */
  registrarCuotaAgotada() {
    this.pausadaHasta = this.reloj() + this.pausaCuotaMs;
    this._guardar();
    logger.warn?.(`IA pausada por cuota hasta ${new Date(this.pausadaHasta).toISOString()}`);
  }

  estado() {
    this._rotarDia();
    return {
      usadasHoy: this.usadasHoy,
      topeDiario: this.porDia,
      topePorMinuto: this.porMinuto,
      pausadaHasta: this.pausadaHasta,
    };
  }
}
