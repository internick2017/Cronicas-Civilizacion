// In-memory Redis replacement for development
// This provides a simple key-value store without requiring Redis server

class MemoryRedis {
  constructor() {
    this.store = new Map();
    this.connected = false;
  }

  async connect() {
    this.connected = true;
    console.log('✅ Connected to in-memory cache (Redis replacement)');
    return this;
  }

  async disconnect() {
    this.connected = false;
    this.store.clear();
    console.log('📴 Disconnected from in-memory cache');
    return this;
  }

  async ping() {
    if (!this.connected) throw new Error('Not connected');
    return 'PONG';
  }

  async set(key, value, options = {}) {
    if (!this.connected) throw new Error('Not connected');
    
    let finalValue = value;
    if (typeof value === 'object') {
      finalValue = JSON.stringify(value);
    }
    
    this.store.set(key, {
      value: finalValue,
      expireAt: options.EX ? Date.now() + (options.EX * 1000) : null
    });
    
    return 'OK';
  }

  async get(key) {
    if (!this.connected) throw new Error('Not connected');
    
    const item = this.store.get(key);
    if (!item) return null;
    
    // Check if expired
    if (item.expireAt && Date.now() > item.expireAt) {
      this.store.delete(key);
      return null;
    }
    
    return item.value;
  }

  async del(key) {
    if (!this.connected) throw new Error('Not connected');
    
    const existed = this.store.has(key);
    this.store.delete(key);
    return existed ? 1 : 0;
  }

  async exists(key) {
    if (!this.connected) throw new Error('Not connected');
    
    const item = this.store.get(key);
    if (!item) return 0;
    
    // Check if expired
    if (item.expireAt && Date.now() > item.expireAt) {
      this.store.delete(key);
      return 0;
    }
    
    return 1;
  }

  async expire(key, seconds) {
    if (!this.connected) throw new Error('Not connected');
    
    const item = this.store.get(key);
    if (!item) return 0;
    
    item.expireAt = Date.now() + (seconds * 1000);
    return 1;
  }

  async flushAll() {
    if (!this.connected) throw new Error('Not connected');
    this.store.clear();
    return 'OK';
  }

  async keys(pattern = '*') {
    if (!this.connected) throw new Error('Not connected');
    
    if (pattern === '*') {
      return Array.from(this.store.keys());
    }
    
    // Simple pattern matching for basic patterns
    const regex = new RegExp(pattern.replace('*', '.*'));
    return Array.from(this.store.keys()).filter(key => regex.test(key));
  }

  // Event emitter methods (simplified)
  on(event, callback) {
    // Simplified event handling
    if (event === 'connect') {
      setTimeout(callback, 0);
    }
    return this;
  }

  async info(section = 'all') {
    if (!this.connected) throw new Error('Not connected');
    
    return `# Memory Redis Replacement
redis_version:7.0.0-memory
connected_clients:1
used_memory:${this.store.size * 100}
total_commands_processed:${this.store.size}`;
  }
}

const redisClient = new MemoryRedis();

export default redisClient; 