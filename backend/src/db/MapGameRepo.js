import crypto from 'crypto';
import { ddl } from './mapSchema.js';

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
      return;
    }
    return Promise.all([...statements, indiceTokens].map(stmt => this.db.query(stmt)));
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
      INSERT INTO map_game_eventos (game_id, turno, orden, tipo, datos_json)
      VALUES (?, ?, ?, ?, ?)
    `;
    if (this.dialecto === 'sqlite') {
      const siguienteOrden = this.db
        .prepare('SELECT COALESCE(MAX(orden), -1) + 1 AS n FROM map_game_eventos WHERE game_id = ?')
        .get(gameId).n;
      const stmt = this.db.prepare(sql);
      const insertarTodos = this.db.transaction((filas) => {
        filas.forEach((evento, i) => {
          stmt.run(gameId, evento.turno, siguienteOrden + i, evento.tipo, JSON.stringify(evento.datos));
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
        await this.db.query(adaptarPlaceholders(sql), [gameId, evento.turno, orden, evento.tipo, JSON.stringify(evento.datos)]);
        orden += 1;
      }
    })();
  }

  eventosDe(gameId) {
    const sql = 'SELECT * FROM map_game_eventos WHERE game_id = ? ORDER BY orden ASC';
    if (this.dialecto === 'sqlite') {
      return this.db.prepare(sql).all(gameId);
    }
    return this.db.query(adaptarPlaceholders(sql), [gameId]).then(res => res.rows);
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
