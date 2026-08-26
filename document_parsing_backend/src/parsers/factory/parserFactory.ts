import { DocumentType } from '../../types/documentType';
import { DocumentParser } from '../interfaces/documentParser.interface';
import { ParserRegistry } from '../registry/parserRegistry';
import { PlaceholderParser } from '../placeholderParser';
import { PdfParser } from '../pdf/pdfParser';
import { DocxParser } from '../docx/docxParser';
import { HtmlParser } from '../html/htmlParser';
import { MarkdownParser } from '../markdown/markdownParser';
import { TxtParser } from '../txt/txtParser';
import { JsonParser } from '../json/jsonParser';
import { XmlParser } from '../xml/xmlParser';
import { CsvParser } from '../csv/csvParser';
import { XlsxParser } from '../xlsx/xlsxParser';
import { PptxParser } from '../pptx/pptxParser';
import { ImageParser } from '../image/imageParser';
import { CadParser } from '../cad/cadParser';

// Bootstrap registration of parsers for all supported document types
for (const type of Object.values(DocumentType)) {
  switch (type) {
    case DocumentType.PDF:
      ParserRegistry.register(type, new PdfParser());
      break;
    case DocumentType.DOCX:
      ParserRegistry.register(type, new DocxParser());
      break;
    case DocumentType.HTML:
      ParserRegistry.register(type, new HtmlParser());
      break;
    case DocumentType.MARKDOWN:
      ParserRegistry.register(type, new MarkdownParser());
      break;
    case DocumentType.TXT:
      ParserRegistry.register(type, new TxtParser());
      break;
    case DocumentType.JSON:
      ParserRegistry.register(type, new JsonParser());
      break;
    case DocumentType.XML:
      ParserRegistry.register(type, new XmlParser());
      break;
    case DocumentType.CSV:
      ParserRegistry.register(type, new CsvParser());
      break;
    case DocumentType.XLSX:
      ParserRegistry.register(type, new XlsxParser());
      break;
    case DocumentType.PPTX:
      ParserRegistry.register(type, new PptxParser());
      break;
    case DocumentType.PNG:
    case DocumentType.JPEG:
      ParserRegistry.register(type, new ImageParser());
      break;
    case DocumentType.DXF:
    case DocumentType.DWG:
    case DocumentType.STEP:
    case DocumentType.STP:
    case DocumentType.STL:
      ParserRegistry.register(type, new CadParser());
      break;
    default:
      ParserRegistry.register(type, new PlaceholderParser(type));
      break;
  }
}

export class ParserFactory {
  /**
   * Retrieves the parser registered for the given DocumentType.
   * Throws an error if no matching parser was registered.
   */
  public static getParser(type: DocumentType): DocumentParser {
    const parser = ParserRegistry.getParser(type);
    if (!parser) {
      throw new Error(`No parser registered for document type: ${type}`);
    }
    return parser;
  }
}
export default ParserFactory;
