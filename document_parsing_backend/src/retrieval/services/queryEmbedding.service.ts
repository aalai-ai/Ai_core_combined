import { EmbeddingProvider } from '../../embedding/providers/embeddingProvider.interface';
import { OllamaEmbeddingProvider } from '../../embedding/providers/ollamaEmbedding.provider';
import { RetrievalCache } from '../cache/retrieval.cache';
import { logger } from '../../utils/logger';

export class QueryEmbeddingService {
  private provider: EmbeddingProvider;
  private cache: RetrievalCache;

  constructor(provider: EmbeddingProvider = new OllamaEmbeddingProvider()) {
    this.provider = provider;
    this.cache = RetrievalCache.getInstance();
  }

  /**
   * Generates vector coordinates for a query, consulting the cache first.
   */
  public async generateEmbedding(query: string): Promise<{ vector: number[]; latencyMs: number }> {
    const cached = await this.cache.getEmbedding(query);
    if (cached) {
      logger.info(`[Query Embedding Service] Query vector cache hit for: "${query.substring(0, 30)}..."`);
      return { vector: cached, latencyMs: 0 };
    }

    logger.info(`[Query Embedding Service] Generating query vector embedding for: "${query.substring(0, 30)}..."`);
    const start = Date.now();
    const result = await this.provider.generateEmbeddings([query]);
    const latencyMs = Date.now() - start;

    if (result && result.length > 0 && result[0] !== undefined) {
      const vector = result[0];
      await this.cache.setEmbedding(query, vector);
      return { vector, latencyMs };
    }

    throw new Error('[Query Embedding Service] Failed to generate query embedding coordinates.');
  }
}

export default QueryEmbeddingService;
