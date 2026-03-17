const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
console.log('[worker] Social Control Plane worker booting');
console.log('[worker] serialized-per-account queue model is the contract');
console.log(`[worker] REDIS_URL=${redisUrl}`);
