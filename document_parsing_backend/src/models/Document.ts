import { Schema, model, Document as MongooseDocument } from 'mongoose';

export enum DocumentStatus {
  UPLOADED = 'UPLOADED',
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  PARSING = 'PARSING',
  PARSED = 'PARSED',
  EXPORTING = 'EXPORTING',
  CHUNKING = 'CHUNKING',
  CHUNKED = 'CHUNKED',
  EMBEDDING_PENDING = 'EMBEDDING_PENDING',
  EMBEDDING_IN_PROGRESS = 'EMBEDDING_IN_PROGRESS',
  EMBEDDING_COMPLETED = 'EMBEDDING_COMPLETED',
  EMBEDDED = 'EMBEDDED',
  VECTOR_SYNC_PENDING = 'VECTOR_SYNC_PENDING',
  VECTOR_SYNCING = 'VECTOR_SYNCING',
  INDEXED = 'INDEXED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export interface IDocument {
  documentId: string;
  originalName: string;
  storedName: string;
  filePath: string;
  mimeType: string;
  extension: string;
  size: number;
  uploadedAt: Date;
  status: DocumentStatus;
  metadata?: Record<string, any>;
  parsedContent?: Record<string, any>; // ParsedDocument structure
  markdownPath?: string;
  jsonPath?: string;
  chunksCount?: number;
  errorDetails?: string;
  progress?: number; // 0 to 100
  
  // Suggested Phase 11 Fields
  documentName?: string;
  documentType?: string;
  originalFileName?: string;
  storagePath?: string;
  processingTime?: number;
  processingVersion?: number;

  // Micro 3D Specifications Field
  micro3DSpecs?: Record<string, any>;

  // Soft Delete Fields
  isDeleted?: boolean;
  deletedAt?: Date;
  deletedBy?: string;
}

export type DocumentDocument = IDocument & MongooseDocument;

const DocumentSchema = new Schema<IDocument>(
  {
    documentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    originalName: {
      type: String,
      required: true,
    },
    storedName: {
      type: String,
      required: true,
    },
    filePath: {
      type: String,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    extension: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    uploadedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    status: {
      type: String,
      enum: Object.values(DocumentStatus),
      required: true,
      default: DocumentStatus.UPLOADED,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    micro3DSpecs: {
      type: Schema.Types.Mixed,
      default: {},
    },
    parsedContent: {
      type: Schema.Types.Mixed,
    },
    markdownPath: {
      type: String,
    },
    jsonPath: {
      type: String,
    },
    chunksCount: {
      type: Number,
      default: 0,
    },
    errorDetails: {
      type: String,
    },
    progress: {
      type: Number,
      default: 0,
    },
    documentName: {
      type: String,
    },
    documentType: {
      type: String,
      index: true,
    },
    originalFileName: {
      type: String,
    },
    storagePath: {
      type: String,
    },
    processingTime: {
      type: Number,
    },
    processingVersion: {
      type: Number,
      default: 1,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
    },
    deletedBy: {
      type: String,
    },
  },
  {
    timestamps: true, // Auto-manage createdAt / updatedAt
    minimize: false,  // Do not strip empty subdocuments
  }
);

// Indexes
DocumentSchema.index({ status: 1 });
DocumentSchema.index({ createdAt: 1 });

export const DocumentModel = model<IDocument>('Document', DocumentSchema);
export default DocumentModel;
