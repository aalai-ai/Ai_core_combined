# Multi-Frontend Core AI Engine Architecture

This document defines the decoupled **Headless Central Core AI Engine** architecture for `Ai_core_combined`, serving multiple specialized client applications over clean REST and WebSocket APIs.

---

## 1. Multi-Frontend Ecosystem Overview

```mermaid
flowchart TB
    subgraph FRONTENDS ["FRONTEND CLIENT LAYER"]
        APP1["Frontend 1: Plixy Web App\n(Primary Focus: IIoT Document RAG,\nManual Analysis & Parameter QA)"]
        APP2["Frontend 2: 3D Prompt Generator App\n(Primary Focus: Ultra-Detailed 3D Specs,\nBlender MCP Prompts & bpy Scripts)"]
        APP3["Frontend 3: 3D CAD Studio App\n(Primary Focus: Generative 3D Modeling,\nMesh Synthesis & Model Modification)"]
    end

    subgraph CORE_ENGINE ["CENTRAL CORE AI ENGINE (Ai_core_combined)"]
        direction TB
        
        subgraph GATEWAY ["API Gateway & Application Context Router"]
            AppRouter["Application Context Router\n(Decouples by applicationId / Session Intent)"]
        end

        subgraph SPECIALIZED_AGENTS ["LangGraph Agent Sub-Systems"]
            RAGAgent["1. IIoT Document RAG Agent\n- Document Chunk Retrieval (Qdrant)\n- Parameter Lookup & Modbus Maps\n- Manual Q&A & Safety Warnings"]
            PromptAgent["2. 3D Prompt Generator Agent\n- Micro-3D Spec Extractor\n- 1-Pass Multi-File Spec Fusion\n- Master Claude / Blender MCP Prompts\n- Executable Production bpy Scripts"]
            CADAgent["3. Generative 3D Mesh Agent\n- Generative 3D Mesh Engine (InstantMesh)\n- Real-Time WebGL 3D Mesh Viewport\n- Iterative 3D Model Modifications"]
            PLCAgent["4. Hardware & Telemetry Agent\n- Save Device Profiles & Registers\n- Live Industrial Telemetry & Alarms"]
        end

        subgraph SHARED_BACKENDS ["Shared Infrastructure & Microservices"]
            DocParser["document_parsing_backend (Port 3000)\n(PDF, DOCX, CAD .DXF/.STEP, Vision LLM OCR)"]
            MCPServer["MCP Server (IPC Stdio)\n(Model Context Protocol Tool Registry)"]
            MeshWorker["3d_generation_backend (Port 5200)\n(PyTorch InstantMesh / TripoSR 3D Engine)"]
            Databases[("MongoDB & Qdrant Vector Database")]
        end
    end

    APP1 -- "applicationId: plixy" --> AppRouter
    APP2 -- "applicationId: 3d_prompt_generator" --> AppRouter
    APP3 -- "applicationId: cad_3d_studio" --> AppRouter

    AppRouter -- "RAG & Manual Queries" --> RAGAgent
    AppRouter -- "3D Spec & Prompt Queries" --> PromptAgent
    AppRouter -- "3D Mesh Synthesis Queries" --> CADAgent
    AppRouter -- "PLC Telemetry Queries" --> PLCAgent

    RAGAgent --> DocParser
    RAGAgent --> Databases
    PromptAgent --> DocParser
    PromptAgent --> MCPServer
    CADAgent --> MeshWorker
    CADAgent --> MCPServer
    PLCAgent --> MCPServer
```

---

## 2. Specialized Application Roles

### Application 1: **Plixy (IIoT Document & Manual RAG Assistant)**
- **Primary Objective**: Analyze uploaded manuals, schematics, datasheets, and guides to solve user queries.
- **Key Features**:
  - Semantic vector search across uploaded PDF, Word, Excel, and image documents.
  - Modbus register map extraction and parameter verification.
  - Safety warning alerts and installation instructions.
  - Image/diagram rendering for rear panels and wiring schematics.

### Application 2: **3D Prompt Generator (3D CAD Prompt Engine Web App)**
- **Primary Objective**: Analyze uploaded device manuals, technical blueprints, CAD files (`.dxf`, `.step`), and photos to produce **ultra-detailed 3D model prompts, technical specification tables, and production Blender Python (`bpy`) scripts** for constructing highly accurate 3D device models.
- **Key Features**:
  - Micro-detail 3D CAD parameter extraction ($W \times H \times D$, chamfer radii, DIN rail $35\text{mm}$ channel, bezel thickness).
  - 1-Pass Multi-File Fusion (cross-validating CAD drawings, photos, and PDF specs in a single pass).
  - Master copy-pasteable **Claude / Blender MCP Prompt** generation.
  - Production **Blender Python (`bpy`) script** building (collections, primitives, bevel modifiers, screen optics, PBT green terminal arrays).
  - Markdown specs table generation with LoD rating and completeness score.

### Application 3: **3D CAD Studio App (Generative 3D Modeling & Modification App)**
- **Primary Objective**: Direct 3D mesh model generation (`.GLB`, `.OBJ`), real-time WebGL 3D viewport preview, and iterative 3D model modifications based on user prompts.
- **Key Features**:
  - Generative 3D mesh model generation (`InstantMesh` / `TripoSR` backend).
  - Interactive Three.js WebGL viewport rendering in the browser.
  - Iterative 3D mesh modifications (e.g. *"Increase button diameter to 8mm"*, *"Change body material to brushed aluminum"*).
  - 1-click 3D mesh file downloads (`.GLB` / `.OBJ`).

---

## 3. Core AI Engine Decoupling Protocol

Frontends pass an `applicationId` or `contextMode` header in WebSocket and REST connections:

```json
{
  "applicationId": "3d_prompt_generator",
  "chatId": "thread-9821",
  "message": "Generate ultra-detailed 3D model prompt for the Hexa-Series EM6400 device"
}
```

The Central AI Engine routes the payload to the specialized agent worker while leveraging shared databases (MongoDB, Qdrant) and microservices (`document_parsing_backend`, `MCP_Server`, `3d_generation_backend`).
