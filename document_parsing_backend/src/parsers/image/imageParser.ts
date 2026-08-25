import { DocumentParser } from '../interfaces/documentParser.interface';
import { DocumentType } from '../../types/documentType';
import { ProcessingContext } from '../../processing/context/processingContext';
import { ParsedDocument } from '../../types/parsedDocument';
import { readFileToBuffer } from '../../utils/fileReader';
import { BadRequestError } from '../../utils/errors';
import { ImageExtractor } from './imageExtractor';
import { ImageNormalizer } from '../common/imageNormalizer';
import path from 'path';

export class ImageParser implements DocumentParser {
  /**
   * Indicates if the parser supports the given DocumentType.
   */
  public supports(type: DocumentType): boolean {
    return type === DocumentType.PNG || type === DocumentType.JPEG;
  }

  /**
   * Reads an image file, extracts dimensions/metadata via sharp, and maps to a ParsedDocument.
   */
  public async parse(context: ProcessingContext): Promise<ParsedDocument> {
    const buffer = await readFileToBuffer(context.filePath);

    if (buffer.length === 0) {
      throw new BadRequestError('Empty image file.');
    }

    let metadata;
    try {
      const extractor = new ImageExtractor();
      metadata = await extractor.extract(buffer);
    } catch (err: any) {
      throw new BadRequestError(`Invalid or corrupted image file: ${err.message}`);
    }

    const sections = ImageNormalizer.normalizeImage(metadata, path.basename(context.filePath));

    return {
      documentId: context.documentId,
      documentType: context.documentType, // Retain original PNG or JPEG document type
      metadata: {
        title: context.originalFileName,
        sourceType: 'IMAGE',
        format: metadata.format,
        width: metadata.width,
        height: metadata.height,
        fileSize: metadata.fileSize,
        colorSpace: metadata.colorSpace,
        totalPages: 1,
      },
      sections,
    };
  }
}
export default ImageParser;
