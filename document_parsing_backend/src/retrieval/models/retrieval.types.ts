export interface RetrievalConfig {
  defaultTopK: number;
  minimumScore: number;
  maxReturnedChunks: number;
  enableNeighborExpansion: boolean;
  enableReranking: boolean;
}

export interface MetadataFilters {
  documentId?: string;
  documentType?: string;
  section?: string;
  contentType?: string;
  pageNumber?: number;
  slideNumber?: number;
  processingVersion?: number;
  [key: string]: any;
}

export interface SearchOptions {
  topK?: number;
  minimumScore?: number;
  maxContextTokens?: number;
  expandNeighbors?: boolean;
  includeMetadata?: boolean;
  includeSourceReference?: boolean;
}

export interface RetrievalResult {
  documentId: string;
  chunkId: string;
  contentType?: string;
  content: string;
  score: number;
  title: string;
  section: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  slideNumber: number | null;
  metadata: Record<string, any>;
  sourceReference?: string;
}

export interface GlobalRetrievalStats {
  averageSearchLatencyMs: number;
  averageEmbeddingLatencyMs: number;
  averageVectorSearchLatencyMs: number;
  cacheHitRatio: number;
  averageScore: number;
  totalReturnedChunks: number;
  totalSearches: number;
}
