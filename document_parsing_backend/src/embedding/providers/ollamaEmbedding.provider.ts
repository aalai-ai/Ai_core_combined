import { EmbeddingProvider } from './embeddingProvider.interface';
import { config } from '../../config/config';
import { logger } from '../../utils/logger';

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  private model: string;

  constructor(options?: { model?: string }) {
    this.model = options?.model || config.embeddingModel || 'nomic-embed-text:latest';
  }

  public async generateEmbedding(text: string): Promise<number[]> {
    const result = await this.generateEmbeddings([text]);
    const val = result[0];
    if (val === undefined) {
      throw new Error('Failed to generate embedding');
    }
    return val;
  }

  public async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) {
      return [];
    }

    const ollamaBaseUrl = config.ollamaBaseUrl;
    const cleanBase = ollamaBaseUrl.replace(/\/$/, '');
    const targetDim = config.vectorDimensions || 768;

    logger.debug(`[Ollama Embedding Provider] Requesting embeddings for ${texts.length} inputs using model ${this.model}`);
    
    try {
      const embeddings: number[][] = [];
      const startTime = Date.now();
      
      for (const text of texts) {
        const response = await fetch(`${cleanBase}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: this.model, prompt: text })
        });
        
        if (!response.ok) {
          throw new Error(`Ollama embedding call failed: status ${response.status}`);
        }
        
        const data = await response.json() as { embedding: number[] };
        let vector = data.embedding;
        
        if (!vector || !Array.isArray(vector)) {
          throw new Error('Invalid response structure from Ollama embeddings API');
        }

        // Adjust dimensions if necessary
        if (vector.length < targetDim) {
          vector = [...vector, ...Array(targetDim - vector.length).fill(0)];
        } else if (vector.length > targetDim) {
          vector = vector.slice(0, targetDim);
        }
        
        embeddings.push(vector);
      }
      
      const latency = Date.now() - startTime;
      logger.info(`[Ollama Embedding Provider] Generated ${embeddings.length} embeddings using model '${this.model}' in ${latency}ms.`);
      return embeddings;
    } catch (err: any) {
      logger.error(`[Ollama Embedding Provider] Failed to generate embeddings: ${err.message}`);
      
      // Fallback for tests/local development when Ollama is offline
      if (process.env.NODE_ENV === 'test' || config.env === 'development') {
        logger.warn(`[Ollama Embedding Provider] Fallback to random mock embeddings due to error.`);
        return texts.map(() => Array.from({ length: targetDim }, () => Math.random() - 0.5));
      }
      
      throw err;
    }
  }
}

export default OllamaEmbeddingProvider;
