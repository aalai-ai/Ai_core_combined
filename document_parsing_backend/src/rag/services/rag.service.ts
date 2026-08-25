import { RetrievalService } from '../../retrieval/services/retrieval.service';
import { LLMProvider } from '../providers/llmProvider.interface';
import { OllamaProvider } from '../providers/ollama.provider';
import { QueryProcessor } from './queryProcessor.service';
import { TokenBudgetManager } from './tokenBudgetManager.service';
import { ContextBuilder } from './contextBuilder.service';
import { PromptBuilder } from './promptBuilder.service';
import { RetrievalCache } from '../../retrieval/cache/retrieval.cache';
import { LLMConfig, RAGResponse } from '../models/rag.types';
import { SearchOptions, MetadataFilters } from '../../retrieval/models/retrieval.types';
import { config } from '../../config/config';
import { logger } from '../../utils/logger';

export class RAGMetricsTracker {
  private static instance: RAGMetricsTracker;

  private totalQueries = 0;
  private totalResponseTimeMs = 0;
  private totalLlmLatencyMs = 0;
  private totalRetrievalLatencyMs = 0;
  private totalPromptTokens = 0;
  private totalCompletionTokens = 0;

  private constructor() {}

  public static getInstance(): RAGMetricsTracker {
    if (!RAGMetricsTracker.instance) {
      RAGMetricsTracker.instance = new RAGMetricsTracker();
    }
    return RAGMetricsTracker.instance;
  }

  public recordQuery(
    responseTimeMs: number,
    llmLatencyMs: number,
    retrievalLatencyMs: number,
    promptTokens: number,
    completionTokens: number
  ) {
    this.totalQueries++;
    this.totalResponseTimeMs += responseTimeMs;
    this.totalLlmLatencyMs += llmLatencyMs;
    this.totalRetrievalLatencyMs += retrievalLatencyMs;
    this.totalPromptTokens += promptTokens;
    this.totalCompletionTokens += completionTokens;
  }

  public getStats() {
    const cacheStats = RetrievalCache.getInstance().getStats();
    const avgResponse = this.totalQueries > 0 ? this.totalResponseTimeMs / this.totalQueries : 0;
    const avgLlm = this.totalQueries > 0 ? this.totalLlmLatencyMs / this.totalQueries : 0;
    const avgRetrieval = this.totalQueries > 0 ? this.totalRetrievalLatencyMs / this.totalQueries : 0;
    const avgPrompt = this.totalQueries > 0 ? this.totalPromptTokens / this.totalQueries : 0;
    const avgCompletion = this.totalQueries > 0 ? this.totalCompletionTokens / this.totalQueries : 0;

    return {
      averageResponseTimeMs: parseFloat(avgResponse.toFixed(2)),
      averageLlmLatencyMs: parseFloat(avgLlm.toFixed(2)),
      averageRetrievalLatencyMs: parseFloat(avgRetrieval.toFixed(2)),
      averagePromptTokens: Math.round(avgPrompt),
      averageCompletionTokens: Math.round(avgCompletion),
      cacheHitRatio: cacheStats.hitRatio,
      totalQueries: this.totalQueries,
    };
  }
}

export class RAGService {
  private retrievalService: RetrievalService;
  private llmProvider: LLMProvider;
  private queryProcessor: QueryProcessor;
  private tokenManager: TokenBudgetManager;
  private contextBuilder: ContextBuilder;
  private promptBuilder: PromptBuilder;
  private cache: RetrievalCache;
  private metrics: RAGMetricsTracker;

  constructor(
    retrievalService = new RetrievalService(),
    llmProvider: LLMProvider = new OllamaProvider(),
    queryProcessor = new QueryProcessor(),
    tokenManager = new TokenBudgetManager(),
    contextBuilder = new ContextBuilder(),
    promptBuilder = new PromptBuilder()
  ) {
    this.retrievalService = retrievalService;
    this.llmProvider = llmProvider;
    this.queryProcessor = queryProcessor;
    this.tokenManager = tokenManager;
    this.contextBuilder = contextBuilder;
    this.promptBuilder = promptBuilder;
    this.cache = RetrievalCache.getInstance();
    this.metrics = RAGMetricsTracker.getInstance();
  }

  /**
   * Main RAG execution pipeline.
   */
  public async generateAnswer(
    userQuery: string,
    filters?: MetadataFilters,
    overrideLLMConfig?: LLMConfig,
    retrievalOptions?: SearchOptions
  ): Promise<RAGResponse> {
    const startTime = Date.now();

    // 1. Process and normalize query
    const normalizedQuery = this.queryProcessor.processQuery(userQuery);

    // 2. Check RAG Response Cache
    if (config.enableRagCache) {
      const cached = await this.cache.getRagResponse(normalizedQuery, filters || {}, overrideLLMConfig || {});
      if (cached) {
        logger.info(`[RAG Service] Cache hit for query: "${normalizedQuery.substring(0, 30)}..."`);
        const timeElapsed = Date.now() - startTime;
        this.metrics.recordQuery(timeElapsed, 0, 0, cached.tokenUsage.promptTokens, cached.tokenUsage.completionTokens);
        return {
          ...cached,
          processingTime: timeElapsed,
        } as RAGResponse;
      }
    }

    // 3. Execute Vector Retrieval
    const retrievalStart = Date.now();
    const retrievedChunks = await this.retrievalService.retrieve(normalizedQuery, filters, retrievalOptions);
    const retrievalLatency = Date.now() - retrievalStart;

    // 4. Build Context and Deduplicate Chunks
    const { deduplicated } = this.contextBuilder.buildContext(retrievedChunks);

    // 5. Manage Prompt Token Budgeting
    const systemPrompt = overrideLLMConfig?.systemPrompt || config.ragLlmSystemPrompt;
    const sysTokens = this.tokenManager.estimateTokens(systemPrompt);
    const queryTokens = this.tokenManager.estimateTokens(normalizedQuery);
    const responseReserve = overrideLLMConfig?.maxTokens || config.ragLlmMaxTokens || 1000;

    const maxPromptTokens = 4000; // Target total prompt space constraint
    const contextBudget = maxPromptTokens - (sysTokens + queryTokens + responseReserve);
    
    // Fit chunks within remaining token budget (fallback to minimum 1000 tokens space)
    const budgetedChunks = this.tokenManager.budgetContext(
      deduplicated,
      contextBudget > 500 ? contextBudget : 1000
    );

    // Build finalized logical context string from budgeted chunks
    const { contextText: finalContextText } = this.contextBuilder.buildContext(budgetedChunks);

    // 6. Format prompt template
    const prompt = this.promptBuilder.buildPrompt(systemPrompt, finalContextText, normalizedQuery);

    // 7. Invoke LLM Provider
    const llmStart = Date.now();
    const llmResponse = await this.llmProvider.generateResponse(prompt, overrideLLMConfig);
    const llmLatency = Date.now() - llmStart;

    // 8. Compile Source Attributions
    const sources = budgetedChunks.map(chunk => ({
      documentId: chunk.documentId,
      chunkId: chunk.chunkId,
      title: chunk.title,
      section: chunk.section || null,
      pageStart: chunk.pageStart || null,
      pageEnd: chunk.pageEnd || null,
      slideNumber: chunk.slideNumber || null,
    }));

    const totalTime = Date.now() - startTime;

    const response: RAGResponse = {
      answer: llmResponse.answer,
      sources,
      retrievedChunks: budgetedChunks,
      tokenUsage: llmResponse.tokenUsage,
      processingTime: totalTime,
      model: llmResponse.model,
    };

    // Cache final RAG response in Redis
    if (config.enableRagCache) {
      await this.cache.setRagResponse(normalizedQuery, filters || {}, overrideLLMConfig || {}, response);
    }

    // Record Metrics
    this.metrics.recordQuery(
      totalTime,
      llmLatency,
      retrievalLatency,
      llmResponse.tokenUsage.promptTokens,
      llmResponse.tokenUsage.completionTokens
    );

    logger.info(`[RAG Service] RAG Pipeline complete. Total Time: ${totalTime}ms (LLM: ${llmLatency}ms, Retrieval: ${retrievalLatency}ms)`);
    return response;
  }
}

export default RAGService;
