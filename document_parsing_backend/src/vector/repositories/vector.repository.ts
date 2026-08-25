import { VectorProvider, VectorPoint } from '../providers/vectorProvider.interface';
import { QdrantVectorProvider } from '../providers/qdrantVector.provider';
import { config } from '../../config/config';
import { logger } from '../../utils/logger';

export class VectorRepository {
  private provider: VectorProvider;
  private collection: string;

  constructor(provider: VectorProvider = new QdrantVectorProvider()) {
    this.provider = provider;
    this.collection = config.collectionName || 'documents';
  }

  public async upsert(points: VectorPoint[]): Promise<void> {
    await this.provider.upsertVectors(this.collection, points);
  }

  public async deleteDocumentVectors(documentId: string): Promise<void> {
    await this.provider.deleteByFilter(this.collection, { documentId });
  }

  public async deleteChunkVectors(chunkIds: string[]): Promise<void> {
    await this.provider.deleteVectors(this.collection, chunkIds);
  }

  public async search(
    vector: number[],
    limit: number = 10,
    filter?: Record<string, any>
  ) {
    return this.provider.search(this.collection, vector, limit, filter);
  }

  public async searchByDocument(
    documentId: string,
    vector: number[],
    limit: number = 10
  ) {
    return this.provider.search(this.collection, vector, limit, { documentId });
  }

  public async collectionInfo() {
    return this.provider.getCollectionInfo(this.collection);
  }

  public async ensureCollection(dimensions: number): Promise<void> {
    const exists = await this.provider.collectionExists(this.collection);
    if (exists) {
      try {
        const info = await this.provider.getCollectionInfo(this.collection);
        if (info && info.dimensions !== undefined && info.dimensions !== dimensions) {
          logger.warn(`[Vector Repository] Collection '${this.collection}' dimension mismatch (Existing: ${info.dimensions}, Required: ${dimensions}). Recreating collection.`);
          await this.provider.deleteCollection(this.collection);
          await this.provider.createCollection(
            this.collection,
            dimensions,
            config.distanceMetric || 'Cosine'
          );
        }
      } catch (err: any) {
        logger.error(`[Vector Repository] Failed to verify collection dimensions: ${err.message}`);
      }
    } else {
      logger.info(`[Vector Repository] Collection '${this.collection}' does not exist. Creating it.`);
      await this.provider.createCollection(
        this.collection,
        dimensions,
        config.distanceMetric || 'Cosine'
      );
    }
  }
}

export default VectorRepository;
