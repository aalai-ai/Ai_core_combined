# Application Architecture: MCP Server

This document details the internal architecture, Model Context Protocol (MCP) server implementation, tool handlers, background hardware polling engines, and database integrations for **MCP Server**.

---

## 1. Overview & Tech Stack

- **Runtime**: Node.js with TypeScript (`ts-node`)
- **Protocol Core**: `@modelcontextprotocol/sdk`
- **IPC Transport**: `StdioServerTransport` (Standard input/output IPC)
- **Industrial Protocol**: `modbus-serial` (Modbus RTU / TCP)
- **Time-Series Client**: `@influxdata/influxdb-client`
- **Validation**: `zod` schema validation

---

## 2. Internal Module Architecture Diagram

```mermaid
flowchart TD
    subgraph StdioIPC ["Model Context Protocol (MCP) Stdio Layer"]
        StdioTransport["StdioServerTransport\n(Standard Input / Output JSON-RPC)"]
        MCPServerInst["Server Instance\n(name: plc-live-server, v1.0.0)"]
    end

    subgraph ProtocolHandlers ["MCP Schema Request Handlers"]
        ListToolsHandler["ListToolsRequestSchema Handler\n(Exposes Tool Definitions & Input Schemas)"]
        CallToolHandler["CallToolRequestSchema Handler\n(Dispatches Tool Executions)"]
    end

    subgraph ToolDefinitions ["Registered MCP Tools"]
        Tool1["get_live_data\nReturns exact numeric voltage, current, power, frequency"]
        Tool2["get_analysis_data\nQueries historical telemetry with range, field, & aggregation"]
        Tool3["get_grounding_context\nPerforms semantic search on uploaded manuals"]
    end

    subgraph BackgroundServices ["Background Hardware & Database Services"]
        PLCPollingService["PLC Polling Engine (src/services/plc.service.ts)\nstartPolling() background loop"]
        TelemetryCache[("In-Memory Telemetry Cache\n{ voltage, current, power, frequency }")]
        InfluxQueryEngine["InfluxDB Service (src/services/influx.service.ts)\nqueryAnalysisData() Flux Builder"]
    end

    subgraph ExternalHardwareAndServices ["Connected External Infrastructure"]
        ModbusSensors["Modbus Industrial Sensors / PLCs\n(Serial RS-485 / TCP 502)"]
        InfluxDBServer[(InfluxDB Time-Series DB\nHistorical Measurement Metrics)]
        DocParserBackend["Document Parsing Backend\n(Port 3000 /retrieval/search)"]
    end

    %% Internal Wiring
    StdioTransport <--> MCPServerInst
    MCPServerInst --> ListToolsHandler
    MCPServerInst --> CallToolHandler

    CallToolHandler --> Tool1
    CallToolHandler --> Tool2
    CallToolHandler --> Tool3

    Tool1 --> TelemetryCache
    PLCPollingService -- "Polls every N ms" --> ModbusSensors
    PLCPollingService -- "Updates" --> TelemetryCache

    Tool2 --> InfluxQueryEngine
    InfluxQueryEngine -- "Executes Flux Query" --> InfluxDBServer

    Tool3 -- "HTTP POST Query" --> DocParserBackend
```

---

## 3. Basic Level Flow: Modbus Polling & Tool Request Dispatch

```mermaid
sequenceDiagram
    autonumber
    participant PLC as Modbus Sensors
    participant Poller as PLC Polling Service
    participant Cache as Telemetry Cache
    participant Host as LangGraph Backend (Host)
    participant MCP as MCP Server Handler
    participant Influx as InfluxDB

    %% Continuous Background Loop
    loop Every 1000ms
        Poller->>PLC: Read Holding Registers (Voltage, Current, Power)
        PLC-->>Poller: Raw Modbus Registers
        Poller->>Cache: Update In-Memory Telemetry Cache
    end

    %% Tool Request from Host
    Host->>MCP: Stdio JSON-RPC: CallTool("get_live_data")
    MCP->>Cache: Read getCachedLiveData()
    Cache-->>MCP: Return exact numeric JSON
    MCP-->>Host: Stdio JSON-RPC Response

    %% Historical Request from Host
    Host->>MCP: Stdio JSON-RPC: CallTool("get_analysis_data", { range: "1h", field: "power", aggregation: "mean" })
    MCP->>Influx: Build & Execute Flux Query
    Influx-->>MCP: Return Time-Series Points
    MCP-->>Host: Stdio JSON-RPC Response
```

---

## 4. Key Directory Structure

```
MCP_Server/
├── src/
│   ├── config/              # Environment constants & database URIs
│   ├── services/            # Background hardware & DB engines
│   │   ├── plc.service.ts   # Modbus polling loop & in-memory cache
│   │   └── influx.service.ts# InfluxDB flux queries & data formatting
│   ├── tools/               # Tool schema definitions & helper utilities
│   ├── utils/               # Modbus serial helpers & math utilities
│   └── index.ts             # Server entry point, MCP handlers, & stdio connection
```

---

## 5. External Services Utilized

- **Modbus Industrial Sensors / PLCs** (Serial / TCP Port 502): Polling physical electrical measurements.
- **InfluxDB** (`http://localhost:8086`): Historical time-series telemetry storage and Flux query execution.
- **Document Parsing Backend** (`http://document_parsing_backend:3000`): Grounding context semantic search.
- **LangGraph Backend**: Host process invoking tools over Stdio standard input/output.
