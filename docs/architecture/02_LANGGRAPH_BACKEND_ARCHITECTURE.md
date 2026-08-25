# Application Architecture: LangGraph Backend

This document details the internal architecture, LangGraph state graph workflow, tool execution engine, MCP client bridge, and service integrations for **LangGraph Backend**.

---

## 1. Overview & Tech Stack

- **Runtime**: Node.js with TypeScript (`tsx watch`)
- **Web Framework**: Express.js
- **Agentic Engine**: `@langchain/langgraph` & `@langchain/core`
- **LLM Integration**: `@langchain/ollama` (`ChatOllama`)
- **Protocol Client**: `@modelcontextprotocol/sdk` (Stdio Client)
- **Database ORM**: Mongoose (`mongodb`)
- **Real-Time Streaming**: Socket.io Server

---

## 2. Internal Module Architecture Diagram

```mermaid
flowchart TD
    subgraph ServerCore ["Express & Socket.io Server (Port 5100)"]
        Bootstrap["index.ts Bootstrap"]
        Config["config/ & env Config"]
        CORSErr["CORS & Error Middleware"]
        DBConnector["db/ Connection Manager"]

        subgraph RoutesControllers ["REST API Layer"]
            UserModule["user.routes.ts & user.controller.ts\n(/api/users - Signup, Login, Auth)"]
            ChatModule["chat.routes.ts & chat.controller.ts\n(/api/chats - Threads, Messages)"]
            ExtractModule["extraction.routes.ts & extraction.controller.ts\n(/api/extraction - Parsing triggers)"]
        end

        subgraph WebSocketLayer ["Real-Time Streaming Layer"]
            ChatSocket["sockets/chat.socket.ts\n(Event listener: send_message,\nEmitter: stream_token, stream_end)"]
        end
    end

    subgraph AgentOrchestrator ["LangGraph Agent Orchestration Engine"]
        AgentInit["services/agent.service.ts\n(Agent Graph Lifecycle & Singleton)"]

        subgraph LangGraphGraph ["LangGraph Cyclic StateGraph Workflow"]
            StateSchema["AgentState Schema\n{ messages: BaseMessage[] }"]
            AgentNode["Agent Node\n(ChatOllama qwen3.5:9b)"]
            ToolNode["ToolNode Executor\n(LangChain Built-in)"]
            
            StateSchema --> AgentNode
            AgentNode -- "Conditional Edge: tool_calls requested" --> ToolNode
            ToolNode -- "Return tool output" --> AgentNode
            AgentNode -- "Conditional Edge: END" --> StateSchema
        end
    end

    subgraph ToolRegistry ["Tools & Integration Layer"]
        ToolsLoader["tools/tools.ts\n(Aggregates and loads tools)"]
        DocParserTool["tools/documentParserTool.ts\n(HTTP Client to Doc Parser)"]
        PLCToolsAgg["tools/plcTools.ts\n(PLC query tool definitions)"]
        MCPClientWrapper["mcp/mcpClient.ts\n(Spawns MCP Server Stdio process,\nConverts MCP tools to LangChain tools)"]
    end

    subgraph ExternalDeps ["Utilized Infrastructure & Services"]
        MongoDB[(MongoDB Database\nDatabases: ai-chat)]
        MCPServerProcess["MCP Server Process\n(Stdio Child Process IPC)"]
        DocParserService["Document Parsing Backend\n(Port 3000)"]
        OllamaServer["Ollama LLM Engine\n(Port 11434)"]
    end

    %% Internal Wiring
    Bootstrap --> Config
    Bootstrap --> DBConnector
    Bootstrap --> CORSErr
    Bootstrap --> RoutesControllers
    Bootstrap --> WebSocketLayer

    DBConnector --> MongoDB
    WebSocketLayer --> AgentInit
    AgentInit --> LangGraphGraph

    AgentNode -- "Model Invocation" --> OllamaServer
    ToolNode --> ToolsLoader
    ToolsLoader --> DocParserTool
    ToolsLoader --> PLCToolsAgg
    ToolsLoader --> MCPClientWrapper

    DocParserTool -- "HTTP POST /retrieval/search" --> DocParserService
    MCPClientWrapper -- "Stdio IPC (CallTool)" --> MCPServerProcess
    ChatSocket -- "Persist Messages" --> MongoDB
```

---

## 3. Basic Level Flow: Agent StateGraph Loop & Tool Execution

```mermaid
sequenceDiagram
    autonumber
    participant UI as Plixy Frontend
    participant WS as Socket.io Server
    participant Agent as LangGraph Agent Node
    participant LLM as Ollama LLM (qwen3.5:9b)
    participant Tool as ToolNode Executor
    participant MCP as MCP Server

    UI->>WS: Emit "send_message" { threadId, prompt }
    WS->>Agent: Invoke StateGraph with prompt added to State.messages
    Agent->>LLM: Invoke ChatOllama with conversation history
    LLM-->>Agent: Response containing Tool Calls: [ get_live_data() ]
    
    Agent->>Tool: Execute ToolNode for get_live_data()
    Tool->>MCP: Stdio JSON-RPC CallTool("get_live_data")
    MCP-->>Tool: Return { voltage: 230.1, current: 4.2, power: 0.96 }
    Tool-->>Agent: Append ToolMessage to State.messages

    Agent->>LLM: Re-invoke ChatOllama with ToolMessage result
    LLM-->>Agent: Final Text Answer (No more tool calls)
    
    loop Stream to UI
        Agent-->>WS: Token Stream
        WS-->>UI: Emit "stream_token"
    end
    WS-->>UI: Emit "stream_end"
```

---

## 4. Key Directory Structure

```
LangGraph_backend/
├── src/
│   ├── agent/               # LangGraph StateGraph definition
│   │   └── agent.ts         # Agent graph creation, node edges, & state schema
│   ├── config/              # Environment & application configurations
│   ├── controllers/         # REST API Controllers (User, Chat, Extraction)
│   ├── db/                  # Mongoose connection & Database Models (User, Chat)
│   ├── mcp/                 # MCP Client connector
│   │   └── mcpClient.ts     # Spawns MCP Server process over Stdio transport
│   ├── routes/              # Express API Routes
│   ├── services/            # Agent lifecycle & Chat business logic
│   ├── sockets/             # Socket.io chat streaming event handlers
│   ├── tools/               # Registered LangChain tools
│   │   ├── tools.ts         # Tool aggregator & dynamic tool loader
│   │   └── documentParserTool.ts
│   ├── utils/               # Ollama model checkers & helpers
│   └── index.ts             # Application entry point & server bootstrap
```

---

## 5. External Services Utilized

- **MCP Server** (Stdio IPC): Execution of live PLC hardware and InfluxDB time-series analysis tools.
- **Document Parsing Backend** (`http://document_parsing_backend:3000`): Semantic document search (`/retrieval/search`).
- **MongoDB** (`mongodb://mongodb:27017/ai-chat`): User auth profiles, chat threads, and message history.
- **Ollama Engine** (`http://192.168.2.210:11434`): Text generation LLMs (`qwen3.5:9b`, `llama3.1:8b`).
