import { DocumentParser } from '../interfaces/documentParser.interface';
import { DocumentType } from '../../types/documentType';
import { ProcessingContext } from '../../processing/context/processingContext';
import { ParsedDocument, DocumentSection, ContentBlock } from '../../types/parsedDocument';
import { PdfExtractor } from './pdfExtractor';
import { readFileToBuffer } from '../../utils/fileReader';
import { BadRequestError } from '../../utils/errors';
import { MinioService } from '../../utils/minio';
import { config } from '../../config/config';
import fs from 'fs';
import path from 'path';

export class PdfParser implements DocumentParser {
  private extractor: PdfExtractor;

  constructor(extractor = new PdfExtractor()) {
    this.extractor = extractor;
  }

  /**
   * Returns true if the parser supports the requested document format.
   */
  public supports(type: DocumentType): boolean {
    return type === DocumentType.PDF;
  }

  /**
   * Converts the PDF file into a Structured Document layout.
   */
  public async parse(context: ProcessingContext): Promise<ParsedDocument> {
    // 1. Read file to buffer
    const buffer = await readFileToBuffer(context.filePath);

    // 2. Validate empty files
    if (buffer.length === 0) {
      throw new BadRequestError('Empty PDF file.');
    }

    // 3. Extract metadata and sorted lines page-by-page
    const { metadata, pages } = await this.extractor.extract(buffer);

    const sections: DocumentSection[] = [];
    let currentSection: DocumentSection | null = null;

    // Helper to add and register a new section
    const createNewSection = (title: string, level: number): DocumentSection => {
      const section: DocumentSection = {
        title,
        level,
        content: [],
      };
      sections.push(section);
      return section;
    };

    // 4. Iterate over pages and lines to group them into headings & body paragraphs
    for (const page of pages) {
      const pageNum = page.pageNumber;

      // 4a. Process and upload any extracted images first
      if (page.images && page.images.length > 0) {
        for (const img of page.images) {
          const storedFileName = `${context.documentId}_page_${pageNum}_${img.fileName}`;
          
          try {
            if (config.storageProvider === 'minio') {
              const minio = MinioService.getInstance();
              const key = `original/${storedFileName}`;
              await minio.uploadBuffer(key, img.buffer, 'image/png');
            } else {
              const originalUploadsDir = path.join(config.uploadsDir, 'original');
              if (!fs.existsSync(originalUploadsDir)) {
                fs.mkdirSync(originalUploadsDir, { recursive: true });
              }
              const localPath = path.join(originalUploadsDir, storedFileName);
              await fs.promises.writeFile(localPath, img.buffer);
            }

            // If no section has been encountered yet, construct a default body section
            if (!currentSection) {
              currentSection = createNewSection('Document Body', 1);
            }

            const imgBlock: ContentBlock = {
              type: 'image',
              content: {
                fileName: storedFileName,
                width: img.width,
                height: img.height,
                ocrStatus: 'NOT_PROCESSED',
              },
              metadata: {
                page: pageNum,
              },
            };

            currentSection.content.push(imgBlock);
          } catch (err: any) {
            // Log warning but don't fail overall PDF parsing if one image fails
            console.error(`Failed to save extracted PDF image ${storedFileName}:`, err);
          }
        }
      }

      for (const line of page.lines) {
        const text = line.text;
        const fontSize = line.fontSize;

        // Basic heading detection heuristic based on font size threshold
        // Standard body is ~9-11pt. We treat >= 13pt as a heading line.
        const isHeading = fontSize >= 13.0;

        if (isHeading) {
          // Map heading levels:
          // >= 19pt -> H1
          // >= 15pt -> H2
          // Else -> H3
          let level = 3;
          if (fontSize >= 19.0) {
            level = 1;
          } else if (fontSize >= 15.0) {
            level = 2;
          }

          currentSection = createNewSection(text, level);
        } else {
          // If no section has been encountered yet, construct a default body section
          if (!currentSection) {
            currentSection = createNewSection('Document Body', 1);
          }

          const block: ContentBlock = {
            type: 'paragraph',
            content: text,
            metadata: {
              page: pageNum, // Preserves pagination source reference
            },
          };

          currentSection.content.push(block);
        }
      }
    }

    return {
      documentId: context.documentId,
      documentType: DocumentType.PDF,
      metadata,
      sections,
    };
  }
}
export default PdfParser;
