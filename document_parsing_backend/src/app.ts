// Trigger hot reload for .env config update
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import { MinioService } from './utils/minio';
import { logger } from './utils/logger';
import { NotFoundError } from './utils/errors';
import { errorMiddleware } from './middlewares/error.middleware';
import { correlationMiddleware } from './middlewares/correlation.middleware';
import { globalIpRateLimiter } from './middlewares/rateLimit.middleware';
import { authMiddleware } from './middlewares/auth.middleware';
import { securityConfig, config } from './config/config';

// Import routers
import documentRoutes from './routes/document.routes';
import retrievalRoutes from './retrieval/routes/retrieval.routes';
import ragRoutes from './rag/routes/rag.routes';
import agentRoutes from './agent/routes/agent.routes';
import healthRoutes from './health/health.routes';

// Import swagger dependencies
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';

const app = express();

// 1. Trusted Proxy Support (essential for correct rate limiting behind Nginx/ELB)
app.set('trust proxy', 1);

// 2. Correlation Tracking Middleware (Generates and hooks up AsyncLocalStorage context)
app.use(correlationMiddleware);

// 3. Security Middlewares
app.use(helmet());
app.use(cors({
  origin: securityConfig.corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'x-correlation-id'],
}));

// 4. Rate Limiting (IP-based protection on all routes)
app.use(globalIpRateLimiter);

// 5. Response Compression
app.use(compression());

// 6. JSON & URL Parsers with limits configured
app.use(express.json({ limit: securityConfig.requestSizeLimit }));
app.use(express.urlencoded({ extended: true, limit: securityConfig.requestSizeLimit }));

// 7. Inject Stubbed Auth context globally for downstream usage
app.use(authMiddleware);

// 8. Mount Health Routes (Must skip health checks from strict user/auth limits if needed)
app.use('/health', healthRoutes);

// 9. API Docs (Swagger UI)
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// 10. HTTP Request Logging Middleware (using structured logging context)
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.http(`${req.method} ${req.originalUrl}`);
  next();
});

// 11. Mount Business Routes
app.use('/uploads', async (req, res, next) => {
  if (config.storageProvider === 'minio') {
    try {
      const minio = MinioService.getInstance();
      const relativeKey = req.path.replace(/^\/+/, ''); // e.g. "original/uuid.png"
      logger.info(`[App] Streaming file from MinIO: ${relativeKey}`);
      const buffer = await minio.getObjectBuffer(relativeKey);
      
      const ext = path.extname(relativeKey).toLowerCase();
      let contentType = 'application/octet-stream';
      if (ext === '.png') contentType = 'image/png';
      else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
      else if (ext === '.pdf') contentType = 'application/pdf';
      
      res.setHeader('Content-Type', contentType);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  } else {
    next();
  }
}, express.static(config.uploadsDir));
app.use('/documents', documentRoutes);
app.use('/retrieval', retrievalRoutes);
app.use('/rag', ragRoutes);
app.use('/agent', agentRoutes);

// Silent fallback handler for WebSocket handshake probes on port 3000
app.get('/ws', (_req: Request, res: Response) => {
  res.status(204).end();
});

// Catch-all NotFound Route
app.use((req: Request, _res: Response, next: NextFunction) => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
});

// Centralized Global Error Handling Middleware
app.use(errorMiddleware);

export default app;
