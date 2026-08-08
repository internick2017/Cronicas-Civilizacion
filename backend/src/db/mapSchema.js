// UNA sola declaracion de esquema, dos dialectos generados a partir de ella.
// Esto existe para cerrar el bug B2 del sistema viejo: el esquema estaba
// mantenido a mano en dos archivos (init.sql y database-sqlite.js) y se
// desincronizaban. Aqui hay una unica fuente de verdad (TABLAS) de la que
// se derivan tanto el DDL sqlite como el DDL postgres.

const TABLAS = [
  {
    nombre: 'map_games',
    columnas: [
      ['id', { sqlite: 'TEXT PRIMARY KEY', postgres: 'UUID PRIMARY KEY' }],
      ['codigo', { sqlite: 'TEXT UNIQUE', postgres: 'TEXT UNIQUE' }],
      ['version_esquema', { sqlite: 'INTEGER NOT NULL', postgres: 'INTEGER NOT NULL' }],
      ['estado_json', { sqlite: 'TEXT NOT NULL', postgres: 'TEXT NOT NULL' }],
      ['creado', { sqlite: 'DATETIME DEFAULT CURRENT_TIMESTAMP', postgres: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }],
      ['actualizado', { sqlite: 'DATETIME DEFAULT CURRENT_TIMESTAMP', postgres: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }],
    ],
  },
  {
    nombre: 'map_game_eventos',
    columnas: [
      ['id', { sqlite: 'INTEGER PRIMARY KEY AUTOINCREMENT', postgres: 'BIGSERIAL PRIMARY KEY' }],
      ['game_id', { sqlite: 'TEXT NOT NULL', postgres: 'UUID NOT NULL' }],
      ['turno', { sqlite: 'INTEGER NOT NULL', postgres: 'INTEGER NOT NULL' }],
      ['orden', { sqlite: 'INTEGER NOT NULL', postgres: 'INTEGER NOT NULL' }],
      ['tipo', { sqlite: 'TEXT NOT NULL', postgres: 'TEXT NOT NULL' }],
      ['datos_json', { sqlite: 'TEXT NOT NULL', postgres: 'TEXT NOT NULL' }],
      ['narrativa', { sqlite: 'TEXT', postgres: 'TEXT' }],
      ['creado', { sqlite: 'DATETIME DEFAULT CURRENT_TIMESTAMP', postgres: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }],
    ],
  },
  {
    nombre: 'map_game_tokens',
    columnas: [
      ['game_id', { sqlite: 'TEXT NOT NULL', postgres: 'UUID NOT NULL' }],
      ['jugador_id', { sqlite: 'TEXT NOT NULL', postgres: 'TEXT NOT NULL' }],
      ['token_hash', { sqlite: 'TEXT NOT NULL', postgres: 'TEXT NOT NULL' }],
      ['creado', { sqlite: 'DATETIME DEFAULT CURRENT_TIMESTAMP', postgres: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }],
    ],
  },
];

const DIALECTOS_VALIDOS = ['sqlite', 'postgres'];

export function ddl(dialecto) {
  if (!DIALECTOS_VALIDOS.includes(dialecto)) {
    throw new Error(`Dialecto desconocido: ${dialecto}`);
  }
  return TABLAS.map(t =>
    `CREATE TABLE IF NOT EXISTS ${t.nombre} (\n  ${t.columnas.map(([n, d]) => `${n} ${d[dialecto]}`).join(',\n  ')}\n)`);
}

export const TABLAS_NOMBRES = TABLAS.map(t => t.nombre);
