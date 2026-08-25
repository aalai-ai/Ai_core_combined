import { ChunkStrategy, RawChunk, ChunkMetadataContext } from '../interfaces/chunkStrategy.interface';
import { ContentBlock } from '../../types/parsedDocument';

export class ImageChunkStrategy implements ChunkStrategy {
  /**
   * Transforms an image content block (containing file details and size) into a raw image chunk.
   */
  public chunk(block: ContentBlock, context: ChunkMetadataContext): RawChunk[] {
    const page = block.metadata?.page !== undefined ? Number(block.metadata.page) : undefined;
    const contentStr = typeof block.content === 'object' ? JSON.stringify(block.content) : String(block.content);
    const imageContent = typeof block.content === 'object' ? block.content : {};

    return [
      {
        content: contentStr,
        contentType: 'IMAGE',
        pageStart: page,
        pageEnd: page,
        metadata: {
          sourceType: context.sourceType,
          fileName: imageContent.fileName || null,
          width: imageContent.width || null,
          height: imageContent.height || null,
          ...block.metadata,
        },
      },
    ];
  }
}
export default ImageChunkStrategy;
