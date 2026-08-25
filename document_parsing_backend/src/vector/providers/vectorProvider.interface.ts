export interface VectorPoint {
  id: string;
  vector: number[];
  payload: Record<string, any>;
}

export interface SearchResult {
  id: string;
  score: number;
  payload: Record<string, any>;
}

export interface VectorProvider {
  collectionExists(collectionName: string): Promise<boolean>;
  createCollection(
    collectionName: string,
    dimensions: number,
    distanceMetric: 'Cosine' | 'Euclidean' | 'Dot'
  ): Promise<void>;
  deleteCollection(collectionName: string): Promise<void>;
  upsertVectors(collectionName: string, points: VectorPoint[]): Promise<void>;
  deleteVectors(collectionName: string, ids: string[]): Promise<void>;
  deleteByFilter(collectionName: string, filter: Record<string, any>): Promise<void>;
  search(
    collectionName: string,
    vector: number[],
    limit: number,
    filter?: Record<string, any>
  ): Promise<SearchResult[]>;
  getCollectionInfo(collectionName: string): Promise<{ pointsCount: number; status: string; dimensions?: number }>;
}

export default VectorProvider;
