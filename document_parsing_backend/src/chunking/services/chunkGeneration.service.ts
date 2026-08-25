import { ParsedDocument } from '../../types/parsedDocument';
import { DocumentChunk } from '../../types/documentChunk';
import { TokenEstimator } from '../utils/tokenEstimator';
import { ChunkStrategy, RawChunk, ChunkMetadataContext } from '../interfaces/chunkStrategy.interface';
import { HeadingChunkStrategy } from '../strategies/headingChunkStrategy';
import { ParagraphChunkStrategy } from '../strategies/paragraphChunkStrategy';
import { TableChunkStrategy } from '../strategies/tableChunkStrategy';
import { StructuredDataChunkStrategy } from '../strategies/structuredDataChunkStrategy';
import { SpreadsheetChunkStrategy } from '../strategies/spreadsheetChunkStrategy';
import { PresentationChunkStrategy } from '../strategies/presentationChunkStrategy';
import { ImageChunkStrategy } from '../strategies/imageChunkStrategy';

export interface ChunkSettings {
  maxChunkTokens?: number;
  minChunkTokens?: number;
  mergeSmallChunks?: boolean;
  preserveTables?: boolean;
  preserveMetadata?: boolean;
}

export class ChunkGenerationService {
  private settings: Required<ChunkSettings>;
  private strategies: Map<string, ChunkStrategy>;

  constructor(settings: ChunkSettings = {}) {
    this.settings = {
      maxChunkTokens: settings.maxChunkTokens ?? 500,
      minChunkTokens: settings.minChunkTokens ?? 50,
      mergeSmallChunks: settings.mergeSmallChunks ?? true,
      preserveTables: settings.preserveTables ?? true,
      preserveMetadata: settings.preserveMetadata ?? true,
    };

    this.strategies = new Map<string, ChunkStrategy>([
      ['heading', new HeadingChunkStrategy()],
      ['paragraph', new ParagraphChunkStrategy()],
      ['list', new ParagraphChunkStrategy()],
      ['image', new ImageChunkStrategy()],
      ['table', new TableChunkStrategy()],
      ['json', new StructuredDataChunkStrategy()],
      ['json-array', new StructuredDataChunkStrategy()],
      ['xml', new StructuredDataChunkStrategy()],
      ['xml-array', new StructuredDataChunkStrategy()],
      ['spreadsheet', new SpreadsheetChunkStrategy()],
      ['slide', new PresentationChunkStrategy()],
    ]);
  }

  /**
   * Orchestrates document decomposition. Traverses sections, matches blocks to strategies, and merges text.
   */
  public generateChunks(doc: ParsedDocument): DocumentChunk[] {
    if (!doc) {
      throw new Error('Invalid ParsedDocument: Document is null or undefined.');
    }

    const docId = doc.documentId;
    const docTitle = doc.metadata?.title || 'Unknown';
    const sourceType = doc.metadata?.sourceType || 'Unknown';

    const finalChunks: DocumentChunk[] = [];
    let globalChunkIndex = 0;

    for (const section of doc.sections) {
      // 1. Find slide notes inside section if present
      let sectionNotes = '';
      for (const block of section.content) {
        if (block.type === 'notes') {
          sectionNotes = String(block.content);
          break;
        }
      }

      // 2. Generate raw chunks for each content block in section
      const rawChunks: RawChunk[] = [];

      for (const block of section.content) {
        // Skip standalone notes block as it gets integrated inside slide block strategy
        if (block.type === 'notes') {
          continue;
        }

        const strategy = this.strategies.get(block.type);
        if (!strategy) {
          // Fallback strategy for unsupported blocks
          const fallback = new ParagraphChunkStrategy();
          const context: ChunkMetadataContext = {
            documentId: docId,
            title: docTitle,
            section: section.title,
            sourceType,
          };
          rawChunks.push(...fallback.chunk(block, context));
          continue;
        }

        const context = {
          documentId: docId,
          title: docTitle,
          section: section.title,
          sourceType,
          notes: sectionNotes,
        };

        rawChunks.push(...strategy.chunk(block, context));
      }

      // 3. Apply semantic merge builder
      const mergedSectionChunks = this.mergeSectionChunks(rawChunks);

      // 4. Finalize document chunk structures
      for (const raw of mergedSectionChunks) {
        const charCount = raw.content.length;
        const tokenEst = TokenEstimator.estimateTokens(raw.content);

        const chunk: DocumentChunk = {
          chunkId: `chunk-${docId}-${globalChunkIndex}`,
          documentId: docId,
          chunkIndex: globalChunkIndex,
          content: raw.content,
          contentType: raw.contentType,
          title: docTitle,
          section: section.title,
          pageStart: raw.pageStart,
          pageEnd: raw.pageEnd,
          slideNumber: raw.slideNumber,
          metadata: this.settings.preserveMetadata ? raw.metadata : undefined,
          tokenEstimate: tokenEst,
          characterCount: charCount,
          createdAt: new Date(),
        };

        finalChunks.push(chunk);
        globalChunkIndex++;
      }
    }

    return finalChunks;
  }

  /**
   * Merges contiguous small text blocks within a section up to maxChunkTokens limit.
   */
  private mergeSectionChunks(rawChunks: RawChunk[]): RawChunk[] {
    if (rawChunks.length === 0) return [];
    if (!this.settings.mergeSmallChunks) return rawChunks;

    const merged: RawChunk[] = [];
    let currentTextChunk: RawChunk | null = null;

    for (const chunk of rawChunks) {
      const isMergeable = chunk.contentType === 'TEXT' || chunk.contentType === 'HEADING';

      if (!isMergeable) {
        // Flush any active text block first
        if (currentTextChunk) {
          merged.push(currentTextChunk);
          currentTextChunk = null;
        }
        merged.push(chunk);
        continue;
      }

      if (!currentTextChunk) {
        currentTextChunk = { ...chunk };
        currentTextChunk.contentType = 'TEXT';
      } else {
        const potentialContent = currentTextChunk.content + '\n\n' + chunk.content;
        const potentialTokens = TokenEstimator.estimateTokens(potentialContent);

        if (potentialTokens <= this.settings.maxChunkTokens) {
          currentTextChunk.content = potentialContent;
          
          if (chunk.pageStart !== undefined) {
            currentTextChunk.pageStart = currentTextChunk.pageStart !== undefined
              ? Math.min(currentTextChunk.pageStart, chunk.pageStart)
              : chunk.pageStart;
          }
          if (chunk.pageEnd !== undefined) {
            currentTextChunk.pageEnd = currentTextChunk.pageEnd !== undefined
              ? Math.max(currentTextChunk.pageEnd, chunk.pageEnd)
              : chunk.pageEnd;
          }

          if (chunk.metadata || currentTextChunk.metadata) {
            currentTextChunk.metadata = {
              ...currentTextChunk.metadata,
              ...chunk.metadata,
            };
          }
        } else {
          // Flush current and start a new merged block
          merged.push(currentTextChunk);
          currentTextChunk = { ...chunk };
          currentTextChunk.contentType = 'TEXT';
        }
      }
    }

    if (currentTextChunk) {
      merged.push(currentTextChunk);
    }

    return merged;
  }
}
export default ChunkGenerationService;
