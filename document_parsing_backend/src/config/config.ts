import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config();

// Schema definitions for subconfigs
const AppConfigSchema = z.object({
  env: z.string().default('development'),
  port: z.coerce.number().default(3000),
  enableMarkdownExport: z.preprocess((val) => val !== 'false', z.boolean().default(true)),
  enableJsonExport: z.preprocess((val) => val !== 'false', z.boolean().default(true)),
});

const DatabaseConfigSchema = z.object({
  mongoUri: z.string().default('mongodb://127.0.0.1:27017/document_processor'),
  batchInsertSize: z.coerce.number().default(100),
  enableTransactions: z.preprocess((val) => val === 'true', z.boolean().default(false)),
  enableSoftDelete: z.preprocess((val) => val !== 'false', z.boolean().default(true)),
});

const QueueConfigSchema = z.object({
  redisHost: z.string().default('127.0.0.1'),
  redisPort: z.coerce.number().default(6379),
  redisPassword: z.string().optional(),
  workerConcurrency: z.coerce.number().default(1),
  maxRetries: z.coerce.number().default(3),
  retryDelay: z.coerce.number().default(5000),
  queuePrefix: z.string().default('doc_processing'),
});

const AIConfigSchema = z.object({
  openaiApiKey: z.string().optional(),
  ollamaBaseUrl: z.string().default('http://192.168.2.210:11434'),
  embeddingProvider: z.string().default('ollama'),
  embeddingModel: z.string().default('nomic-embed-text:latest'),
  embeddingBatchSize: z.coerce.number().default(100),
  embeddingMaxRetries: z.coerce.number().default(3),
  embeddingRequestTimeout: z.coerce.number().default(30000),
  visionModel: z.string().default('llama3.2-vision'),

  // Retrieval Configuration
  retrievalDefaultTopK: z.coerce.number().default(5),
  retrievalMinimumScore: z.coerce.number().default(0.7),
  retrievalMaxReturnedChunks: z.coerce.number().default(10),
  retrievalEnableNeighborExpansion: z.preprocess((val) => val === 'true', z.boolean().default(false)),
  retrievalEnableReranking: z.preprocess((val) => val === 'true', z.boolean().default(false)),
  enableRetrievalCache: z.preprocess((val) => val !== 'false', z.boolean().default(true)),

  // RAG Configuration
  ragLlmProvider: z.string().default('ollama'),
  ragLlmModel: z.string().default('qwen3.5:9b'),
  ragLlmTemperature: z.coerce.number().default(0.2),
  ragLlmMaxTokens: z.coerce.number().default(1000),
  ragLlmSystemPrompt: z.string().default("You are an expert system assistant. Answer the user's question accurately using only the provided context. Cite sources appropriately."),
  enableRagCache: z.preprocess((val) => val !== 'false', z.boolean().default(true)),

  // Agent Configuration
  agentDefaultModel: z.string().default('qwen3.5:9b'),
  agentSystemPrompt: z.string().default("You are a helpful AI Agent that orchestrates backend tasks."),
  agentMaxIterations: z.coerce.number().default(5),
  enableAgentMemory: z.preprocess((val) => val !== 'false', z.boolean().default(true)),
  enableAgentCheckpointing: z.preprocess((val) => val !== 'false', z.boolean().default(true)),
});

const VectorConfigSchema = z.object({
  qdrantHost: z.string().default('http://localhost:6333'),
  qdrantApiKey: z.string().optional(),
  collectionName: z.string().default('documents'),
  vectorDimensions: z.coerce.number().default(768),
  distanceMetric: z.enum(['Cosine', 'Euclidean', 'Dot']).default('Cosine'),
  qdrantBatchSize: z.coerce.number().default(100),
  qdrantTimeout: z.coerce.number().default(30000),
});

const SecurityConfigSchema = z.object({
  corsOrigin: z.string().default('*'),
  rateLimitWindowMs: z.coerce.number().default(15 * 60 * 1000), // 15 mins
  rateLimitMax: z.coerce.number().default(100), // limit each IP to 100 requests per windowMs
  requestSizeLimit: z.string().default('50mb'),
});

const StorageConfigSchema = z.object({
  maxUploadSize: z.coerce.number().default(52428800), // Default 50MB (52,428,800 bytes)
  uploadsDir: z.string().default('uploads'),
  storageProvider: z.enum(['local', 'minio']).default('local'),
  minioEndpoint: z.string().default('http://localhost:9000'),
  minioAccessKey: z.string().default('minioadmin'),
  minioSecretKey: z.string().default('miniopassword'),
  minioBucket: z.string().default('iiot-documents'),
});

const LoggingConfigSchema = z.object({
  logLevel: z.string().default('info'),
  logFormat: z.enum(['json', 'pretty']).default('pretty'),
});

// Full Config Schema
const ConfigSchema = z.object({
  app: AppConfigSchema,
  db: DatabaseConfigSchema,
  queue: QueueConfigSchema,
  ai: AIConfigSchema,
  vector: VectorConfigSchema,
  security: SecurityConfigSchema,
  storage: StorageConfigSchema,
  logging: LoggingConfigSchema,
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
export type QueueConfig = z.infer<typeof QueueConfigSchema>;
export type AIConfig = z.infer<typeof AIConfigSchema>;
export type VectorConfig = z.infer<typeof VectorConfigSchema>;
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;
export type StorageConfig = z.infer<typeof StorageConfigSchema>;
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;

export interface Config {
  env: string;
  port: number;
  mongoUri: string;
  maxUploadSize: number;
  uploadsDir: string;
  enableMarkdownExport: boolean;
  enableJsonExport: boolean;
  batchInsertSize: number;
  enableTransactions: boolean;
  enableSoftDelete: boolean;
  redisHost: string;
  redisPort: number;
  redisPassword?: string;
  workerConcurrency: number;
  maxRetries: number;
  retryDelay: number;
  queuePrefix: string;
  embeddingProvider: string;
  embeddingModel: string;
  embeddingBatchSize: number;
  embeddingMaxRetries: number;
  embeddingRequestTimeout: number;
  openaiApiKey?: string;
  ollamaBaseUrl: string;
  visionModel: string;
  storageProvider: 'local' | 'minio';
  minioEndpoint: string;
  minioAccessKey: string;
  minioSecretKey: string;
  minioBucket: string;
  qdrantHost: string;
  qdrantApiKey?: string;
  collectionName: string;
  vectorDimensions: number;
  distanceMetric: 'Cosine' | 'Euclidean' | 'Dot';
  qdrantBatchSize: number;
  qdrantTimeout: number;
  retrievalDefaultTopK: number;
  retrievalMinimumScore: number;
  retrievalMaxReturnedChunks: number;
  retrievalEnableNeighborExpansion: boolean;
  retrievalEnableReranking: boolean;
  enableRetrievalCache: boolean;
  ragLlmProvider: string;
  ragLlmModel: string;
  ragLlmTemperature: number;
  ragLlmMaxTokens: number;
  ragLlmSystemPrompt: string;
  enableRagCache: boolean;
  agentDefaultModel: string;
  agentSystemPrompt: string;
  agentMaxIterations: number;
  enableAgentMemory: boolean;
  enableAgentCheckpointing: boolean;
}

let rawConfig: z.infer<typeof ConfigSchema>;

try {
  rawConfig = ConfigSchema.parse({
    app: {
      env: process.env.NODE_ENV,
      port: process.env.PORT,
      enableMarkdownExport: process.env.ENABLE_MARKDOWN_EXPORT,
      enableJsonExport: process.env.ENABLE_JSON_EXPORT,
    },
    db: {
      mongoUri: process.env.MONGODB_URI,
      batchInsertSize: process.env.BATCH_INSERT_SIZE,
      enableTransactions: process.env.ENABLE_TRANSACTIONS,
      enableSoftDelete: process.env.ENABLE_SOFT_DELETE,
    },
    queue: {
      redisHost: process.env.REDIS_HOST,
      redisPort: process.env.REDIS_PORT,
      redisPassword: process.env.REDIS_PASSWORD,
      workerConcurrency: process.env.WORKER_CONCURRENCY,
      maxRetries: process.env.MAX_RETRIES,
      retryDelay: process.env.RETRY_DELAY,
      queuePrefix: process.env.QUEUE_PREFIX,
    },
    ai: {
      openaiApiKey: process.env.OPENAI_API_KEY,
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL || process.env.OLLAMA_HOST,
      embeddingProvider: process.env.EMBEDDING_PROVIDER,
      embeddingModel: process.env.EMBEDDING_MODEL,
      embeddingBatchSize: process.env.EMBEDDING_BATCH_SIZE,
      embeddingMaxRetries: process.env.EMBEDDING_MAX_RETRIES,
      embeddingRequestTimeout: process.env.EMBEDDING_REQUEST_TIMEOUT,
      visionModel: process.env.VISION_MODEL,
      retrievalDefaultTopK: process.env.RETRIEVAL_DEFAULT_TOP_K,
      retrievalMinimumScore: process.env.RETRIEVAL_MINIMUM_SCORE,
      retrievalMaxReturnedChunks: process.env.RETRIEVAL_MAX_RETURNED_CHUNKS,
      retrievalEnableNeighborExpansion: process.env.RETRIEVAL_ENABLE_NEIGHBOR_EXPANSION,
      retrievalEnableReranking: process.env.RETRIEVAL_ENABLE_RERANKING,
      enableRetrievalCache: process.env.ENABLE_RETRIEVAL_CACHE,
      ragLlmProvider: process.env.RAG_LLM_PROVIDER,
      ragLlmModel: process.env.RAG_LLM_MODEL,
      ragLlmTemperature: process.env.RAG_LLM_TEMPERATURE,
      ragLlmMaxTokens: process.env.RAG_LLM_MAX_TOKENS,
      ragLlmSystemPrompt: process.env.RAG_LLM_SYSTEM_PROMPT,
      enableRagCache: process.env.ENABLE_RAG_CACHE,
      agentDefaultModel: process.env.AGENT_DEFAULT_MODEL,
      agentSystemPrompt: process.env.AGENT_SYSTEM_PROMPT,
      agentMaxIterations: process.env.AGENT_MAX_ITERATIONS,
      enableAgentMemory: process.env.ENABLE_AGENT_MEMORY,
      enableAgentCheckpointing: process.env.ENABLE_AGENT_CHECKPOINTING,
    },
    vector: {
      qdrantHost: process.env.QDRANT_HOST,
      qdrantApiKey: process.env.QDRANT_API_KEY,
      collectionName: process.env.QDRANT_COLLECTION_NAME,
      vectorDimensions: process.env.QDRANT_VECTOR_DIMENSIONS,
      distanceMetric: process.env.QDRANT_DISTANCE_METRIC,
      qdrantBatchSize: process.env.QDRANT_SYNC_BATCH_SIZE,
      qdrantTimeout: process.env.QDRANT_TIMEOUT,
    },
    security: {
      corsOrigin: process.env.CORS_ORIGIN,
      rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS,
      rateLimitMax: process.env.RATE_LIMIT_MAX,
      requestSizeLimit: process.env.REQUEST_SIZE_LIMIT,
    },
    storage: {
      maxUploadSize: process.env.MAX_UPLOAD_SIZE,
      uploadsDir: process.env.UPLOADS_DIR,
      storageProvider: process.env.STORAGE_PROVIDER,
      minioEndpoint: process.env.MINIO_ENDPOINT,
      minioAccessKey: process.env.MINIO_ACCESS_KEY,
      minioSecretKey: process.env.MINIO_SECRET_KEY,
      minioBucket: process.env.MINIO_BUCKET,
    },
    logging: {
      logLevel: process.env.LOG_LEVEL,
      logFormat: process.env.LOG_FORMAT,
    },
  });
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('❌ Configuration validation failed:');
    error.issues.forEach((issue: z.ZodIssue) => {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    });
  } else {
    console.error('❌ Unknown configuration validation error:', error);
  }
  process.exit(1);
}



// Export parsed subconfigs
export const appConfig = rawConfig.app;
export const databaseConfig = rawConfig.db;
export const queueConfig = rawConfig.queue;
export const aiConfig = rawConfig.ai;
export const vectorConfig = rawConfig.vector;
export const securityConfig = rawConfig.security;
export const storageConfig = rawConfig.storage;
export const loggingConfig = rawConfig.logging;

// Map config object for backwards compatibility
export const config: Config = Object.freeze({
  env: rawConfig.app.env,
  port: rawConfig.app.port,
  mongoUri: rawConfig.db.mongoUri,
  maxUploadSize: rawConfig.storage.maxUploadSize,
  uploadsDir: path.resolve(process.cwd(), rawConfig.storage.uploadsDir),
  storageProvider: rawConfig.storage.storageProvider,
  minioEndpoint: rawConfig.storage.minioEndpoint,
  minioAccessKey: rawConfig.storage.minioAccessKey,
  minioSecretKey: rawConfig.storage.minioSecretKey,
  minioBucket: rawConfig.storage.minioBucket,
  enableMarkdownExport: rawConfig.app.enableMarkdownExport,
  enableJsonExport: rawConfig.app.enableJsonExport,
  batchInsertSize: rawConfig.db.batchInsertSize,
  enableTransactions: rawConfig.db.enableTransactions,
  enableSoftDelete: rawConfig.db.enableSoftDelete,
  redisHost: rawConfig.queue.redisHost,
  redisPort: rawConfig.queue.redisPort,
  redisPassword: rawConfig.queue.redisPassword,
  workerConcurrency: rawConfig.queue.workerConcurrency,
  maxRetries: rawConfig.queue.maxRetries,
  retryDelay: rawConfig.queue.retryDelay,
  queuePrefix: rawConfig.queue.queuePrefix,
  embeddingProvider: rawConfig.ai.embeddingProvider,
  embeddingModel: rawConfig.ai.embeddingModel,
  embeddingBatchSize: rawConfig.ai.embeddingBatchSize,
  embeddingMaxRetries: rawConfig.ai.embeddingMaxRetries,
  embeddingRequestTimeout: rawConfig.ai.embeddingRequestTimeout,
  openaiApiKey: rawConfig.ai.openaiApiKey,
  ollamaBaseUrl: rawConfig.ai.ollamaBaseUrl,
  visionModel: rawConfig.ai.visionModel,
  qdrantHost: rawConfig.vector.qdrantHost,
  qdrantApiKey: rawConfig.vector.qdrantApiKey,
  collectionName: rawConfig.vector.collectionName,
  vectorDimensions: rawConfig.vector.vectorDimensions,
  distanceMetric: rawConfig.vector.distanceMetric,
  qdrantBatchSize: rawConfig.vector.qdrantBatchSize,
  qdrantTimeout: rawConfig.vector.qdrantTimeout,
  retrievalDefaultTopK: rawConfig.ai.retrievalDefaultTopK,
  retrievalMinimumScore: rawConfig.ai.retrievalMinimumScore,
  retrievalMaxReturnedChunks: rawConfig.ai.retrievalMaxReturnedChunks,
  retrievalEnableNeighborExpansion: rawConfig.ai.retrievalEnableNeighborExpansion,
  retrievalEnableReranking: rawConfig.ai.retrievalEnableReranking,
  enableRetrievalCache: rawConfig.ai.enableRetrievalCache,
  ragLlmProvider: rawConfig.ai.ragLlmProvider,
  ragLlmModel: rawConfig.ai.ragLlmModel,
  ragLlmTemperature: rawConfig.ai.ragLlmTemperature,
  ragLlmMaxTokens: rawConfig.ai.ragLlmMaxTokens,
  ragLlmSystemPrompt: rawConfig.ai.ragLlmSystemPrompt,
  enableRagCache: rawConfig.ai.enableRagCache,
  agentDefaultModel: rawConfig.ai.agentDefaultModel,
  agentSystemPrompt: rawConfig.ai.agentSystemPrompt,
  agentMaxIterations: rawConfig.ai.agentMaxIterations,
  enableAgentMemory: rawConfig.ai.enableAgentMemory,
  enableAgentCheckpointing: rawConfig.ai.enableAgentCheckpointing,
});

export default config;
