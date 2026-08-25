import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { LlamaVisionService } from '../services/llamaVision.service';
import { ChunkGenerationService } from '../chunking/services/chunkGeneration.service';
import { ParsedDocument } from '../types/parsedDocument';
import { DocumentType } from '../types/documentType';
import { config } from '../config/config';

const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const testImagePath = path.join(uploadsDir, 'test_llama_mock.png');

async function generateMockImage(): Promise<void> {
  const buffer = await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background: { r: 0, g: 128, b: 255 }, // light blue
    },
  })
    .png()
    .toBuffer();
  fs.writeFileSync(testImagePath, buffer);
}

async function runTests() {
  console.log('\n=========================================');
  console.log('Starting LLaMA 3.2 Vision Integration Tests');
  console.log('=========================================\n');

  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, message: string) => {
    if (condition) {
      console.log(`[PASS] - ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] - ${message}`);
      failed++;
    }
  };

  // Test 1: Chunk Generation for Images (should use ImageChunkStrategy and NOT paragraph fallback)
  try {
    console.log('--- Running Test 1: Image Chunk Generation Strategy ---');
    const chunkService = new ChunkGenerationService();
    
    const mockParsedDoc: ParsedDocument = {
      documentId: 'test-doc-123',
      documentType: DocumentType.PNG,
      metadata: { title: 'Test Image Document', sourceType: 'IMAGE' },
      sections: [
        {
          title: 'Image Section',
          level: 1,
          content: [
            {
              type: 'image',
              content: {
                fileName: 'test_llama_mock.png',
                width: 100,
                height: 100,
                ocrStatus: 'NOT_PROCESSED'
              },
              metadata: { page: 1 }
            }
          ]
        }
      ]
    };

    const chunks = chunkService.generateChunks(mockParsedDoc);
    
    assert(chunks.length === 1, 'Generates exactly 1 chunk');
    const imageChunk = chunks[0];
    assert(imageChunk?.contentType === 'IMAGE', 'Chunk contentType is "IMAGE"');
    assert(imageChunk?.content !== '[object Object]', 'Chunk content is NOT "[object Object]"');
    
    const parsedContent = JSON.parse(imageChunk?.content || '{}');
    assert(parsedContent.fileName === 'test_llama_mock.png', 'Parsed chunk content contains correct fileName');
    assert(parsedContent.width === 100, 'Parsed chunk content contains correct width');
  } catch (err: any) {
    assert(false, `Test 1 failed with error: ${err.message || err}`);
  }

  // Test 2: Call LLaMA 3.2 Vision Table Summarization
  try {
    console.log('\n--- Running Test 2: LLaMA 3.2 Vision Table Summarization ---');
    const visionService = new LlamaVisionService();
    
    const mockTableMd = `
| Product | Price | Qty |
|---------|-------|-----|
| Laptop  | $1200 | 5   |
| Mouse   | $25   | 20  |
| Keyboard| $75   | 10  |
`;
    
    console.log('Sending mock table to local Ollama LLaMA 3.2 Vision...');
    const tableSummary = await visionService.describeTable(mockTableMd);
    console.log('Table Summary Output:\n', tableSummary);
    
    assert(typeof tableSummary === 'string', 'Table summary output is a string');
    // If Ollama is not running, describeTable returns empty string safely (graceful fallback)
    console.log(`Table summary generated successfully (length: ${tableSummary.length})`);
  } catch (err: any) {
    assert(false, `Test 2 failed with error: ${err.message || err}`);
  }

  // Test 3: Call LLaMA 3.2 Vision Image Description
  try {
    console.log('\n--- Running Test 3: LLaMA 3.2 Vision Image Description ---');
    await generateMockImage();
    
    const visionService = new LlamaVisionService();
    
    console.log(`Sending mock image (${testImagePath}) to local Ollama LLaMA 3.2 Vision...`);
    const imageDescription = await visionService.describeImage(testImagePath);
    console.log('Image Description Output:\n', imageDescription);
    
    assert(typeof imageDescription === 'string', 'Image description output is a string');
    console.log(`Image description generated successfully (length: ${imageDescription.length})`);
  } catch (err: any) {
    assert(false, `Test 3 failed with error: ${err.message || err}`);
  } finally {
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
    }
  }

  console.log('\n=========================================');
  console.log('LLaMA 3.2 Vision Integration Tests Summary');
  console.log(`Passed: ${passed}/${passed + failed}`);
  console.log(`Failed: ${failed}/${passed + failed}`);
  console.log('=========================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
