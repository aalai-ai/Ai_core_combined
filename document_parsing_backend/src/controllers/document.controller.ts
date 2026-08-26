import { Request, Response, NextFunction } from 'express';
import { DocumentService } from '../services/document.service';
import { QueueService } from '../queue/queue.service';
import { JOB_TYPES, JobPriorityName } from '../queue/queue.constants';
import { DocumentRepository } from '../repositories/document.repository';
import { getDocumentTypeFromExtension } from '../types/documentType';
import { NotFoundError } from '../utils/errors';
import { DocumentStatus } from '../models/Document';
import { EmbeddingQueue } from '../embedding/queue/embedding.queue';
import { EmbeddingMetricsTracker } from '../embedding/utils/metrics';
import { ChunkEmbeddingStatus } from '../embedding/models/embedding.types';
import { ChunkModel } from '../chunking/models/documentChunk';
import { VectorQueue } from '../vector/queue/vector.queue';
import { VectorSyncService } from '../vector/services/vectorSync.service';
import { VectorSyncStatus } from '../vector/models/vector.types';
import { VectorMetricsTracker } from '../vector/utils/metrics';

export class DocumentController {
  private documentService: DocumentService;
  private documentRepository: DocumentRepository;
  private queueService: QueueService;

  constructor(
    documentService = new DocumentService(),
    documentRepository = new DocumentRepository(),
    queueService = QueueService.getInstance()
  ) {
    this.documentService = documentService;
    this.documentRepository = documentRepository;
    this.queueService = queueService;
  }

  /**
   * POST /documents/upload
   * Handles document uploads, persists metadata, queues background processing, and returns 202.
   */
  public uploadDocument = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const savedDoc = await this.documentService.handleUploadedFile(req.file);
      const documentType = getDocumentTypeFromExtension(savedDoc.extension);
      const priority = (req.body.priority as JobPriorityName) || 'NORMAL';

      await this.queueService.addJob(
        JOB_TYPES.DOCUMENT_PROCESS_JOB,
        {
          documentId: savedDoc.documentId,
          documentType,
          storagePath: savedDoc.filePath,
          requestedBy: (req.body.requestedBy as string) || 'system',
          processingVersion: savedDoc.processingVersion || 1,
          priority,
          retryCount: 0,
        },
        priority
      );

      res.status(202).json({
        documentId: savedDoc.documentId,
        status: 'QUEUED',
        message: 'Document uploaded and queued for background processing.',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /documents/:id/process
   * Queues background processing for an existing uploaded document.
   */
  public processDocument = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const doc = await this.documentRepository.findByDocumentId(id || '');
      if (!doc) {
        throw new NotFoundError(`Document with ID ${id} not found.`);
      }

      const documentType = getDocumentTypeFromExtension(doc.extension);
      const priority = (req.body.priority as JobPriorityName) || 'NORMAL';

      await this.queueService.addJob(
        JOB_TYPES.DOCUMENT_PROCESS_JOB,
        {
          documentId: doc.documentId,
          documentType,
          storagePath: doc.filePath,
          requestedBy: (req.body.requestedBy as string) || 'system',
          processingVersion: doc.processingVersion || 1,
          priority,
          retryCount: 0,
        },
        priority
      );

      res.status(202).json({
        documentId: id,
        status: 'QUEUED',
        message: 'Processing queued successfully.',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /documents/:id/reprocess
   * Reprocesses a document, incrementing processing version.
   */
  public reprocessDocument = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const doc = await this.documentRepository.findByDocumentId(id || '');
      if (!doc) {
        throw new NotFoundError(`Document with ID ${id} not found.`);
      }

      const nextVersion = (doc.processingVersion || 1) + 1;
      await this.documentRepository.update({ documentId: id || '' }, { processingVersion: nextVersion });

      const documentType = getDocumentTypeFromExtension(doc.extension);
      const priority = (req.body.priority as JobPriorityName) || 'NORMAL';

      await this.queueService.addJob(
        JOB_TYPES.DOCUMENT_REPROCESS_JOB,
        {
          documentId: doc.documentId,
          documentType,
          storagePath: doc.filePath,
          requestedBy: (req.body.requestedBy as string) || 'system',
          processingVersion: nextVersion,
          priority,
          retryCount: 0,
        },
        priority
      );

      res.status(202).json({
        documentId: id,
        status: 'QUEUED',
        message: `Reprocessing queued successfully for version v${nextVersion}.`,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /documents/:id/job
   * Cancels a queued or active document processing job.
   */
  public cancelJob = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const cancelled = await this.queueService.cancelJob(id || '');
      res.status(200).json({
        documentId: id,
        cancelled,
        message: 'Cancellation signal dispatched successfully.',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /documents/:id/status
   * Retrieves the current processing status.
   */
  public getStatus = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const doc = await this.documentRepository.findByDocumentId(id || '');
      if (!doc) {
        throw new NotFoundError(`Document with ID ${id} not found.`);
      }
      res.status(200).json({
        documentId: id,
        status: doc.status,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /documents/:id/progress
   * Retrieves the processing progress percent.
   */
  public getProgress = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const doc = await this.documentRepository.findByDocumentId(id || '');
      if (!doc) {
        throw new NotFoundError(`Document with ID ${id} not found.`);
      }
      res.status(200).json({
        documentId: id,
        progress: doc.progress || 0,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /queue/stats
   * Retrieves queue statistic counts.
   */
  public getQueueStats = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const stats = await this.queueService.getQueueStats();
      res.status(200).json(stats);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /documents/:id/embed
   * Queues embedding generation for a chunked document.
   */
  public embedDocument = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const docId = (req.params.id || '') as string;
      const doc = await this.documentRepository.findByDocumentId(docId);
      if (!doc) {
        throw new NotFoundError(`Document with ID ${docId} not found.`);
      }

      const chunkCount = await ChunkModel.countDocuments({ documentId: docId });
      if (chunkCount === 0) {
        res.status(400).json({
          documentId: docId,
          message: 'Cannot generate embeddings for a document with no chunks. Parse and chunk it first.',
        });
        return;
      }

      const priority = (req.body.priority as JobPriorityName) || 'NORMAL';
      
      await this.documentRepository.updateStatus(docId, DocumentStatus.EMBEDDING_PENDING);

      const embeddingQueue = EmbeddingQueue.getInstance();
      await embeddingQueue.addJob({
        documentId: docId,
        processingVersion: doc.processingVersion || 1,
        priority,
      });

      res.status(202).json({
        documentId: docId,
        status: 'QUEUED',
        message: 'Embedding generation queued successfully.',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /documents/:id/reembed
   * Resets and re-queues embedding generation for a document.
   */
  public reembedDocument = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const docId = (req.params.id || '') as string;
      const doc = await this.documentRepository.findByDocumentId(docId);
      if (!doc) {
        throw new NotFoundError(`Document with ID ${docId} not found.`);
      }

      const chunkCount = await ChunkModel.countDocuments({ documentId: docId });
      if (chunkCount === 0) {
        res.status(400).json({
          documentId: docId,
          message: 'Cannot re-generate embeddings for a document with no chunks.',
        });
        return;
      }

      await ChunkModel.updateMany(
        { documentId: docId },
        {
          $set: {
            embeddingStatus: ChunkEmbeddingStatus.PENDING,
          },
          $unset: {
            embedding: 1,
            embeddingModel: 1,
            embeddingVersion: 1,
            embeddingCreatedAt: 1,
            embeddingDimensions: 1,
          },
        }
      );

      const priority = (req.body.priority as JobPriorityName) || 'NORMAL';
      
      await this.documentRepository.updateStatus(docId, DocumentStatus.EMBEDDING_PENDING);

      const embeddingQueue = EmbeddingQueue.getInstance();
      await embeddingQueue.addJob({
        documentId: docId,
        processingVersion: doc.processingVersion || 1,
        priority,
      });

      res.status(202).json({
        documentId: docId,
        status: 'QUEUED',
        message: 'Re-embedding generation queued successfully.',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /documents/:id/embedding-status
   * Retrieves the embedding generation progress and stats.
   */
  public getEmbeddingStatus = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const docId = (req.params.id || '') as string;
      const doc = await this.documentRepository.findByDocumentId(docId);
      if (!doc) {
        throw new NotFoundError(`Document with ID ${docId} not found.`);
      }

      const totalChunks = await ChunkModel.countDocuments({ documentId: docId });
      const completedChunks = await ChunkModel.countDocuments({ documentId: docId, embeddingStatus: ChunkEmbeddingStatus.COMPLETED });
      const pendingChunks = await ChunkModel.countDocuments({ documentId: docId, embeddingStatus: ChunkEmbeddingStatus.PENDING });
      const processingChunks = await ChunkModel.countDocuments({ documentId: docId, embeddingStatus: ChunkEmbeddingStatus.PROCESSING });
      const failedChunks = await ChunkModel.countDocuments({ documentId: docId, embeddingStatus: ChunkEmbeddingStatus.FAILED });
      const retryingChunks = await ChunkModel.countDocuments({ documentId: docId, embeddingStatus: ChunkEmbeddingStatus.RETRYING });

      res.status(200).json({
        documentId: docId,
        status: doc.status,
        progress: doc.progress || 0,
        stats: {
          totalChunks,
          completedChunks,
          pendingChunks,
          processingChunks,
          failedChunks,
          retryingChunks,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /embeddings/stats
   * Retrieves global embedding stats.
   */
  public getEmbeddingStats = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const tracker = EmbeddingMetricsTracker.getInstance();
      const stats = tracker.getStats();
      
      const embeddingQueue = EmbeddingQueue.getInstance();
      const queueStats = await embeddingQueue.getQueueStats();

      res.status(200).json({
        ...stats,
        queueSize: queueStats.waiting + queueStats.active + queueStats.delayed,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /documents/:id/index
   * Synchronizes embedded chunks of a document to Qdrant.
   */
  public indexDocument = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const docId = (req.params.id || '') as string;
      const doc = await this.documentRepository.findByDocumentId(docId);
      if (!doc) {
        throw new NotFoundError(`Document with ID ${docId} not found.`);
      }

      const chunkCount = await ChunkModel.countDocuments({ documentId: docId });
      if (chunkCount === 0) {
        res.status(400).json({
          documentId: docId,
          message: 'Cannot index document. Document has no chunks.',
        });
        return;
      }

      const completedEmbeddings = await ChunkModel.countDocuments({
        documentId: docId,
        embeddingStatus: ChunkEmbeddingStatus.COMPLETED
      });
      if (completedEmbeddings === 0) {
        res.status(400).json({
          documentId: docId,
          message: 'Cannot index document. Chunks must be embedded first.',
        });
        return;
      }

      const priority = (req.body.priority as JobPriorityName) || 'NORMAL';
      
      await this.documentRepository.updateStatus(docId, DocumentStatus.VECTOR_SYNC_PENDING);

      const vectorQueue = VectorQueue.getInstance();
      await vectorQueue.addJob({
        documentId: docId,
        processingVersion: doc.processingVersion || 1,
        priority,
      });

      res.status(202).json({
        documentId: docId,
        status: 'QUEUED',
        message: 'Vector synchronization queued successfully.',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /documents/:id/reindex
   * Resets and re-queues vector sync.
   */
  public reindexDocument = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const docId = (req.params.id || '') as string;
      const doc = await this.documentRepository.findByDocumentId(docId);
      if (!doc) {
        throw new NotFoundError(`Document with ID ${docId} not found.`);
      }

      const syncService = new VectorSyncService();
      await syncService.deleteDocumentVectors(docId);

      const priority = (req.body.priority as JobPriorityName) || 'NORMAL';
      
      await this.documentRepository.updateStatus(docId, DocumentStatus.VECTOR_SYNC_PENDING);

      const vectorQueue = VectorQueue.getInstance();
      await vectorQueue.addJob({
        documentId: docId,
        processingVersion: doc.processingVersion || 1,
        priority,
      });

      res.status(202).json({
        documentId: docId,
        status: 'QUEUED',
        message: 'Vector synchronization re-queued successfully.',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /documents/:id/index
   * Removes vectors associated with document from Qdrant.
   */
  public deleteIndex = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const docId = (req.params.id || '') as string;
      const doc = await this.documentRepository.findByDocumentId(docId);
      if (!doc) {
        throw new NotFoundError(`Document with ID ${docId} not found.`);
      }

      const syncService = new VectorSyncService();
      await syncService.deleteDocumentVectors(docId);

      await this.documentRepository.updateStatus(docId, DocumentStatus.EMBEDDING_COMPLETED);

      res.status(200).json({
        documentId: docId,
        message: 'Indexed vectors removed successfully.',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /documents/:id/index-status
   * Retrieves synchronization status and chunk stats.
   */
  public getIndexStatus = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const docId = (req.params.id || '') as string;
      const doc = await this.documentRepository.findByDocumentId(docId);
      if (!doc) {
        throw new NotFoundError(`Document with ID ${docId} not found.`);
      }

      const totalChunks = await ChunkModel.countDocuments({ documentId: docId });
      const syncedChunks = await ChunkModel.countDocuments({ documentId: docId, vectorSyncStatus: VectorSyncStatus.SYNCED });
      const pendingSyncs = await ChunkModel.countDocuments({ documentId: docId, vectorSyncStatus: VectorSyncStatus.PENDING });
      const syncingChunks = await ChunkModel.countDocuments({ documentId: docId, vectorSyncStatus: VectorSyncStatus.SYNCING });
      const failedSyncs = await ChunkModel.countDocuments({ documentId: docId, vectorSyncStatus: VectorSyncStatus.FAILED });
      const retryingSyncs = await ChunkModel.countDocuments({ documentId: docId, vectorSyncStatus: VectorSyncStatus.RETRYING });

      res.status(200).json({
        documentId: docId,
        status: doc.status,
        progress: doc.progress || 0,
        stats: {
          totalChunks,
          syncedChunks,
          pendingSyncs,
          syncingChunks,
          failedSyncs,
          retryingSyncs,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /vector/stats
   * Retrieves global vector stats.
   */
  public getVectorStats = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const tracker = VectorMetricsTracker.getInstance();
      const stats = tracker.getStats();

      const vectorQueue = VectorQueue.getInstance();
      const queueStats = await vectorQueue.getQueueStats();

      res.status(200).json({
        ...stats,
        queueSize: queueStats.waiting + queueStats.active + queueStats.delayed,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /documents/:id/dimensions
   * Retrieves extracted 3D micro-specifications for a document.
   */
  public getDimensions = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const docId = (req.params.id || '') as string;
      const doc = await this.documentRepository.findByDocumentId(docId);
      if (!doc) {
        throw new NotFoundError(`Document with ID ${docId} not found.`);
      }

      if (!doc.micro3DSpecs || Object.keys(doc.micro3DSpecs).length === 0) {
        const extractor = new (require('../services/microDetailExtractor.service').MicroDetailExtractorService)();
        const text = doc.parsedContent ? JSON.stringify(doc.parsedContent) : doc.originalName;
        doc.micro3DSpecs = await extractor.extract3DSpecs(text, [doc.filePath]);
        await this.documentRepository.update({ documentId: docId }, { micro3DSpecs: doc.micro3DSpecs });
      }

      res.status(200).json({
        documentId: docId,
        dimensions: doc.micro3DSpecs,
      });
    } catch (error) {
      next(error);
    }
  };
}
