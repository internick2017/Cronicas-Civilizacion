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

// Import socket handlers
import { handleGameSocket } from './sockets/gameSocket.js';

// Import dynamic configuration
import config, { getDatabaseConnection, getCacheConnection } from './config/index.js';

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
    console.log(`✅ Database initialized: ${config.database.type.toUpperCase()}`);
    
    // Initialize cache
    redisClient = await getCacheConnection();
    console.log(`✅ Cache initialized: ${config.database.type === 'sqlite' ? 'MEMORY' : 'REDIS'}`);
    
    // Make connections available globally
    app.locals.pool = pool;
    app.locals.redisClient = redisClient;
    
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize connections:', error);
    return false;
  }
}

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/cities', cityRoutes);

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
    game: config.game
  });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  
  // Handle game-related socket events
  handleGameSocket(socket, io);
  
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: config.server.nodeEnv === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
async function startServer() {
  const connectionsOK = await initializeConnections();
  
  if (!connectionsOK) {
    console.error('❌ Failed to start server due to connection issues');
    process.exit(1);
  }

  const PORT = config.server.port;

  server.listen(PORT, () => {
    console.log('\n==========================================');
    console.log('🚀 Crónicas de Civilización Backend');
    console.log('==========================================');
    console.log(`📡 Server: http://localhost:${PORT}`);
    console.log(`🏥 Health: http://localhost:${PORT}/health`);
    console.log(`⚙️  Config: http://localhost:${PORT}/config`);
    console.log(`🗃️  Database: ${config.database.type.toUpperCase()}`);
    console.log(`💾 Cache: ${config.database.type === 'sqlite' ? 'MEMORY' : 'REDIS'}`);
    console.log(`🌐 Environment: ${config.server.nodeEnv}`);
    console.log('==========================================\n');
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  
  if (redisClient) {
    await redisClient.disconnect();
  }
  
  if (pool && pool.end) {
    await pool.end();
  }
  
  server.close(() => {
    console.log('✅ Server shut down gracefully');
    process.exit(0);
  });
});

startServer().catch(console.error);

export { io }; 