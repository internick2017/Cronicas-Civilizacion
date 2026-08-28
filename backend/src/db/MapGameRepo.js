import crypto from 'crypto';
import { ddl, TABLAS } from './mapSchema.js';

// Convierte SQL escrito con placeholders `?` (estilo sqlite) a `$1, $2, ...`
// (estilo postgres). Permite mantener una sola redaccion de cada query.
export function adaptarPlaceholders(sql) {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

export class MapGameRepo {
  constructor(db, dialecto = 'sqlite') {
    if (dialecto !== 'sqlite' && dialecto !== 'postgres') {
      throw new Error(`Dialecto desconocido: ${dialecto}`);
    }
    this.db = db;
    this.dialecto = dialecto;
  }

  init() {
    const statements = ddl(this.dialecto);
    const indiceTokens = 'CREATE UNIQUE INDEX IF NOT EXISTS map_game_tokens_pk ON map_game_tokens (game_id, jugador_id)';
    if (this.dialecto === 'sqlite') {
      for (const stmt of statements) this.db.exec(stmt);
      this.db.exec(indiceTokens);
      return this._migrar();
    }
    return Promise.all([...statements, indiceTokens].map(stmt => this.db.query(stmt)))
      .then(() => this._migrar());
  }

  // CREATE TABLE IF NOT EXISTS no toca una tabla que ya existia, asi que una
  // columna nueva agregada a mapSchema.js nunca aparece en una base con datos
  // previos (bug real: ver commit 8421b5c, jugador_id en map_game_eventos).
  // Este migrador es GENERAL, no puntual a esa columna: para cada tabla
  // declarada, compara sus columnas contra las que la base realmente tiene y
  // agrega (ALTER TABLE ... ADD COLUMN) las que falten. Se resuelve asi en
  // vez de puntualmente porque va a haber mas cambios de esquema a futuro y
  // este mismo mecanismo los cubre sin tocar el migrador de nuevo.
  // Es idempotente: si ya no falta ninguna columna, no ejecuta ningun ALTER.
  _migrar() {
    if (this.dialecto === 'sqlite') {
      for (const tabla of TABLAS) {
        const existentes = new Set(this.db.prepare(`PRAGMA table_info(${tabla.nombre})`).all().map(c => c.name));
        for (const [nombre, tipos] of tabla.columnas) {
          if (!existentes.has(nombre)) {
            this.db.exec(`ALTER TABLE ${tabla.nombre} ADD COLUMN ${nombre} ${tipos.sqlite}`);
          }
        }
      }
      return;
    }
    return (async () => {
      for (const tabla of TABLAS) {
        const res = await this.db.query(
          'SELECT column_name FROM information_schema.columns WHERE table_name = $1',
          [tabla.nombre],
        );
        const existentes = new Set(res.rows.map(r => r.column_name));
        for (const [nombre, tipos] of tabla.columnas) {
          if (!existentes.has(nombre)) {
            await this.db.query(`ALTER TABLE ${tabla.nombre} ADD COLUMN ${nombre} ${tipos.postgres}`);
          }
        }
      }
    })();
  }

  guardar(estado, codigo) {
    const sql = `
      INSERT INTO map_games (id, codigo, version_esquema, estado_json, creado, actualizado)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
        codigo = excluded.codigo,
        version_esquema = excluded.version_esquema,
        estado_json = excluded.estado_json,
        actualizado = CURRENT_TIMESTAMP
    `;
    const params = [estado.id, codigo, estado.versionEsquema, JSON.stringify(estado)];
    return this._ejecutar(sql, params);
  }

  cargar(id) {
    const sql = 'SELECT estado_json FROM map_games WHERE id = ?';
    if (this.dialecto === 'sqlite') {
      const fila = this.db.prepare(sql).get(id);
      return fila ? JSON.parse(fila.estado_json) : null;
    }
    return this.db.query(adaptarPlaceholders(sql), [id])
      .then(res => (res.rows[0] ? JSON.parse(res.rows[0].estado_json) : null));
  }

  cargarPorCodigo(codigo) {
    const sql = 'SELECT estado_json FROM map_games WHERE codigo = ?';
    if (this.dialecto === 'sqlite') {
      const fila = this.db.prepare(sql).get(codigo);
      return fila ? JSON.parse(fila.estado_json) : null;
    }
    return this.db.query(adaptarPlaceholders(sql), [codigo])
      .then(res => (res.rows[0] ? JSON.parse(res.rows[0].estado_json) : null));
  }

  agregarEventos(gameId, eventos) {
    const sql = `
      INSERT INTO map_game_eventos (game_id, turno, orden, tipo, jugador_id, datos_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    if (this.dialecto === 'sqlite') {
      const siguienteOrden = this.db
        .prepare('SELECT COALESCE(MAX(orden), -1) + 1 AS n FROM map_game_eventos WHERE game_id = ?')
        .get(gameId).n;
      const stmt = this.db.prepare(sql);
      const insertarTodos = this.db.transaction((filas) => {
        filas.forEach((evento, i) => {
          stmt.run(gameId, evento.turno, siguienteOrden + i, evento.tipo, evento.jugadorId ?? null, JSON.stringify(evento.datos));
        });
      });
      insertarTodos(eventos);
      return;
    }
    return (async () => {
      const actual = await this.db.query(
        'SELECT COALESCE(MAX(orden), -1) + 1 AS n FROM map_game_eventos WHERE game_id = $1',
        [gameId],
      );
      let orden = actual.rows[0].n;
      for (const evento of eventos) {
        await this.db.query(adaptarPlaceholders(sql), [gameId, evento.turno, orden, evento.tipo, evento.jugadorId ?? null, JSON.stringify(evento.datos)]);
        orden += 1;
      }
    })();
  }

  // Cuenta los eventos sin traerlos. Existe porque la semilla del combate se
  // arma con la CANTIDAD de eventos previos (ver MapGameService#_accion), y
  // para eso se leia el log ENTERO con eventosDe(): en una partida larga son
  // decenas de miles de filas con su JSON, leidas de nuevo en CADA ataque
  // (medido: 19.299 eventos al turno 300, 5.827 ya al turno 100). El numero
  // que devuelve es identico al de eventosDe().length, asi que las partidas
  // guardadas siguen resolviendo sus combates igual.
  contarEventos(gameId) {
    const sql = 'SELECT COUNT(*) AS n FROM map_game_eventos WHERE game_id = ?';
    if (this.dialecto === 'sqlite') {
      return this.db.prepare(sql).get(gameId).n;
    }
    return this.db.query(adaptarPlaceholders(sql), [gameId]).then(res => Number(res.rows[0].n));
  }

  eventosDe(gameId) {
    const sql = 'SELECT * FROM map_game_eventos WHERE game_id = ? ORDER BY orden ASC';
    if (this.dialecto === 'sqlite') {
      return this.db.prepare(sql).all(gameId);
    }
    return this.db.query(adaptarPlaceholders(sql), [gameId]).then(res => res.rows);
  }

  // Devuelve los eventos de UNA ronda (mismo `turno`) ya reconstruidos con la
  // forma que espera el narrador: {tipo, jugadorId, datos}. Todas las acciones
  // de todos los jugadores que ocurrieron mientras esa ronda estaba abierta
  // comparten el mismo `turno` (ver evento() en reglas/comun.js: usa
  // estado.turno, que solo avanza al CERRAR la ronda), asi que filtrar por
  // turno alcanza para juntar todo lo que paso en la ronda, no solo la ultima
  // accion (que siempre es terminarTurno, cuyos eventos son de contabilidad).
  eventosDeRonda(gameId, turno) {
    const sql = 'SELECT * FROM map_game_eventos WHERE game_id = ? AND turno = ? ORDER BY orden ASC';
    const mapear = (filas) => filas.map(f => ({
      tipo: f.tipo,
      turno: f.turno,
      jugadorId: f.jugador_id,
      datos: JSON.parse(f.datos_json),
    }));
    if (this.dialecto === 'sqlite') {
      return mapear(this.db.prepare(sql).all(gameId, turno));
    }
    return this.db.query(adaptarPlaceholders(sql), [gameId, turno]).then(res => mapear(res.rows));
  }

  guardarNarrativa(gameId, turno, narrativa) {
    const sql = 'UPDATE map_game_eventos SET narrativa = ? WHERE game_id = ? AND turno = ?';
    return this._ejecutar(sql, [narrativa, gameId, turno]);
  }

  // Lee las ultimas rondas narradas. Hasta ahora la narrativa se escribia y
  // nunca se leia: sin este metodo el jugador jamas veia el texto.
  // El GROUP BY evita duplicados cuando una ronda tiene varias filas con la
  // misma narrativa (una fila por evento de esa ronda, todas actualizadas al
  // mismo texto por `guardarNarrativa`); es valido tanto en sqlite como en
  // postgres porque ambas columnas seleccionadas (turno, narrativa) estan en
  // el GROUP BY, sin columnas sueltas fuera de el.
  narrativasDe(gameId, limite = 5) {
    const sql = `
      SELECT turno, narrativa FROM map_game_eventos
      WHERE game_id = ? AND narrativa IS NOT NULL
      GROUP BY turno, narrativa
      ORDER BY turno ASC
    `;
    const mapear = (filas) => filas
      .map(f => ({ ronda: f.turno, texto: f.narrativa }))
      .slice(-limite);

    if (this.dialecto === 'sqlite') {
      return Promise.resolve(mapear(this.db.prepare(sql).all(gameId)));
    }
    return this.db.query(adaptarPlaceholders(sql), [gameId]).then(res => mapear(res.rows));
  }

  listarActivas() {
    const sql = 'SELECT id, codigo, estado_json FROM map_games';
    const mapear = (filas) => filas.map(f => {
      const json = JSON.parse(f.estado_json);
      return { id: f.id, codigo: f.codigo, nombre: json.nombre, estado: json.estado };
    });
    if (this.dialecto === 'sqlite') {
      return mapear(this.db.prepare(sql).all());
    }
    return this.db.query(sql).then(res => mapear(res.rows));
  }

  guardarToken(gameId, jugadorId, tokenHash) {
    const sql = `
      INSERT INTO map_game_tokens (game_id, jugador_id, token_hash, creado)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT (game_id, jugador_id) DO UPDATE SET
        token_hash = excluded.token_hash,
        creado = CURRENT_TIMESTAMP
    `;
    return this._ejecutar(sql, [gameId, jugadorId, tokenHash]);
  }

  verificarToken(gameId, jugadorId, tokenPlano) {
    const hash = crypto.createHash('sha256').update(String(tokenPlano ?? '')).digest('hex');
    const sql = 'SELECT token_hash FROM map_game_tokens WHERE game_id = ? AND jugador_id = ?';
    if (this.dialecto === 'sqlite') {
      const fila = this.db.prepare(sql).get(gameId, jugadorId);
      return !!fila && fila.token_hash === hash;
    }
    return this.db.query(adaptarPlaceholders(sql), [gameId, jugadorId])
      .then(res => !!res.rows[0] && res.rows[0].token_hash === hash);
  }

  _ejecutar(sql, params) {
    if (this.dialecto === 'sqlite') {
      return this.db.prepare(sql).run(...params);
    }
    return this.db.query(adaptarPlaceholders(sql), params);
  }
}
