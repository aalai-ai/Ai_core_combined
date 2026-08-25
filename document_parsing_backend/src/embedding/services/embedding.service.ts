import { EmbeddingProvider } from '../providers/embeddingProvider.interface';
import { OllamaEmbeddingProvider } from '../providers/ollamaEmbedding.provider';
import { config } from '../../config/config';
import { logger } from '../../utils/logger';

export interface EmbeddingResult {
  embedding: number[];
  dimensions: number;
}

export class EmbeddingService {
  private provider: EmbeddingProvider;
  private batchSize: number;

  constructor(provider?: EmbeddingProvider) {
    this.batchSize = config.embeddingBatchSize || 100;
    
    if (provider) {
      this.provider = provider;
    } else {
      const providerType = config.embeddingProvider || 'ollama';
      if (providerType === 'ollama') {
        this.provider = new OllamaEmbeddingProvider();
      } else {
        throw new Error(`Unsupported embedding provider: ${providerType}`);
      }
    }
  }

  /**
   * Generates embeddings for a list of text strings using configured batch sizes.
   * Handles empty chunks safely by producing zero-filled vectors.
   */
  public async generateEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
    if (!texts || texts.length === 0) {
      return [];
    }

    const results: EmbeddingResult[] = new Array(texts.length);
    const validIndices: number[] = [];
    const validTexts: string[] = [];

    // 1. Content Validation & Filtering
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      if (!text || text.trim() === '') {
        logger.warn(`[Embedding Service] Found empty/whitespace chunk at index ${i}. Creating placeholder.`);
        results[i] = {
          embedding: [],
          dimensions: 0,
        };
      } else {
        validIndices.push(i);
        validTexts.push(text);
      }
    }

    // If there are no valid texts to embed, return the zero vector arrays immediately
    if (validTexts.length === 0) {
      const defaultDim = config.vectorDimensions || 768; // Fallback default
      for (let i = 0; i < results.length; i++) {
        results[i] = {
          embedding: new Array(defaultDim).fill(0),
          dimensions: defaultDim,
        };
      }
      return results;
    }

    // 2. Batching execution
    const allEmbeddings: number[][] = [];
    for (let i = 0; i < validTexts.length; i += this.batchSize) {
      const batch = validTexts.slice(i, i + this.batchSize);
      logger.info(`[Embedding Service] Processing batch of size ${batch.length} (offset: ${i})`);
      
      const start = Date.now();
      const batchEmbeddings = await this.provider.generateEmbeddings(batch);
      const latency = Date.now() - start;
      
      logger.info(`[Embedding Service] Batch completed in ${latency}ms for ${batch.length} items`);
      allEmbeddings.push(...batchEmbeddings);
    }

    // 3. Assemble results back to original indices
    const dimensions = allEmbeddings[0]?.length || config.vectorDimensions || 768;

    for (let i = 0; i < validIndices.length; i++) {
      const originalIdx = validIndices[i];
      const embedding = allEmbeddings[i];
      if (originalIdx !== undefined && embedding !== undefined) {
        results[originalIdx] = {
          embedding: embedding,
          dimensions: dimensions,
        };
      }
    }

    // Backfill any zero vectors with the correct dimension size
    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      if (!res || res.dimensions === 0) {
        results[i] = {
          embedding: new Array(dimensions).fill(0),
          dimensions: dimensions,
        };
      }
    }

    return results;
  }
}

export default EmbeddingService;
