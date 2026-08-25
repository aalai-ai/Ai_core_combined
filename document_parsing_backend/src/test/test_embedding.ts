import '../utils/canvasMock';
import mongoose from 'mongoose';
import { EmbeddingProvider } from '../embedding/providers/embeddingProvider.interface';
import { OllamaEmbeddingProvider } from '../embedding/providers/ollamaEmbedding.provider';
import { EmbeddingService } from '../embedding/services/embedding.service';
import { EmbeddingQueue } from '../embedding/queue/embedding.queue';
import { EmbeddingWorker } from '../embedding/workers/embedding.worker';
import { EmbeddingMetricsTracker } from '../embedding/utils/metrics';
import { ChunkEmbeddingStatus } from '../embedding/models/embedding.types';
import { ChunkModel } from '../chunking/models/documentChunk';
import { DocumentModel, DocumentStatus } from '../models/Document';
import { DocumentRepository } from '../repositories/document.repository';
import { ChunkRepository } from '../chunking/repositories/chunk.repository';
import { config } from '../config/config';

async function runTests() {
  let passed = 0;
  let failed = 0;

  const assert = (condition: any, message: string) => {
    if (condition) {
      console.log(`[PASS] - ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] - ${message}`);
      failed++;
    }
  };

  console.log('=== STARTING EMBEDDING FRAMEWORK TESTS ===\n');

  // Define a Mock Embedding Provider for testing
  class MockEmbeddingProvider implements EmbeddingProvider {
    public callCount = 0;
    public lastInputs: string[] = [];

    async generateEmbedding(text: string): Promise<number[]> {
      const res = await this.generateEmbeddings([text]);
      const val = res[0];
      if (val === undefined) {
        throw new Error('Mock generation failed');
      }
      return val;
    }

    async generateEmbeddings(texts: string[]): Promise<number[][]> {
      this.callCount++;
      this.lastInputs.push(...texts);
      // Return 3-dimensional mock vector for simplicity
      return texts.map(() => [0.1, 0.2, 0.3]);
    }
  }

  // --- Test 1: Mock Embedding Provider Interface ---
  console.log('Test 1: Mock Provider Interface');
  try {
    const mockProvider = new MockEmbeddingProvider();
    const single = await mockProvider.generateEmbedding('hello');
    assert(single.length === 3 && single[0] === 0.1, 'generateEmbedding returns correct vector');

    const multi = await mockProvider.generateEmbeddings(['a', 'b']);
    assert(multi.length === 2 && multi[0] && multi[0][1] === 0.2, 'generateEmbeddings returns list of vectors');
  } catch (err) {
    assert(false, `Test 1 failed: ${err}`);
  }

  // --- Test 2: Ollama Provider Mock Mode ---
  console.log('\nTest 2: Ollama Provider (Mock Mode when Ollama is offline or in development/test)');
  try {
    const provider = new OllamaEmbeddingProvider();
    const result = await provider.generateEmbeddings(['chunk 1', 'chunk 2']);
    assert(result.length === 2, 'Generated mock embeddings for 2 items');
    assert(result[0] && result[0].length === 768, 'Mock vector has correct 768 dimension size');
  } catch (err) {
    assert(false, `Test 2 failed: ${err}`);
  }

  // --- Test 3: Embedding Service Validation & Zero Vector ---
  console.log('\nTest 3: Embedding Service empty chunk handling');
  try {
    const mockProvider = new MockEmbeddingProvider();
    const service = new EmbeddingService(mockProvider);

    const results = await service.generateEmbeddings(['hello', '', '   ', 'world']);

    assert(results.length === 4, 'Service returned 4 vectors matching inputs');
    assert(results[0] && results[0].embedding[0] === 0.1, 'Valid chunk index 0 has real embedding');
    assert(results[1] && results[1].embedding.every(x => x === 0), 'Empty chunk index 1 is filled with zero vector');
    assert(results[2] && results[2].embedding.every(x => x === 0), 'Whitespace-only chunk index 2 is filled with zero vector');
    assert(results[3] && results[3].embedding[0] === 0.1, 'Valid chunk index 3 has real embedding');
    assert(mockProvider.callCount === 1, 'Provider was called only once');
    assert(mockProvider.lastInputs.length === 2, 'Provider only received the 2 non-empty inputs');
  } catch (err) {
    assert(false, `Test 3 failed: ${err}`);
  }

  // --- Test 4: Embedding Service Batching ---
  console.log('\nTest 4: Embedding Service Batch Partitioning');
  try {
    const mockProvider = new MockEmbeddingProvider();
    const service = new EmbeddingService(mockProvider);
    // Artificially change service batch size to 2
    (service as any).batchSize = 2;

    const results = await service.generateEmbeddings(['1', '2', '3', '4', '5']);
    assert(results.length === 5, 'Returned 5 embeddings');
    assert(mockProvider.callCount === 3, 'Split 5 items into 3 batches (2, 2, 1) properly');
  } catch (err) {
    assert(false, `Test 4 failed: ${err}`);
  }

  // --- Test 5: Metrics Tracker ---
  console.log('\nTest 5: Embedding Metrics Tracker');
  try {
    const tracker = EmbeddingMetricsTracker.getInstance();
    tracker.recordSuccess(10, 500); // 10 embeddings in 500ms
    tracker.recordFailure(2);
    tracker.recordRetry(3);

    const stats = tracker.getStats();
    assert(stats.totalGenerated === 10, 'Metrics recorded 10 success runs');
    assert(stats.averageLatencyMs === 50, 'Average latency calculated correctly as 50ms');
    assert(stats.failedCount === 2, 'Failed count recorded as 2');
    assert(stats.retryCount === 3, 'Retry count recorded as 3');
  } catch (err) {
    assert(false, `Test 5 failed: ${err}`);
  }

  // --- Test 6: Database Integration and Worker flow ---
  console.log('\nTest 6: Database Integration and Worker Processing');
  const testDocId = 'test-doc-embed-123';
  try {
    console.log(`Connecting to MongoDB at: ${config.mongoUri}`);
    await mongoose.connect(config.mongoUri);

    const docRepo = new DocumentRepository();
    const chunkRepo = new ChunkRepository();

    // Cleanup any leftovers
    await DocumentModel.deleteOne({ documentId: testDocId });
    await ChunkModel.deleteMany({ documentId: testDocId });

    // Create dummy document in chunked state
    await docRepo.create({
      documentId: testDocId,
      originalName: 'test.txt',
      storedName: 'test_123.txt',
      filePath: 'uploads/test.txt',
      mimeType: 'text/plain',
      extension: 'txt',
      size: 100,
      status: DocumentStatus.CHUNKED,
      processingVersion: 1,
    });

    // Create dummy chunks
    await chunkRepo.createMany([
      {
        chunkId: 'chunk-1',
        documentId: testDocId,
        chunkIndex: 0,
        content: 'Chunk one content',
        contentType: 'TEXT',
        title: 'Section 1',
        tokenEstimate: 5,
        characterCount: 17,
        embeddingStatus: ChunkEmbeddingStatus.PENDING,
        createdAt: new Date(),
      },
      {
        chunkId: 'chunk-2',
        documentId: testDocId,
        chunkIndex: 1,
        content: 'Chunk two content',
        contentType: 'TEXT',
        title: 'Section 2',
        tokenEstimate: 5,
        characterCount: 17,
        embeddingStatus: ChunkEmbeddingStatus.PENDING,
        createdAt: new Date(),
      },
    ]);

    // Instantiate Queue and add job
    const queue = EmbeddingQueue.getInstance();
    const job = await queue.addJob({
      documentId: testDocId,
      processingVersion: 1,
      priority: 'NORMAL',
    });

    assert(job !== undefined && job.id === testDocId, 'Enqueued job and generated matching job ID');

    // Run the worker processing logic manually (so we don't need a polling loop or separate process running)
    const worker = new EmbeddingWorker();

    // Inject mock provider into worker's service to guarantee predictable vector dimensions
    const mockProvider = new MockEmbeddingProvider();
    (worker as any).embeddingService = new EmbeddingService(mockProvider);

    // Run job execution directly
    const result = await (worker as any).processJob(job);
    assert(result.status === 'COMPLETED', 'Worker successfully completed processing job');
    assert(result.chunksProcessed === 2, 'Worker embedded both chunks');

    // Verify document status in MongoDB
    const updatedDoc = await docRepo.findByDocumentId(testDocId);
    assert(updatedDoc?.status === DocumentStatus.VECTOR_SYNC_PENDING, 'Document status updated to VECTOR_SYNC_PENDING');
    assert(updatedDoc?.progress === 95, 'Document progress updated to 95%');

    // Verify chunks status in MongoDB
    const updatedChunks = await chunkRepo.findByDocument(testDocId);
    assert(updatedChunks.length === 2, 'Two chunks remain persisted');
    assert(updatedChunks.every(c => c.embeddingStatus === ChunkEmbeddingStatus.COMPLETED), 'All chunks set to completed status');
    assert(updatedChunks.every(c => c.embedding && c.embedding.length === 3), 'All chunks have float vectors of length 3');
    assert(updatedChunks.every(c => c.embeddingDimensions === 3), 'Dimensions set to 3');
    assert(updatedChunks.every(c => c.embeddingModel === config.embeddingModel), 'Model metadata set correctly');

    // Cleanup database
    await DocumentModel.deleteOne({ documentId: testDocId });
    await ChunkModel.deleteMany({ documentId: testDocId });
    await worker.close();
    await queue.removeJob(testDocId);
    await mongoose.disconnect();
  } catch (err) {
    assert(false, `Test 6 failed: ${err}`);
    try {
      await DocumentModel.deleteOne({ documentId: testDocId });
      await ChunkModel.deleteMany({ documentId: testDocId });
      await mongoose.disconnect();
    } catch (_) { }
  }

  // --- Test 7: Worker Recoverable Retries ---
  console.log('\nTest 7: Recoverable Error Retry handling');
  try {
    await mongoose.connect(config.mongoUri);
    const docRepo = new DocumentRepository();
    const chunkRepo = new ChunkRepository();

    // Setup DB records
    await docRepo.create({
      documentId: testDocId,
      originalName: 'test.txt',
      storedName: 'test_123.txt',
      filePath: 'uploads/test.txt',
      mimeType: 'text/plain',
      extension: 'txt',
      size: 100,
      status: DocumentStatus.CHUNKED,
      processingVersion: 1,
    });

    await chunkRepo.createMany([
      {
        chunkId: 'chunk-retry',
        documentId: testDocId,
        chunkIndex: 0,
        content: 'Chunk retry content',
        contentType: 'TEXT',
        title: 'Section 1',
        tokenEstimate: 5,
        characterCount: 19,
        embeddingStatus: ChunkEmbeddingStatus.PENDING,
        createdAt: new Date(),
      },
    ]);

    const worker = new EmbeddingWorker();

    // Inject a failing provider that throws a recoverable network timeout error
    class FailingProvider implements EmbeddingProvider {
      async generateEmbedding(): Promise<number[]> { throw new Error('Timeout'); }
      async generateEmbeddings(): Promise<number[][]> { throw new Error('Timeout'); }
    }
    (worker as any).embeddingService = new EmbeddingService(new FailingProvider());

    const mockJob = {
      id: testDocId,
      data: { documentId: testDocId, processingVersion: 1, priority: 'NORMAL' },
      attemptsMade: 0, // first attempt
      opts: { attempts: 3 },
    } as any;

    let threwError = false;
    try {
      await (worker as any).processJob(mockJob);
    } catch (err: any) {
      threwError = true;
      assert(err.message === 'Timeout', 'Job threw the expected timeout error');
    }

    assert(threwError, 'Worker job failed and propagated error to queue system');

    const retriedChunk = await chunkRepo.findChunk('chunk-retry');
    assert(retriedChunk?.embeddingStatus === ChunkEmbeddingStatus.RETRYING, 'Chunk embedding status updated to RETRYING for future retry');

    // Simulate final attempt failure (attemptsMade = 2, max = 3)
    const finalJob = {
      id: testDocId,
      data: { documentId: testDocId, processingVersion: 1, priority: 'NORMAL' },
      attemptsMade: 2,
      opts: { attempts: 3 },
    } as any;

    let finalThrew = false;
    try {
      await (worker as any).processJob(finalJob);
    } catch (err) {
      finalThrew = true;
    }
    assert(finalThrew, 'Final job attempt failed and propagated error');

    const failedChunk = await chunkRepo.findChunk('chunk-retry');
    assert(failedChunk?.embeddingStatus === ChunkEmbeddingStatus.FAILED, 'Chunk embedding status set to FAILED after final attempt exhaustion');

    const docStatus = await docRepo.findByDocumentId(testDocId);
    assert(docStatus?.status === DocumentStatus.FAILED, 'Document status set to FAILED');

    // Cleanup
    await DocumentModel.deleteOne({ documentId: testDocId });
    await ChunkModel.deleteMany({ documentId: testDocId });
    await worker.close();
    await mongoose.disconnect();
  } catch (err) {
    assert(false, `Test 7 failed: ${err}`);
    try {
      await DocumentModel.deleteOne({ documentId: testDocId });
      await ChunkModel.deleteMany({ documentId: testDocId });
      await mongoose.disconnect();
    } catch (_) { }
  }

  console.log('\n=== EMBEDDING FRAMEWORK TESTS SUMMARY ===');
  console.log(`Passed: ${passed}/${passed + failed}`);
  console.log(`Failed: ${failed}/${passed + failed}`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
