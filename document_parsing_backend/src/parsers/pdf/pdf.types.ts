export interface PDFTextItem {
  str: string;
  dir: string;
  width: number;
  height: number;
  transform: number[]; // [scaleX, skewX, skewY, scaleY, x, y]
  fontName: string;
}

export interface ExtractedLine {
  y: number; // Y-coordinate of the line
  text: string; // Aggregated text for the line
  fontSize: number; // Height component from the transform matrix
  fontName: string; // Font family/style identifier
  pageNumber: number; // Source page number
}

export interface ExtractedImage {
  fileName: string;
  width: number;
  height: number;
  buffer: Buffer;
}

export interface ExtractedPage {
  pageNumber: number;
  lines: ExtractedLine[];
  images?: ExtractedImage[];
}
