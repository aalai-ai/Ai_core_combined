export enum DocumentType {
  PDF = 'PDF',
  DOCX = 'DOCX',
  XLSX = 'XLSX',
  CSV = 'CSV',
  XML = 'XML',
  JSON = 'JSON',
  TXT = 'TXT',
  HTML = 'HTML',
  MARKDOWN = 'MARKDOWN',
  PPTX = 'PPTX',
  PNG = 'PNG',
  JPEG = 'JPEG',
  DXF = 'DXF',
  DWG = 'DWG',
  STEP = 'STEP',
  STP = 'STP',
  STL = 'STL',
}

/**
 * Resolves the DocumentType enum based on file extension.
 * Handles both dot-prefixed and raw extensions.
 * Throws an error for unsupported extensions.
 */
export function getDocumentTypeFromExtension(ext: string): DocumentType {
  const cleanExt = ext.replace('.', '').trim().toUpperCase();

  switch (cleanExt) {
    case 'PDF':
      return DocumentType.PDF;
    case 'DOCX':
      return DocumentType.DOCX;
    case 'XLSX':
      return DocumentType.XLSX;
    case 'CSV':
      return DocumentType.CSV;
    case 'XML':
      return DocumentType.XML;
    case 'JSON':
      return DocumentType.JSON;
    case 'TXT':
      return DocumentType.TXT;
    case 'HTML':
    case 'HTM':
      return DocumentType.HTML;
    case 'MD':
    case 'MARKDOWN':
      return DocumentType.MARKDOWN;
    case 'PPTX':
      return DocumentType.PPTX;
    case 'PNG':
      return DocumentType.PNG;
    case 'JPG':
    case 'JPEG':
      return DocumentType.JPEG;
    case 'DXF':
      return DocumentType.DXF;
    case 'DWG':
      return DocumentType.DWG;
    case 'STEP':
      return DocumentType.STEP;
    case 'STP':
      return DocumentType.STP;
    case 'STL':
      return DocumentType.STL;
    default:
      throw new Error(`Unsupported document extension: ${ext}`);
  }
}
export default DocumentType;
