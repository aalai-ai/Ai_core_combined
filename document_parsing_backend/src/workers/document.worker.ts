import { Worker, Job } from 'bullmq';
import { QUEUE_NAME } from '../queue/queue.constants';
import { getRedisConnection } from '../queue/queue.config';
import { DocumentJobPayload } from '../queue/queue.types';
import { bindWorkerEvents } from '../queue/queue.events';
import { DocumentProcessorService } from '../services/documentProcessor.service';
import { DocumentRepository } from '../repositories/document.repository';
import { DocumentStatus } from '../models/Document';
import { logger } from '../utils/logger';
import { config } from '../config/config';
import { EmbeddingQueue } from '../embedding/queue/embedding.queue';

import { runWithGeneratedContext, getRequestId, getCorrelationId } from '../logging/correlation';

export class DocumentWorker {
  private worker: Worker;
  private processorService: DocumentProcessorService;
  private documentRepository: DocumentRepository;

  constructor() {
    this.processorService = new DocumentProcessorService();
    this.documentRepository = new DocumentRepository();

    const connection = getRedisConnection();
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<DocumentJobPayload>) => {
        return this.processJob(job);
      },
      {
        connection,
        concurrency: config.workerConcurrency || 1,
        prefix: config.queuePrefix,
        lockDuration: 300000, // 5 minutes to prevent lock loss during CPU-intensive PDF parsing
      }
    );

    bindWorkerEvents(this.worker);
    logger.info(`[Document Worker] Worker initialized with concurrency: ${config.workerConcurrency}`);
  }

  /**
   * Process a single popped queue job.
   */
  private async processJob(job: Job<DocumentJobPayload>): Promise<any> {
    const { documentId, requestedBy, requestId, correlationId } = job.data;
    return runWithGeneratedContext(requestId, correlationId, async () => {
      logger.info(`[Document Worker] Job ${job.id} starting. Document ID: ${documentId}, Requested By: ${requestedBy}`);

      try {
        // 1. Initial verification check for cancellation before starting
        const doc = await this.documentRepository.findByDocumentId(documentId);
        if (!doc || doc.status === DocumentStatus.CANCELLED) {
          logger.info(`[Document Worker] Job ${job.id} for document ${documentId} was marked as CANCELLED. Aborting.`);
          return { status: 'CANCELLED' };
        }

        // 2. Set progress to 10% and status to PROCESSING
        await this.documentRepository.updateStatus(documentId, DocumentStatus.PROCESSING, {
          progress: 10,
        });

        // 3. Execute processing pipeline
        await this.processorService.processDocument(documentId);

        // Fetch fresh document details to get latest version
        const freshDoc = await this.documentRepository.findByDocumentId(documentId);
        const version = freshDoc?.processingVersion || doc.processingVersion || 1;

        // 4. Update status to EMBEDDING_PENDING
        await this.documentRepository.updateStatus(documentId, DocumentStatus.EMBEDDING_PENDING, {
          progress: 90,
        });

        // 5. Automatically enqueue embedding job
        const embeddingQueue = EmbeddingQueue.getInstance();
        await embeddingQueue.addJob({
          documentId,
          processingVersion: version,
          priority: job.data.priority || 'NORMAL',
          requestId: getRequestId(),
          correlationId: getCorrelationId(),
        });

        logger.info(`[Document Worker] Job ${job.id} for document ${documentId} completed chunking. Enqueued embedding job.`);
        return { status: 'EMBEDDING_PENDING' };
      } catch (error: any) {
        const errMsg = error.message || String(error);
        logger.error(`[Document Worker] Job ${job.id} for document ${documentId} failed. Error: ${errMsg}`);

        if (errMsg.includes('cancelled') || errMsg.includes('CANCELLED')) {
          await this.documentRepository.updateStatus(documentId, DocumentStatus.CANCELLED, {
            errorDetails: 'Processing cancelled by user request.',
            progress: 0,
          });
          return { status: 'CANCELLED' };
        }

        // Record failures inside the database
        await this.documentRepository.updateStatus(documentId, DocumentStatus.FAILED, {
          errorDetails: errMsg,
        });

        throw error; // Re-throw so BullMQ registers retry attempts or failure states
      }
    });
  }

  /**
   * Graceful close of connection.
   */
  public async close(): Promise<void> {
    logger.info('[Document Worker] Worker shutting down.');
    await this.worker.close();
  }
}
export default DocumentWorker;
