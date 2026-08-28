import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import os from 'os';

// Import routes
import authRoutes from './routes/authRoutes.js';
import narrativeRoutes from './routes/narrativeRoutes.js';
import { crearMapRoutes } from './routes/mapRoutes.js';

// Import socket handlers
import { registrarMapSocket } from './sockets/mapSocket.js';

// Import dynamic configuration
import config, { getDatabaseConnection, getCacheConnection } from './config/index.js';
import logger from './utils/logger.js';
import { errorHandler, AppError } from './utils/errors.js';
import { generalLimiter, apiLimiter, narrativeLimiter } from './middleware/rateLimiter.js';
import aiService from './services/AIService.js';
import { MapGameService } from './services/MapGameService.js';
import { MapGameRepo } from './db/MapGameRepo.js';
import { narrarRondaMapa as narrarRondaMapaImpl } from './domain/mapa/narracionRonda.js';

function getLanIp() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"]
  }
});

// Initialize connections
let pool, redisClient, mapGameService;

// Ata la bisagra Gemini/narrador-local (definida en domain/mapa/narracionRonda.js)
// al singleton real de AIService. La logica en si vive fuera de este archivo
// para poder testearla sin los efectos secundarios de importar server-dynamic.js.
function narrarRondaMapa(eventos, jugadores = []) {
  return narrarRondaMapaImpl(eventos, jugadores, aiService);
}

/**
 * Emite el estado actualizado de una partida de mapa a la sala PRIVADA de un
 * jugador (`map:<id>:<jugadorId>`). La sala es por jugador, no por partida:
 * asi el payload que llega a un socket es unicamente la vista filtrada de su
 * propio jugador y la niebla de guerra se respeta tambien por socket.
 */
function emitirMapa(id, jugadorId, evento, payload) {
  io.to(`map:${id}:${jugadorId}`).emit(evento, payload);
}

async function initializeConnections() {
  try {
    // Initialize database
    pool = await getDatabaseConnection();
    logger.info(`✅ Database initialized: ${config.database.type.toUpperCase()}`);

    // Initialize cache
    redisClient = await getCacheConnection();
    logger.info(`✅ Cache initialized: ${config.database.type === 'sqlite' ? 'MEMORY' : 'REDIS'}`);

    // Make connections available globally
    app.locals.pool = pool;
    app.locals.redisClient = redisClient;

    // Initialize the map-mode repo with the DB matching the active engine.
    let mapGameRepo;
    if (config.database.type === 'sqlite') {
      const { db: sqliteDb } = await import('./config/database-sqlite.js');
      mapGameRepo = new MapGameRepo(sqliteDb, 'sqlite');
      mapGameRepo.init();
    } else {
      mapGameRepo = new MapGameRepo(pool, 'postgres');
      await mapGameRepo.init();
    }
    mapGameService = new MapGameService({
      repo: mapGameRepo,
      narrador: narrarRondaMapa,
      emitir: emitirMapa,
    });
    mapRoutesListo = crearMapRoutes(mapGameService);
    logger.info('✅ Map routes ready: /api/map');

    return true;
  } catch (error) {
    logger.error('❌ Failed to initialize connections:', error);
    return false;
  }
}

// Middleware
app.use(helmet());
app.use(cors({ origin: true }));
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
app.use(generalLimiter);
app.use('/api/', apiLimiter);

// Routes
app.use('/api/auth', authRoutes);
// Use special rate limiter for narrative routes during development
app.use('/api/narrative', narrativeLimiter, narrativeRoutes);

// Map routes need `mapGameService`, which is only ready once initializeConnections()
// resolves (it needs the active DB engine). Registration order in Express matters -
// this must be mounted here, before the catch-all 404 handler below - so we mount a
// thin gate now and swap in the real router once the service exists.
let mapRoutesListo = null;
app.use('/api/map', (req, res, next) => {
  if (!mapRoutesListo) {
    return res.status(503).json({ codigo: 'SERVIDOR_INICIANDO', mensaje: 'El servidor todavia esta iniciando' });
  }
  return mapRoutesListo(req, res, next);
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      service: 'Cronicas Civilizacion Backend',
      database: {
        type: config.database.type,
        connected: pool ? true : false
      },
      cache: {
        type: config.database.type === 'sqlite' ? 'memory' : 'redis',
        connected: redisClient ? true : false
      },
      environment: config.server.nodeEnv
    };

    // Test database connection
    if (pool) {
      if (config.database.type === 'sqlite') {
        const result = pool.query('SELECT 1 as test');
        health.database.test = result.rows.length > 0 ? 'OK' : 'FAILED';
      } else {
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();
        health.database.test = 'OK';
      }
    }

    // Test cache connection
    if (redisClient) {
      await redisClient.ping();
      health.cache.test = 'OK';
    }

    res.json(health);
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Configuration info endpoint
app.get('/config', (req, res) => {
  res.json({
    database: {
      type: config.database.type,
      ...(config.database.type === 'sqlite' ? 
        { path: config.database.sqlite.path } : 
        { host: config.database.postgresql.host, port: config.database.postgresql.port })
    },
    cache: {
      type: config.database.type === 'sqlite' ? 'memory' : 'redis'
    },
    ai: aiService.getStatus(),
    game: config.game
  });
});

// Debug endpoint to check player status
app.get('/debug/players', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, civilization_name, is_online, socket_id, last_seen, updated_at 
      FROM players 
      ORDER BY updated_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  logger.info(`Player connected: ${socket.id}`);
  
  registrarMapSocket(socket, io, mapGameService);

  socket.on('disconnect', () => {
    logger.info(`Player disconnected: ${socket.id}`);
  });
});

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res, next) => {
  next(new AppError('Route not found', 404, 'ROUTE_NOT_FOUND'));
});

// Start server
async function startServer() {
  const connectionsOK = await initializeConnections();
  
  if (!connectionsOK) {
    logger.error('❌ Failed to start server due to connection issues');
    process.exit(1);
  }

  const PORT = config.server.port;

  server.listen(PORT, '0.0.0.0', () => {
    const ip = getLanIp();
    logger.info('\n==========================================');
    logger.info('🚀 Crónicas de Civilización Backend');
    logger.info('==========================================');
    logger.info(`📡 Local:   http://localhost:${PORT}`);
    logger.info(`📱 En tu WiFi: http://${ip}:${PORT}  ← para los celulares`);
    logger.info(`🏥 Health: http://localhost:${PORT}/health`);
    logger.info(`⚙️  Config: http://localhost:${PORT}/config`);
    logger.info(`🗃️  Database: ${config.database.type.toUpperCase()}`);
    logger.info(`💾 Cache: ${config.database.type === 'sqlite' ? 'MEMORY' : 'REDIS'}`);
    logger.info(`🌐 Environment: ${config.server.nodeEnv}`);
    logger.info('==========================================\n');
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('\n🛑 Shutting down server...');
  
  if (redisClient) {
    await redisClient.disconnect();
  }
  
  if (pool && pool.end) {
    await pool.end();
  }
  
  server.close(() => {
    logger.info('✅ Server shut down gracefully');
    process.exit(0);
  });
});

startServer().catch(err => logger.error('Failed to start server:', err));

export { io }; 