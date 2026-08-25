# Application Architecture: Document Parsing Backend

This document details the internal architecture, multi-format ingestion pipeline, asynchronous job queues, vector embedding engine, and storage integrations for **Document Parsing Backend**.

---

## 1. Overview & Tech Stack

- **Runtime**: Node.js with TypeScript (`tsx watch`)
- **Web Framework**: Express.js with Helmet & Rate Limiting
- **Async Job Queue**: BullMQ with Redis (`ioredis`)
- **Vector Database**: Qdrant (`@qdrant/js-client-rest`)
- **Object Storage**: MinIO / S3 (`@aws-sdk/client-s3`)
- **Metadata Database**: MongoDB (`mongoose`)
- **Document Extractors**: `pdfjs-dist`, `pdf-parse`, `mammoth` (DOCX), `sharp` (OCR), `csv-parse`, `xlsx`
- **Embedding Model**: Ollama (`nomic-embed-text`, 768 dimensions)

---

## 2. Internal Module Architecture Diagram

```mermaid
flowchart TD
    subgraph ExpressAPI ["Express REST API Layer (Port 3000)"]
        ServerApp["server.ts & app.ts Entry"]
        
        subgraph ControllersRoutes ["API Controllers & Routes"]
            ParseCtrl["parsing.routes.ts & parsing.controller.ts\n(/parsing/upload, /parsing/status)"]
            RetCtrl["retrieval.routes.ts & retrieval.controller.ts\n(/retrieval/search, /retrieval/grounding)"]
            DocCtrl["document.routes.ts & document.controller.ts\n(/documents)"]
            RagCtrl["rag.routes.ts & rag.controller.ts\n(/rag)"]
        end
    end

    subgraph AsyncQueue ["Asynchronous Queue & Worker Layer"]
        QueueProducer["queue/documentQueue.ts\n(BullMQ Queue Producer)"]
        RedisServer[("Redis Server (Port 6379)\nBullMQ Job Storage & Rate Limiter")]
        QueueWorker["workers/documentWorker.ts\n(BullMQ Background Worker)"]
    end

    subgraph IngestionPipeline ["Document Processing Pipeline"]
        StorageProvider["services/storage/storageService.ts\n(MinIO S3 Client / Local File Storage)"]

        subgraph ParserSuite ["Format Extractors"]
            PDFExtractor["PDF Parser (pdf-parse / pdfjs)"]
            WordExtractor["Word Parser (mammoth)"]
            ExcelExtractor["Excel/CSV Parser (xlsx / csv-parse)"]
            OCRExtractor["Image OCR (sharp)"]
        end

        ChunkerEngine["chunking/\n(Hierarchical, Semantic, & Fixed Chunkers)"]
        EmbeddingService["embedding/ollamaEmbedding.ts\n(Ollama nomic-embed-text Provider)"]
        VectorRepo["vector/qdrantClient.ts\n(Qdrant Vector DB Client & Repository)"]
    end

    subgraph Datastores ["Database & Storage Infrastructure"]
        MinIOBucket[("MinIO S3 Storage\nBucket: ai-upload-doc")]
        MongoDBDoc[("MongoDB Database\ndocument_processor")]
        QdrantDB[("Qdrant Vector DB\nCollection: documents (768-dims)")]
        OllamaServer["Ollama Server (Port 11434)\nEmbedding Model: nomic-embed-text"]
    end

    %% Internal Wiring
    ServerApp --> ControllersRoutes
    ParseCtrl -- "1. Store File" --> StorageProvider
    ParseCtrl -- "2. Enqueue Job" --> QueueProducer
    QueueProducer --> RedisServer
    RedisServer --> QueueWorker

    StorageProvider -- "AWS S3 SDK PutObject" --> MinIOBucket
    QueueWorker --> StorageProvider
    QueueWorker --> ParserSuite
    ParserSuite --> ChunkerEngine
    ChunkerEngine --> EmbeddingService
    EmbeddingService -- "HTTP POST /api/embeddings" --> OllamaServer
    EmbeddingService --> VectorRepo
    VectorRepo -- "REST API Upsert Points" --> QdrantDB
    QueueWorker -- "Save Document Metadata" --> MongoDBDoc

    RetCtrl -- "Embed Search Query" --> EmbeddingService
    RetCtrl -- "Vector Cosine Search" --> VectorRepo
    VectorRepo -- "Top-K Chunks" --> RetCtrl
```

---

## 3. Basic Level Flow: Ingestion Pipeline & Retrieval

```mermaid
sequenceDiagram
    autonumber
    participant Client as Client / LangGraph / MCP
    participant API as Express API (/parsing/upload)
    participant MinIO as MinIO S3 Bucket
    participant Queue as BullMQ (Redis)
    participant Worker as Background Worker
    participant Ollama as Ollama Engine
    participant Qdrant as Qdrant Vector DB

    Client->>API: Upload File (Multipart FormData)
    API->>MinIO: Save File Stream into Bucket "ai-upload-doc"
    API->>Queue: Add Job to BullMQ Queue
    API-->>Client: Return 202 Accepted { jobId, documentId }

    Queue->>Worker: Consume Ingestion Job
    Worker->>Worker: Parse Text (PDF/Word/Excel/OCR)
    Worker->>Worker: Divide Text into Chunks
    Worker->>Ollama: POST /api/embeddings (nomic-embed-text)
    Ollama-->>Worker: Return 768-dim Float Vectors
    Worker->>Qdrant: Upsert Vector Points + Chunk Metadata Payload
    Note over Worker,Qdrant: Document Indexing Complete

    %% Retrieval Query
    Client->>API: POST /retrieval/search { query: "device manual error codes" }
    API->>Ollama: POST /api/embeddings (query text)
    Ollama-->>API: Return Query Vector
    API->>Qdrant: Search Collection "documents" (Top-K Similarity)
    Qdrant-->>API: Return Top Matching Context Chunks
    API-->>Client: Return Context Chunks JSON
```

---

## 4. Key Directory Structure

```
document_parsing_backend/
├── src/
│   ├── app.ts               # Express application configuration & routes mounting
│   ├── server.ts            # HTTP server startup & database initialization
│   ├── chunking/            # Chunking algorithms (hierarchical, fixed, semantic)
│   ├── controllers/         # REST API Controllers (Parsing, Retrieval, Documents)
│   ├── embedding/           # Ollama embedding generator client
│   ├── models/              # Mongoose database models (Document, ProcessingJob)
│   ├── ocr/                 # OCR preprocessing utilities
│   ├── parsers/             # Document format parsers (PDF, DOCX, CSV, XLSX, Image)
│   ├── processing/          # Core processing pipeline orchestrator
│   ├── queue/               # BullMQ queue producer setup
│   ├── rag/                 # RAG context formatting and grounding engine
│   ├── retrieval/           # Vector retrieval service & rankers
│   ├── routes/              # Express API route declarations
│   ├── services/storage/    # Storage abstraction (MinIO S3 Client & Local Storage)
│   ├── vector/              # Qdrant client connection & collection management
│   └── workers/             # BullMQ background worker definitions
```

---

## 5. External Services Utilized

- **Redis** (`redis:6379`): Job queue processing via BullMQ and Express rate limiting.
- **MongoDB** (`mongodb://mongodb:27017/document_processor`): Document metadata, processing job history, and document status tracking.
- **Qdrant Vector DB** (`http://qdrant:6333`): Vector index storage (`documents` collection) and cosine similarity retrieval.
- **MinIO S3 Storage** (`http://192.168.2.213:9998`): Storing original raw document files in bucket `ai-upload-doc`.
- **Ollama Engine** (`http://192.168.2.210:11434`): Vector embedding generation using `nomic-embed-text`.
