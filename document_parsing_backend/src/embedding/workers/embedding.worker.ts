import { Worker, Job } from 'bullmq';
import { EMBEDDING_QUEUE_NAME } from '../queue/embedding.queue';
import { getRedisConnection } from '../../queue/queue.config';
import { bindWorkerEvents } from '../../queue/queue.events';
import { EmbeddingJobPayload, ChunkEmbeddingStatus } from '../models/embedding.types';
import { EmbeddingService } from '../services/embedding.service';
import { EmbeddingMetricsTracker } from '../utils/metrics';
import { DocumentRepository } from '../../repositories/document.repository';
import { ChunkRepository } from '../../chunking/repositories/chunk.repository';
import { DocumentStatus } from '../../models/Document';
import { ChunkModel } from '../../chunking/models/documentChunk';
import { logger } from '../../utils/logger';
import { config } from '../../config/config';
import { VectorQueue } from '../../vector/queue/vector.queue';
import { LlamaVisionService } from '../../services/llamaVision.service';
import { MinioService } from '../../utils/minio';
import fs from 'fs';
import path from 'path';

import { runWithGeneratedContext, getRequestId, getCorrelationId } from '../../logging/correlation';

export class EmbeddingWorker {
  private worker: Worker;
  private embeddingService: EmbeddingService;
  private documentRepository: DocumentRepository;
  private chunkRepository: ChunkRepository;
  private metricsTracker: EmbeddingMetricsTracker;

  constructor() {
    this.embeddingService = new EmbeddingService();
    this.documentRepository = new DocumentRepository();
    this.chunkRepository = new ChunkRepository();
    this.metricsTracker = EmbeddingMetricsTracker.getInstance();

    const connection = getRedisConnection();
    this.worker = new Worker(
      EMBEDDING_QUEUE_NAME,
      async (job: Job<EmbeddingJobPayload>) => {
        return this.processJob(job);
      },
      {
        connection,
        concurrency: config.workerConcurrency || 1,
        prefix: config.queuePrefix,
        lockDuration: 300000, // 5 minutes to prevent lock loss during long LLaMA Vision queries
      }
    );

    bindWorkerEvents(this.worker);
    logger.info(`[Embedding Worker] Worker initialized with concurrency: ${config.workerConcurrency}`);
  }

  /**
   * Processes a queued embedding job.
   */
  private async processJob(job: Job<EmbeddingJobPayload>): Promise<any> {
    const { documentId, chunkIds, processingVersion, requestId, correlationId } = job.data;
    return runWithGeneratedContext(requestId, correlationId, async () => {
      const attempt = job.attemptsMade + 1;
      logger.info(`[Embedding Worker] Job ${job.id} starting. Document ID: ${documentId}, Attempt: ${attempt}`);

      let chunks: any[] = [];

      try {
        // 1. Check if document exists and is not cancelled
        const doc = await this.documentRepository.findByDocumentId(documentId);
        if (!doc || doc.status === DocumentStatus.CANCELLED) {
          logger.info(`[Embedding Worker] Job ${job.id} for document ${documentId} aborted. Document is missing or CANCELLED.`);
          return { status: 'CANCELLED' };
        }

        // 2. Set document status to EMBEDDING_IN_PROGRESS
        await this.documentRepository.updateStatus(documentId, DocumentStatus.EMBEDDING_IN_PROGRESS);

        // 3. Load chunks from MongoDB
        chunks = await this.chunkRepository.findByDocument(documentId);
        if (chunkIds && chunkIds.length > 0) {
          chunks = chunks.filter(c => chunkIds.includes(c.chunkId));
        }

        if (chunks.length === 0) {
          logger.warn(`[Embedding Worker] No chunks found to process for document: ${documentId}`);
          await this.documentRepository.updateStatus(documentId, DocumentStatus.EMBEDDING_COMPLETED, {
            progress: 100,
          });
          return { status: 'COMPLETED', chunksProcessed: 0 };
        }

        logger.info(`[Embedding Worker] Found ${chunks.length} chunks to embed for document: ${documentId}`);

        // 4. Update chunk statuses to PROCESSING
        const chunkIdsToUpdate = chunks.map(c => c.chunkId);
        await ChunkModel.updateMany(
          { chunkId: { $in: chunkIdsToUpdate } },
          { $set: { embeddingStatus: ChunkEmbeddingStatus.PROCESSING } }
        );

        // 4.5 Process Tables and Images with LLaMA 3.2 Vision
        const llamaVisionService = new LlamaVisionService();
        for (const chunk of chunks) {
          if (chunk.contentType === 'TABLE') {
            logger.info(`[Embedding Worker] Analyzing table chunk ${chunk.chunkId} using LLaMA 3.2 Vision`);
            const tableSummary = await llamaVisionService.describeTable(chunk.content);
            if (tableSummary) {
              chunk.content = chunk.content + "\n\nTable Description & Analysis:\n" + tableSummary;
              logger.info(`[Embedding Worker] Enriched table chunk ${chunk.chunkId} with summary.`);
            }
          } else if (chunk.contentType === 'IMAGE') {
            logger.info(`[Embedding Worker] Analyzing image chunk ${chunk.chunkId} using LLaMA 3.2 Vision`);
            let imagePath = '';
            let tempFilePath = '';
            let imageFileName = '';

            try {
              const imageBlock = JSON.parse(chunk.content);
              imageFileName = imageBlock.fileName || (chunk.metadata && chunk.metadata.fileName) || '';
            } catch (err) {
              imageFileName = (chunk.metadata && chunk.metadata.fileName) || '';
            }

            if (!imageFileName) {
              logger.warn(`[Embedding Worker] Image filename missing for chunk ${chunk.chunkId}. Skipping LLaMA Vision.`);
              continue;
            }

            const imageKey = imageFileName.startsWith('original/') ? imageFileName : `original/${imageFileName}`;
            (chunk as any).fileName = imageKey;

            try {
              if (config.storageProvider === 'minio') {
                logger.info(`[Embedding Worker] Downloading image from MinIO: ${imageKey}`);
                const minio = MinioService.getInstance();
                const fileBuffer = await minio.getObjectBuffer(imageKey);
                
                const tempDir = path.resolve(config.uploadsDir, 'temp');
                if (!fs.existsSync(tempDir)) {
                  fs.mkdirSync(tempDir, { recursive: true });
                }
                
                const ext = path.extname(imageFileName).toLowerCase() || '.png';
                tempFilePath = path.join(tempDir, `${chunk.chunkId}${ext}`);
                await fs.promises.writeFile(tempFilePath, fileBuffer);
                imagePath = tempFilePath;
              } else {
                const pathDirect = path.resolve(config.uploadsDir, imageFileName);
                const pathRelative = path.resolve(path.dirname(doc.filePath), imageFileName);
                
                if (fs.existsSync(pathDirect)) {
                  imagePath = pathDirect;
                } else if (fs.existsSync(pathRelative)) {
                  imagePath = pathRelative;
                }
              }
            } catch (err: any) {
              logger.error(`[Embedding Worker] Failed to resolve/download image: ${err.message}`);
            }

            let imageSummary = '';
            if (imagePath && fs.existsSync(imagePath)) {
              imageSummary = await llamaVisionService.describeImage(imagePath);
              
              // Clean up temp file if created
              if (tempFilePath && fs.existsSync(tempFilePath)) {
                try {
                  await fs.promises.unlink(tempFilePath);
                  logger.debug(`[Embedding Worker] Cleaned up temp image file: ${tempFilePath}`);
                } catch (cleanupErr) {
                  // ignore
                }
              }
            } else {
              logger.warn(`[Embedding Worker] Image file not found or document is not an image for chunk ${chunk.chunkId}. Generating description from metadata.`);
              imageSummary = await llamaVisionService.describeTable(`Image Metadata: ${chunk.content}`);
            }

            let parsedBlock: any = {};
            try {
              parsedBlock = JSON.parse(chunk.content);
            } catch (err) {
              parsedBlock = {
                fileName: imageFileName,
                width: chunk.metadata?.width || 0,
                height: chunk.metadata?.height || 0,
                ocrStatus: 'NOT_PROCESSED'
              };
            }

            if (imageSummary) {
              parsedBlock.ocrStatus = 'PROCESSED';
              parsedBlock.ocrText = imageSummary;
              parsedBlock.ocrProvider = 'ollama-vision';
            } else {
              parsedBlock.ocrStatus = 'FAILED';
            }

            chunk.content = JSON.stringify(parsedBlock);
            logger.info(`[Embedding Worker] Updated image chunk ${chunk.chunkId} content with OCR status: ${parsedBlock.ocrStatus}`);
          }
        }

        // 5. Generate embeddings
        const texts = chunks.map(c => {
          if (c.contentType === 'IMAGE') {
            try {
              const block = JSON.parse(c.content);
              return block.ocrText || c.content;
            } catch (e) {
              return c.content;
            }
          }
          return c.content;
        });
        const start = Date.now();
        const results = await this.embeddingService.generateEmbeddings(texts);
        const latency = Date.now() - start;

        // 6. Update chunk records with float vectors
        const bulkOps = chunks.map((chunk, index) => {
          const res = results[index];
          const embedding = res?.embedding || [];
          const dimensions = res?.dimensions || config.vectorDimensions || 768;
          
          const updateFields: any = {
            content: chunk.content,
            embedding: embedding,
            embeddingModel: config.embeddingModel,
            embeddingVersion: processingVersion,
            embeddingCreatedAt: new Date(),
            embeddingStatus: ChunkEmbeddingStatus.COMPLETED,
            embeddingDimensions: dimensions,
          };
          
          if (chunk.contentType === 'IMAGE' && (chunk as any).fileName) {
            updateFields['metadata.fileName'] = (chunk as any).fileName;
          }

          return {
            updateOne: {
              filter: { chunkId: chunk.chunkId },
              update: {
                $set: updateFields,
              },
            },
          };
        });

        await ChunkModel.bulkWrite(bulkOps);

        // 7. Update document status to VECTOR_SYNC_PENDING and enqueue job
        await this.documentRepository.updateStatus(documentId, DocumentStatus.VECTOR_SYNC_PENDING, {
          progress: 95,
        });

        const vectorQueue = VectorQueue.getInstance();
        await vectorQueue.addJob({
          documentId,
          processingVersion,
          priority: job.data.priority || 'NORMAL',
          requestId: getRequestId(),
          correlationId: getCorrelationId(),
        });

        // 8. Record Metrics
        this.metricsTracker.recordSuccess(chunks.length, latency);
        logger.info(`[Embedding Worker] Successfully embedded ${chunks.length} chunks for document: ${documentId} in ${latency}ms`);

        return { status: 'COMPLETED', chunksProcessed: chunks.length };
      } catch (error: any) {
        const errMsg = error.message || String(error);
        logger.error(`[Embedding Worker] Job ${job.id} for document ${documentId} failed on attempt ${attempt}. Error: ${errMsg}`);

      const isRecoverable = this.isRecoverableError(error);
      const maxAttempts = job.opts.attempts || config.maxRetries || 3;

      if (chunks.length > 0) {
        if (isRecoverable && attempt < maxAttempts) {
          logger.warn(`[Embedding Worker] Job ${job.id} failed with recoverable error. Retrying... (${attempt}/${maxAttempts})`);
          
          await ChunkModel.updateMany(
            { chunkId: { $in: chunks.map(c => c.chunkId) } },
            { $set: { embeddingStatus: ChunkEmbeddingStatus.RETRYING } }
          );

          this.metricsTracker.recordRetry();
        } else {
          logger.error(`[Embedding Worker] Job ${job.id} failed permanently (Unrecoverable or Max Retries exceeded).`);
          
          await ChunkModel.updateMany(
            { chunkId: { $in: chunks.map(c => c.chunkId) } },
            { $set: { embeddingStatus: ChunkEmbeddingStatus.FAILED } }
          );

          await this.documentRepository.updateStatus(documentId, DocumentStatus.FAILED, {
            errorDetails: `Embedding failed: ${errMsg}`,
          });

          this.metricsTracker.recordFailure(chunks.length);
        }
      } else {
        await this.documentRepository.updateStatus(documentId, DocumentStatus.FAILED, {
          errorDetails: `Embedding failed: ${errMsg}`,
        });
      }

      throw error;
    }
  });
}

  /**
   * Helper to inspect error codes and determine if it's safe to retry.
   */
  private isRecoverableError(error: any): boolean {
    if (error.status) {
      if (error.status === 401 || error.status === 403 || error.status === 400) {
        return false;
      }
      return true;
    }
    
    const errMsg = String(error.message || error).toLowerCase();
    if (errMsg.includes('api key') || errMsg.includes('unauthorized') || errMsg.includes('invalid_api_key')) {
      return false;
    }

    return true;
  }

  /**
   * Graceful close of worker.
   */
  public async close(): Promise<void> {
    logger.info('[Embedding Worker] Worker shutting down.');
    await this.worker.close();
  }
}

export default EmbeddingWorker;
