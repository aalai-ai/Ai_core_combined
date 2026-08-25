import { Router, Request, Response } from "express";
import multer from "multer";
import mongoose from "mongoose";
import { parseFile, parseZip } from "../utils/fileParser.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Knowledge chunk schema mapping
const chunkSchema = new mongoose.Schema({
  documentId: String,
  source_document: String,
  sectionTitle: String,
  pageNumber: Number,
  contentText: String,
}, { timestamps: true });

const KnowledgeChunk = mongoose.models.KnowledgeChunk || mongoose.model("KnowledgeChunk", chunkSchema);

// Slide-window text chunker helper
function chunkText(text: string, chunkSize = 1500, overlap = 200): string[] {
  const chunks: string[] = [];
  let index = 0;
  
  while (index < text.length) {
    chunks.push(text.substring(index, index + chunkSize));
    index += chunkSize - overlap;
  }
  return chunks;
}

router.post("/upload", upload.single("file"), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded. Use field name 'file'" });
    }

    const filename = file.originalname;
    console.log(`📂 Forwarding uploaded file to Document Processing Agent: ${filename}`);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(file.buffer)], { type: file.mimetype });
    formData.append("file", blob, filename);
    if (req.body.priority) {
      formData.append("priority", req.body.priority);
    }
    if (req.body.requestedBy) {
      formData.append("requestedBy", req.body.requestedBy);
    }

    // Call the Document Parsing Agent (Knowledge Base)
    const parserUrl = (process.env.DOCUMENT_PARSER_URL || "http://localhost:3000").replace(/\/$/, "");
    const response = await fetch(`${parserUrl}/documents/upload`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload to Document Parsing Agent (Status ${response.status}): ${errorText}`);
    }

    const uploadResult = await response.json() as { documentId: string; status: string; message: string };

    console.log(`✅ File '${filename}' successfully forwarded to Document Parsing Backend. Document ID: ${uploadResult.documentId}`);

    // Poll for document processing completion (up to 12 seconds) to report actual chunks_count
    let chunksCount = 0;
    const startTime = Date.now();
    const pollTimeoutMs = 12000;

    while (Date.now() - startTime < pollTimeoutMs) {
      try {
        const statusRes = await fetch(`${parserUrl}/documents/${uploadResult.documentId}/index-status`);
        if (statusRes.ok) {
          const statusData = await statusRes.json() as any;
          if (statusData.stats && typeof statusData.stats.totalChunks === 'number') {
            chunksCount = statusData.stats.totalChunks;
          }
          if (statusData.status === 'VECTOR_SYNC_COMPLETED' || statusData.status === 'COMPLETED' || (statusData.stats && statusData.stats.syncedChunks > 0)) {
            break;
          }
        }
      } catch (pollErr) {
        // Silently retry polling
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return res.status(200).json({
      message: "File ingested successfully",
      documentId: uploadResult.documentId,
      filename,
      chunks_count: chunksCount
    });

  } catch (error: any) {
    console.error("Error processing file ingestion:", error);
    return res.status(500).json({ error: "Ingestion pipeline failed: " + error.message });
  }
});

export default router;
// Trigger watch reload v2
