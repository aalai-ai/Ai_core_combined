import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';
import { securityConfig, queueConfig } from '../config/config';
import { logger } from '../utils/logger';

let redisClient: Redis;

try {
  redisClient = new Redis({
    host: queueConfig.redisHost,
    port: queueConfig.redisPort,
    password: queueConfig.redisPassword,
    maxRetriesPerRequest: 1, // Fail fast to avoid blocking app
  });

  redisClient.on('error', (err) => {
    logger.error('Redis Rate Limiting client error:', err);
  });
} catch (err) {
  logger.error('Failed to initialize Redis for rate limiting:', err);
}

// Global IP-based rate limiter
export const globalIpRateLimiter = rateLimit({
  windowMs: securityConfig.rateLimitWindowMs,
  max: securityConfig.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const ip = req.ip || req.socket.remoteAddress;
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  },
  store: new RedisStore({
    // @ts-ignore
    sendCommand: (...args: string[]) => {
      if (redisClient.status !== 'ready' && redisClient.status !== 'connecting') {
        // Fallback to local memory-store behavior if Redis client is offline
        return Promise.reject(new Error('Redis is not ready'));
      }
      return (redisClient as any).call(...args);
    },
  }),
  message: {
    error: {
      type: 'TooManyRequests',
      message: 'Too many requests from this IP, please try again later.',
    },
  },
});

// Per-user rate limiter
export const userRateLimiter = rateLimit({
  windowMs: securityConfig.rateLimitWindowMs,
  max: Math.floor(securityConfig.rateLimitMax * 2), // Double capacity for authenticated sessions
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false },
  // keyGenerator: (req) => {
  //   return req.user ? `rate_limit_user:${req.user.id}` : `rate_limit_ip:${req.ip}`;
  // },
  keyGenerator: (req) => {
    if (req.user?.id) {
      return `user:${req.user.id}`;
    }

    return ipKeyGenerator(req.ip!);
  },
  store: new RedisStore({
    // @ts-ignore
    sendCommand: (...args: string[]) => {
      if (redisClient.status !== 'ready' && redisClient.status !== 'connecting') {
        return Promise.reject(new Error('Redis is not ready'));
      }
      return (redisClient as any).call(...args);
    },
  }),
  message: {
    error: {
      type: 'TooManyRequests',
      message: 'Too many requests. Limit exceeded.',
    },
  },
});

export default globalIpRateLimiter;
