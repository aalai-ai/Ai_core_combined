import { config } from '../config/config';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

export class LlamaVisionService {
  private resolvedModel: string | null = null;
  private fallbackTextModel: string | null = null;
  private isVisionSupported = true;

  /**
   * Helper to query Ollama and find the correct model name.
   * If 'llama3.2-vision' is configured but 'llama3.2-vision:11b' is downloaded, this resolves it.
   * It also determines if there's a text-only model available for fallback.
   */
  private async getModelName(): Promise<string> {
    if (this.resolvedModel) {
      return this.resolvedModel;
    }

    const configModel = config.visionModel || 'llama3.2-vision';
    try {
      const ollamaBaseUrl = config.ollamaBaseUrl;
      const cleanBase = ollamaBaseUrl.replace(/\/$/, '');
      const response = await fetch(`${cleanBase}/api/tags`);
      
      if (response.ok) {
        const data = await response.json() as { models?: Array<{ name: string }> };
        const models = data.models || [];
        
        // Find text fallback model (excluding embedding models)
        const textModels = models.filter(m => !m.name.includes('embed') && !m.name.includes('nomic'));
        if (textModels.length > 0) {
          const preferred = textModels.find(m => m.name.includes('qwen') || m.name.includes('llama3.1') || m.name.includes('llama3:'));
          this.fallbackTextModel = preferred ? preferred.name : textModels[0]!.name;
        }

        // 1. Check for exact match
        if (models.some(m => m.name === configModel)) {
          this.resolvedModel = configModel;
          return this.resolvedModel;
        }
        
        // 2. Check for prefix or substring matches
        const matched = models.find(m => m.name.startsWith(configModel) || m.name.includes(configModel));
        if (matched) {
          logger.info(`[Llama Vision Service] Resolved configured model '${configModel}' to local model '${matched.name}'`);
          this.resolvedModel = matched.name;
          return this.resolvedModel;
        }
      }
    } catch (err: any) {
      logger.warn(`[Llama Vision Service] Failed to list Ollama tags for model resolution: ${err.message}`);
    }

    this.resolvedModel = configModel;
    return this.resolvedModel;
  }

  /**
   * Reads an image from disk, encodes it to base64, and calls Ollama's llama3.2-vision model
   * to describe the visual content in detail.
   */
  public async describeImage(imagePath: string): Promise<string> {
    try {
      if (!fs.existsSync(imagePath)) {
        logger.warn(`[Llama Vision Service] Image file not found: ${imagePath}`);
        return '';
      }
      
      const ollamaBaseUrl = config.ollamaBaseUrl;
      const cleanBase = ollamaBaseUrl.replace(/\/$/, '');
      const model = await this.getModelName();
      
      if (!this.isVisionSupported && this.fallbackTextModel) {
        logger.info(`[Llama Vision Service] Vision is disabled/unsupported. Skipping base64 image payload, using fallback text model '${this.fallbackTextModel}' for image description.`);
        return this.describeTable(`Image file name: ${path.basename(imagePath)}. Visual details could not be extracted directly.`);
      }

      const buffer = await fs.promises.readFile(imagePath);
      const base64Image = buffer.toString('base64');
      const prompt = "Perform Optical Character Recognition (OCR). Transcribe all text, numbers, diagrams labels, and data points verbatim. Then describe the visual structure and layout clearly.";

      logger.info(`[Llama Vision Service] Calling Ollama (${cleanBase}/api/generate) with model '${model}' to describe image: ${imagePath}`);
      
      const startTime = Date.now();
      const response = await fetch(`${cleanBase}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          images: [base64Image],
          stream: false
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        if ((errorText.includes('mllama') || response.status === 500) && this.fallbackTextModel) {
          this.isVisionSupported = false;
          logger.warn(`[Llama Vision Service] Ollama returned error for vision model. If this is 'unknown model architecture: mllama', your Ollama server needs to be upgraded to v0.4.0+. Falling back to text description...`);
          return this.describeTable(`An image file named '${path.basename(imagePath)}'. Visual details could not be extracted because the local Ollama version does not support vision models.`);
        }
        throw new Error(`Ollama call failed with status: ${response.status}. Details: ${errorText}`);
      }

      const data = await response.json() as { response: string };
      const latency = Date.now() - startTime;
      logger.info(`[Llama Vision Service] Successfully generated image description in ${latency}ms.`);
      return data.response?.trim() || '';
    } catch (err: any) {
      logger.error(`[Llama Vision Service] Error describing image: ${err.message}`);
      return '';
    }
  }

  /**
   * Calls Ollama's llama3.2-vision model to analyze and summarize a markdown table.
   */
  public async describeTable(tableMarkdown: string): Promise<string> {
    try {
      const ollamaBaseUrl = config.ollamaBaseUrl;
      const cleanBase = ollamaBaseUrl.replace(/\/$/, '');
      let model = await this.getModelName();
      
      if (!this.isVisionSupported && this.fallbackTextModel) {
        logger.info(`[Llama Vision Service] Vision model unsupported on this Ollama version. Falling back to local text model '${this.fallbackTextModel}' for table summarization.`);
        model = this.fallbackTextModel;
      }

      const prompt = `You are a helpful assistant. Below is a table in Markdown format. Analyze it and provide a clear, detailed explanation or summary of its content, columns, rows, data points, and context.\n\n${tableMarkdown}`;

      logger.info(`[Llama Vision Service] Calling Ollama (${cleanBase}/api/generate) with model '${model}' to describe table.`);
      
      const startTime = Date.now();
      const response = await fetch(`${cleanBase}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (errorText.includes('mllama') && model !== this.fallbackTextModel && this.fallbackTextModel) {
          this.isVisionSupported = false;
          logger.warn(`[Llama Vision Service] LLaMA 3.2 Vision is unsupported on this Ollama instance (unknown model architecture: mllama). Retrying table description with fallback text model '${this.fallbackTextModel}'...`);
          return this.describeTable(tableMarkdown);
        }
        throw new Error(`Ollama call failed with status: ${response.status}. Details: ${errorText}`);
      }

      const data = await response.json() as { response: string };
      const latency = Date.now() - startTime;
      logger.info(`[Llama Vision Service] Successfully generated table description in ${latency}ms.`);
      return data.response?.trim() || '';
    } catch (err: any) {
      logger.error(`[Llama Vision Service] Error describing table: ${err.message}`);
      return '';
    }
  }
}

export default LlamaVisionService;
