import { LLMProvider } from './llmProvider.interface';
import { LLMResponse, LLMConfig } from '../models/rag.types';
import { config } from '../../config/config';
import { logger } from '../../utils/logger';

export class OllamaProvider implements LLMProvider {
  public name = 'OllamaProvider';

  public async generateResponse(prompt: string, overrideConfig?: LLMConfig): Promise<LLMResponse> {
    const model = overrideConfig?.model || config.ragLlmModel || 'qwen3.5:9b';
    const temperature = overrideConfig?.temperature !== undefined ? overrideConfig.temperature : (config.ragLlmTemperature || 0.2);
    const maxTokens = overrideConfig?.maxTokens || config.ragLlmMaxTokens || 1000;

    const ollamaBaseUrl = config.ollamaBaseUrl;
    const cleanBase = ollamaBaseUrl.replace(/\/$/, '');

    try {
      const startTime = Date.now();
      const response = await fetch(`${cleanBase}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          stream: false,
          options: {
            temperature,
            num_predict: maxTokens,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama call failed with status: ${response.status}. Details: ${errorText}`);
      }

      const data = await response.json() as {
        message?: { content: string };
        prompt_eval_count?: number;
        eval_count?: number;
      };

      const answer = data.message?.content || '';
      const promptTokens = data.prompt_eval_count || Math.ceil(prompt.length / 4);
      const completionTokens = data.eval_count || Math.ceil(answer.length / 4);
      const latency = Date.now() - startTime;

      logger.info(`[Ollama Provider] Generated response in ${latency}ms using model '${model}'`);

      return {
        answer,
        tokenUsage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        model,
      };
    } catch (err: any) {
      logger.error(`[Ollama Provider] Chat API failed: ${err.message || err}`);

      // Fallback for tests/local development when Ollama is offline
      if (process.env.NODE_ENV === 'test' || config.env === 'development') {
        logger.warn(`[Ollama Provider] Fallback to simulated mock response due to error.`);
        const mockAnswer = `[Mock Answer] This is a simulated response generated from prompt context. Prompt length: ${prompt.length} characters.`;
        const promptTokens = Math.ceil(prompt.length / 4);
        const completionTokens = 30;
        return {
          answer: mockAnswer,
          tokenUsage: {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
          },
          model,
        };
      }

      throw err;
    }
  }
}

export default OllamaProvider;
