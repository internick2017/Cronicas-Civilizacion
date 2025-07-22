# 🚀 Neon PostgreSQL Setup Guide

## 📋 Overview

This guide will help you configure **Crónicas de Civilización** to use **Neon PostgreSQL** as your database. Neon is a serverless PostgreSQL service that's perfect for production deployments.

## 🎯 Benefits of Neon

- ✅ **Serverless** - No server management required
- ✅ **Auto-scaling** - Handles traffic spikes automatically
- ✅ **Global distribution** - Low latency worldwide
- ✅ **Branching** - Create database branches for testing
- ✅ **Free tier** - Generous free plan available
- ✅ **PostgreSQL compatible** - Full PostgreSQL features

## 🚀 Quick Setup

### Step 1: Create Neon Account
1. Go to [neon.tech](https://neon.tech)
2. Sign up for a free account
3. Create a new project

### Step 2: Get Connection String
1. In your Neon dashboard, go to **Connection Details**
2. Copy the **Connection string** (looks like):
   ```
   postgresql://[user]:[password]@[host]/[dbname]?sslmode=require
   ```

### Step 3: Setup Project
```bash
cd backend
npm run setup-neon
```

### Step 4: Configure Environment
Edit `.env` file and replace the placeholder:
```env
DATABASE_URL=postgresql://your_actual_connection_string_here
```

### Step 5: Run Migration
```bash
npm run migrate-neon
```

### Step 6: Start Development
```bash
npm run dev-neon
```

## 🔧 Detailed Configuration

### Environment Variables

```env
# Neon Database (Primary)
DATABASE_URL=postgresql://[user]:[password]@[host]/[dbname]?sslmode=require

# Database Type
DATABASE_TYPE=postgresql

# Optional: Individual variables (for local development)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=cronicas_civilizacion
DB_USER=postgres
DB_PASSWORD=password
DB_SSL=false
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run setup-neon` | Create .env file for Neon |
| `npm run migrate-neon` | Initialize database schema |
| `npm run dev-neon` | Development with Neon |
| `npm run start-neon` | Production with Neon |
| `npm run test-connections` | Test database connection |

## 🐳 Docker Deployment

### Using Docker Compose with Neon

1. **Create `.env` file in project root:**
```env
DATABASE_URL=postgresql://your_neon_connection_string
JWT_SECRET=your_jwt_secret
OPENAI_API_KEY=your_openai_key
```

2. **Run with Neon configuration:**
```bash
docker-compose -f docker-compose.neon.yml up
```

### Production Deployment

```bash
# Build and run production containers
docker-compose -f docker-compose.neon.yml up --build -d

# With Redis cache
docker-compose -f docker-compose.neon.yml --profile cache up --build -d
```

## 📊 Database Schema

The migration script creates the following tables:

- **users** - User authentication and profiles
- **players** - Game player information
- **player_stats** - Player statistics and achievements
- **games** - Game sessions and configuration
- **game_players** - Player-game relationships
- **player_resources** - In-game resources (food, gold, etc.)
- **map_tiles** - Game map tiles and terrain
- **cities** - Player cities and settlements
- **armies** - Military units
- **game_history** - Game action history
- **ai_narratives** - AI-generated story content
- **chat_messages** - In-game chat system

## 🔍 Monitoring and Management

### Neon Dashboard Features
- **Real-time metrics** - Monitor performance
- **Query analysis** - Optimize database queries
- **Branching** - Create test environments
- **Backups** - Automatic backups
- **Scaling** - Auto-scale based on usage

### Connection Testing
```bash
npm run test-connections
```

Expected output:
```
✅ Connected to PostgreSQL database
🔒 SSL connection enabled
```

## 🛠️ Troubleshooting

### Common Issues

#### ❌ Connection Failed
```bash
# Check your DATABASE_URL format
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
```

#### ❌ SSL Certificate Error
```bash
# Ensure sslmode=require is in your connection string
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
```

#### ❌ Migration Failed
```bash
# Check if tables already exist
npm run migrate-neon
# Script handles existing tables gracefully
```

#### ❌ Environment Variables Not Loading
```bash
# Ensure .env file is in backend directory
# Check file permissions
# Verify variable names match exactly
```

### Performance Optimization

1. **Connection Pooling** - Already configured in the app
2. **Indexes** - Automatically created during migration
3. **Query Optimization** - Monitor slow queries in Neon dashboard
4. **Caching** - Use Redis for frequently accessed data

## 🔄 Migration from Other Databases

### From SQLite
```bash
# 1. Setup Neon
npm run setup-neon

# 2. Run migration
npm run migrate-neon

# 3. Switch to Neon
npm run dev-neon
```

### From Local PostgreSQL
```bash
# 1. Export data (if needed)
pg_dump local_db > backup.sql

# 2. Setup Neon
npm run setup-neon

# 3. Import data (if needed)
psql "your_neon_connection_string" < backup.sql

# 4. Run migration
npm run migrate-neon
```

## 📈 Scaling Considerations

### Neon Auto-scaling
- **Automatic** - Neon handles scaling based on usage
- **Branching** - Create separate environments for testing
- **Read replicas** - Automatically created for read-heavy workloads

### Application Scaling
- **Connection pooling** - Configured for optimal performance
- **Redis caching** - Optional for session and game state
- **Load balancing** - Use multiple application instances

## 🔐 Security Best Practices

1. **Environment Variables** - Never commit DATABASE_URL to version control
2. **SSL Required** - Always use SSL connections
3. **Connection String** - Keep connection strings secure
4. **JWT Secrets** - Use strong, unique JWT secrets
5. **API Keys** - Secure OpenAI and other API keys

## 📞 Support

- **Neon Documentation**: [neon.tech/docs](https://neon.tech/docs)
- **Neon Community**: [neon.tech/community](https://neon.tech/community)
- **Project Issues**: Create an issue in the project repository

---

## 🎉 Success Checklist

- [ ] Neon account created
- [ ] Project created in Neon
- [ ] Connection string obtained
- [ ] `.env` file configured
- [ ] Database migration completed
- [ ] Application connects successfully
- [ ] Test data created
- [ ] Development server running
- [ ] Production deployment tested

**Congratulations!** Your application is now running on Neon PostgreSQL! 🚀 