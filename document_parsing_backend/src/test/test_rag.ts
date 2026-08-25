process.env.NODE_ENV = 'test';
import '../utils/canvasMock';
import mongoose from 'mongoose';
import { QueryProcessor } from '../rag/services/queryProcessor.service';
import { TokenBudgetManager } from '../rag/services/tokenBudgetManager.service';
import { ContextBuilder } from '../rag/services/contextBuilder.service';
import { PromptBuilder } from '../rag/services/promptBuilder.service';
import { OllamaProvider } from '../rag/providers/ollama.provider';
import { RAGService, RAGMetricsTracker } from '../rag/services/rag.service';
import { RetrievalCache } from '../retrieval/cache/retrieval.cache';
import { ChunkModel } from '../chunking/models/documentChunk';
import { DocumentModel } from '../models/Document';
import { RetrievalService } from '../retrieval/services/retrieval.service';
import { VectorRepository } from '../vector/repositories/vector.repository';
import { QdrantVectorProvider } from '../vector/providers/qdrantVector.provider';
import { QueryEmbeddingService } from '../retrieval/services/queryEmbedding.service';
import { PassThroughReranker } from '../retrieval/reranker/passthroughReranker';
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

  console.log('=== STARTING RAG PIPELINE INTEGRATION TESTS ===\n');

  // --- Test 1: Query Processor ---
  console.log('Test 1: Query Processor Normalization');
  try {
    const qp = new QueryProcessor();
    const clean = qp.processQuery('  \n  What is   the battery backup runtime?   \x07 ');
    assert(clean === 'What is the battery backup runtime?', 'Normalized multiple spaces and stripped control characters');

    let threwEmpty = false;
    try {
      qp.processQuery('    \n   ');
    } catch (_) {
      threwEmpty = true;
    }
    assert(threwEmpty, 'Threw error on whitespace-only queries');

    let threwShort = false;
    try {
      qp.processQuery('a');
    } catch (_) {
      threwShort = true;
    }
    assert(threwShort, 'Threw error on queries under 2 characters');
  } catch (err) {
    assert(false, `Test 1 failed: ${err}`);
  }

  // --- Test 2: Token Budget Manager ---
  console.log('\nTest 2: Token Budget Manager Heuristics');
  try {
    const tbm = new TokenBudgetManager();
    const estimate = tbm.estimateTokens('12345678'); // 8 chars / 4 = 2 tokens
    assert(estimate === 2, 'Token estimate is calculated as text length divided by 4');

    const dummyChunks = [
      { documentId: 'd1', chunkId: 'c1', content: 'Short chunk content', score: 0.9, title: 'Title', section: '', pageStart: 1, pageEnd: 1, slideNumber: null, metadata: {} },
      { documentId: 'd1', chunkId: 'c2', content: 'Extremely long chunk context content that exceeds budget boundaries', score: 0.8, title: 'Title', section: '', pageStart: 2, pageEnd: 2, slideNumber: null, metadata: {} },
    ];
    // Limit is 10 tokens. Chunk 1 is 19 chars -> 5 tokens. Chunk 2 is 67 chars -> 17 tokens.
    const budgeted = tbm.budgetContext(dummyChunks, 10);
    assert(budgeted.length === 1 && budgeted[0]?.chunkId === 'c1', 'Successfully dropped chunk that exceeded context token budget');
  } catch (err) {
    assert(false, `Test 2 failed: ${err}`);
  }

  // --- Test 3: Context Builder Reading Order ---
  console.log('\nTest 3: Context Builder logical reading order and deduplication');
  try {
    const cb = new ContextBuilder();
    const unsorted = [
      { documentId: 'd1', chunkId: 'c-last-2', content: 'End paragraph.', score: 0.6, title: 'Operations Guide', section: 'Calibration', pageStart: 3, pageEnd: 3, slideNumber: null, metadata: {} },
      { documentId: 'd1', chunkId: 'c-first-0', content: 'Intro paragraph.', score: 0.9, title: 'Operations Guide', section: 'Administration', pageStart: 1, pageEnd: 1, slideNumber: null, metadata: {} },
      { documentId: 'd1', chunkId: 'c-first-0', content: 'Intro paragraph.', score: 0.9, title: 'Operations Guide', section: 'Administration', pageStart: 1, pageEnd: 1, slideNumber: null, metadata: {} }, // duplicate
      { documentId: 'd1', chunkId: 'c-middle-1', content: 'Body paragraph.', score: 0.8, title: 'Operations Guide', section: 'Calibration', pageStart: 2, pageEnd: 2, slideNumber: null, metadata: {} },
    ];

    const { contextText, deduplicated } = cb.buildContext(unsorted);
    assert(deduplicated.length === 3, 'Deduplicated candidates correctly');
    assert(deduplicated[0]?.chunkId === 'c-first-0', 'First sorted chunk matches introduction');
    assert(deduplicated[1]?.chunkId === 'c-middle-1', 'Second sorted chunk matches calibration start');
    assert(deduplicated[2]?.chunkId === 'c-last-2', 'Third sorted chunk matches calibration end');
    assert(contextText.includes('Document: "Operations Guide"'), 'Context has document headers');
    assert(contextText.includes('Section: "Administration"'), 'Context has section pathway headers');
  } catch (err) {
    assert(false, `Test 3 failed: ${err}`);
  }

  // --- Test 4: Prompt Builder templating ---
  console.log('\nTest 4: Prompt Builder replacement');
  try {
    const pb = new PromptBuilder();
    const system = 'System directive';
    const context = 'Context contents';
    const query = 'User prompt question';
    const prompt = pb.buildPrompt(system, context, query);
    assert(prompt.includes(system) && prompt.includes(context) && prompt.includes(query), 'Assembled prompt contains all dynamic values');
  } catch (err) {
    assert(false, `Test 4 failed: ${err}`);
  }

  // --- Test 5: OllamaProvider Mock fallback ---
  console.log('\nTest 5: LLM Provider Abstraction & Mock Response');
  try {
    const provider = new OllamaProvider();
    const response = await provider.generateResponse('Test prompt');
    assert(response.answer.includes('[Mock Answer]'), 'Provider returned simulated mock response');
    assert(response.tokenUsage.promptTokens > 0, 'Returned estimated prompt tokens');
    assert(response.tokenUsage.completionTokens === 30, 'Returned default mock completion tokens count');
  } catch (err) {
    assert(false, `Test 5 failed: ${err}`);
  }

  // --- Test 6: End to End RAG Service ---
  console.log('\nTest 6: End-to-End RAG Service Execution');
  const testDocId = 'rag-test-doc-999';
  try {
    await mongoose.connect(config.mongoUri);
    const cache = RetrievalCache.getInstance();
    await cache.flushAll();

    // Clean any old records
    await DocumentModel.deleteOne({ documentId: testDocId });
    await ChunkModel.deleteMany({ documentId: testDocId });

    // 1. Create document
    await DocumentModel.create({
      documentId: testDocId,
      originalName: 'tech_specs.txt',
      storedName: 'tech_specs_999.txt',
      filePath: 'uploads/tech_specs.txt',
      mimeType: 'text/plain',
      extension: 'txt',
      size: 300,
      status: 'INDEXED',
      processingVersion: 1,
    });

    // 2. Create chunks
    await ChunkModel.create([
      {
        chunkId: 'chunk-tech-0',
        documentId: testDocId,
        chunkIndex: 0,
        content: 'Model X supports up to 64GB RAM storage.',
        contentType: 'TEXT',
        title: 'Technical Specification',
        tokenEstimate: 10,
        characterCount: 40,
        embedding: Array(768).fill(0.9),
        embeddingStatus: 'COMPLETED',
        embeddingDimensions: 768,
        vectorSyncStatus: 'SYNCED',
        pageStart: 1,
        pageEnd: 1,
        createdAt: new Date(),
      },
    ]);

    // 3. Vector Repository Setup
    const qProvider = new QdrantVectorProvider();
    const vectorRepo = new VectorRepository(qProvider);
    await vectorRepo.ensureCollection(768);

    await vectorRepo.upsert([
      {
        id: 'uuid-tech-0',
        vector: Array(768).fill(0.9),
        payload: { documentId: testDocId, chunkId: 'chunk-tech-0', title: 'Technical Specification', processingVersion: 1, pageStart: 1 }
      },
    ]);

    // Instantiate RetrievalService
    const mockEmbed = new QueryEmbeddingService();
    mockEmbed.generateEmbedding = async () => ({ vector: Array(768).fill(0.9), latencyMs: 1 });
    const retrievalService = new RetrievalService(vectorRepo, mockEmbed, new PassThroughReranker());

    // Instantiate RAGService
    const ragService = new RAGService(retrievalService, new OllamaProvider());

    // 4. Generate answer (cache miss)
    const ragResponse1 = await ragService.generateAnswer('How much RAM is supported?', { documentId: testDocId });
    assert(ragResponse1.answer.includes('[Mock Answer]'), 'RAG answered query using context');
    assert(ragResponse1.sources.length === 1 && ragResponse1.sources[0]?.chunkId === 'chunk-tech-0', 'Correctly resolved source attribution list');
    assert(ragResponse1.retrievedChunks.length === 1, 'Includes details of retrieved vector chunks');
    assert(ragResponse1.processingTime > 0, 'Tracks pipeline execution latency');

    // 5. Generate answer (cache hit)
    const ragResponse2 = await ragService.generateAnswer('How much RAM is supported?', { documentId: testDocId });
    assert(ragResponse2.answer.includes('[Mock Answer]'), 'Cached query returned correct answer');
    assert(ragResponse2.processingTime <= 10, 'Cached execution completed with minimal cache lookup delay');

    // 6. Verify cache metrics
    const tracker = RAGMetricsTracker.getInstance();
    const stats = tracker.getStats();
    assert(stats.totalQueries === 2, 'Recorded exactly 2 RAG queries');
    assert(stats.cacheHitRatio === 0.33, 'Cache hit ratio mapped as 0.33 (33%)');

    // Clean up
    await qProvider.deleteCollection((vectorRepo as any).collection);
    await DocumentModel.deleteOne({ documentId: testDocId });
    await ChunkModel.deleteMany({ documentId: testDocId });
    await mongoose.disconnect();
  } catch (err) {
    assert(false, `Test 6 failed: ${err}`);
    try {
      await DocumentModel.deleteOne({ documentId: testDocId });
      await ChunkModel.deleteMany({ documentId: testDocId });
      await mongoose.disconnect();
    } catch (_) { }
  }

  console.log('\n=== RAG PIPELINE INTEGRATION TESTS SUMMARY ===');
  console.log(`Passed: ${passed}/${passed + failed}`);
  console.log(`Failed: ${failed}/${passed + failed}`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
