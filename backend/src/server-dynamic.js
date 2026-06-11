import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';

// Import routes
import gameRoutes from './routes/gameRoutes.js';
import playerRoutes from './routes/playerRoutes.js';
import authRoutes from './routes/authRoutes.js';
import resourceRoutes from './routes/resourceRoutes.js';
import cityRoutes from './routes/cityRoutes.js';
import militaryRoutes from './routes/militaryRoutes.js';
import narrativeRoutes from './routes/narrativeRoutes.js';

// Import socket handlers
import { handleGameSocket } from './sockets/gameSocket.js';

// Import dynamic configuration
import config, { getDatabaseConnection, getCacheConnection } from './config/index.js';
import logger from './utils/logger.js';
import { errorHandler, AppError } from './utils/errors.js';
import { generalLimiter, apiLimiter, narrativeLimiter } from './middleware/rateLimiter.js';
import aiService from './services/AIService.js';
import { GameService } from './services/GameService.js';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: config.server.frontendUrl,
    methods: ["GET", "POST"]
  }
});

// Initialize connections
let pool, redisClient;

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
    
    // Initialize GameService with cache client
    const gameService = GameService.getInstance();
    gameService.setCacheClient(redisClient);
    
    return true;
  } catch (error) {
    logger.error('❌ Failed to initialize connections:', error);
    return false;
  }
}

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
app.use(generalLimiter);
app.use('/api/', apiLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/cities', cityRoutes);
app.use('/api/military', militaryRoutes);
// Use special rate limiter for narrative routes during development
app.use('/api/narrative', narrativeLimiter, narrativeRoutes);

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
  
  // Handle game-related socket events
  handleGameSocket(socket, io);
  
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

  server.listen(PORT, () => {
    logger.info('\n==========================================');
    logger.info('🚀 Crónicas de Civilización Backend');
    logger.info('==========================================');
    logger.info(`📡 Server: http://localhost:${PORT}`);
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