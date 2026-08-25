import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import { PDFTextItem, ExtractedPage, ExtractedLine, ExtractedImage } from './pdf.types';
import { logger } from '../../utils/logger';
import { BadRequestError } from '../../utils/errors';
import sharp from 'sharp';

export class PdfExtractor {
  constructor() {
    // Disable worker for execution inside Node.js single thread
    if (pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = '';
    }
  }

  /**
   * Extracts raw lines of text page-by-page and parses document metadata.
   */
  public async extract(buffer: Buffer): Promise<{ metadata: any; pages: ExtractedPage[] }> {
    try {
      // Initialize pdfjs load task
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(buffer),
        useSystemFonts: true,
        disableFontFace: true, // Optimizes loading in Node.js
      });

      const pdfDoc = await loadingTask.promise;

      // Extract general metadata
      const rawMeta = await pdfDoc.getMetadata().catch((err) => {
        logger.warn('Failed to extract raw metadata from PDF:', err);
        return null;
      });

      const info = rawMeta?.info as Record<string, any> | undefined;
      const metadata = {
        title: info?.Title || info?.title || '',
        author: info?.Author || info?.author || '',
        totalPages: pdfDoc.numPages,
        creator: info?.Creator || '',
        producer: info?.Producer || '',
        creationDate: info?.CreationDate || '',
      };

      const pages: ExtractedPage[] = [];

      // Extract text content page-by-page
      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        const items = textContent.items as PDFTextItem[];

        // Group text items by Y-coordinate with a small tolerance (e.g., 3 units)
        const lineGroups = new Map<number, PDFTextItem[]>();

        for (const item of items) {
          if (!item.str || item.str.trim() === '') {
            continue;
          }

          const y = item.transform[5];
          if (y === undefined) {
            continue;
          }

          // Tolerance grouping
          const tolerance = 3.0;
          let matchedY = y;
          for (const key of lineGroups.keys()) {
            if (Math.abs(key - y) < tolerance) {
              matchedY = key;
              break;
            }
          }

          const group = lineGroups.get(matchedY) || [];
          group.push(item);
          lineGroups.set(matchedY, group);
        }

        const pageLines: ExtractedLine[] = [];

        // Sort lines from top to bottom (Y coordinate descending in PDF space)
        const sortedYKeys = Array.from(lineGroups.keys()).sort((a, b) => b - a);

        for (const y of sortedYKeys) {
          const groupItems = lineGroups.get(y) || [];
          
          // Sort text items in the same line from left to right (X coordinate ascending)
          groupItems.sort((a, b) => (a.transform[4] ?? 0) - (b.transform[4] ?? 0));

          const lineText = groupItems
            .map((item) => item.str)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();

          // Approximate font size as the max vertical scale in the transform matrix (transform[3])
          const fontSize = Math.max(
            ...groupItems.map((item) => Math.abs(item.transform[3] || 10))
          );
          const fontName = groupItems[0]?.fontName || '';

          if (lineText !== '') {
            pageLines.push({
              y,
              text: lineText,
              fontSize,
              fontName,
              pageNumber: pageNum,
            });
          }
        }

        // Extract embedded images from the page operator list
        const pageImages: ExtractedImage[] = [];
        try {
          const opList = await page.getOperatorList();
          let imageCount = 0;
          for (let i = 0; i < opList.fnArray.length; i++) {
            const fn = opList.fnArray[i];
            
            // 85: paintImageXObject, 82: paintInlineImageXObject
            if (fn === 85 || fn === 82) {
              const imgRef = opList.argsArray[i][0];
              let img: any;
              try {
                img = page.objs.get(imgRef);
              } catch (e: any) {}

              if (!img) {
                try {
                  img = page.commonObjs.get(imgRef);
                } catch (e: any) {}
              }

              if (img && img.data && img.width >= 50 && img.height >= 50) {
                const pixelCount = img.width * img.height;
                const channels = img.data.length / pixelCount;
                
                if (channels === 3 || channels === 4) {
                  imageCount++;
                  try {
                    const imageBuffer = await sharp(Buffer.from(img.data), {
                      raw: {
                        width: img.width,
                        height: img.height,
                        channels: channels as any
                      }
                    })
                    .png()
                    .toBuffer();
                    
                    pageImages.push({
                      fileName: `page_${pageNum}_img_${imageCount}.png`,
                      width: img.width,
                      height: img.height,
                      buffer: imageBuffer
                    });
                  } catch (err) {
                    logger.warn(`Failed to convert extracted PDF image to PNG: ${err}`);
                  }
                }
              }
            }
          }
        } catch (err) {
          logger.warn(`Failed to extract images from page ${pageNum}: ${err}`);
        }

        pages.push({
          pageNumber: pageNum,
          lines: pageLines,
          images: pageImages.length > 0 ? pageImages : undefined,
        });
      }

      return { metadata, pages };
    } catch (err: any) {
      logger.error('Error in PdfExtractor during parsing:', err);

      // Handle PDF-specific validation errors
      if (err.name === 'PasswordException') {
        throw new BadRequestError('Password-protected PDF files are not supported.');
      }
      if (err.name === 'InvalidPDFException') {
        throw new BadRequestError('The file is not a valid PDF or is corrupted.');
      }

      throw err;
    }
  }
}
export default PdfExtractor;
