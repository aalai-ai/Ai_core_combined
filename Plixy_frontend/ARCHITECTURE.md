# Plixy Frontend - Application Architecture

This document details the internal architecture, UI component structure, state management, and external service communications for **Plixy Frontend**.

---

## 1. Overview & Technology Stack

**Plixy Frontend** is a modern React web application providing a responsive, real-time conversational interface for the AI Industrial Assistant.

- **Framework**: React 18 with TypeScript
- **Build System**: Vite 5
- **Styling**: SCSS Modules (Modular CSS styling)
- **Routing**: React Router DOM v6
- **Real-Time Communication**: Socket.io Client (`socket.io-client`)
- **HTTP Client**: Axios
- **Module Federation**: `@originjs/vite-plugin-federation` (Supports micro-frontend integration)

---

## 2. Internal Architecture Diagram

```mermaid
flowchart TD
    subgraph Browser ["Web Browser Client"]
        subgraph AppContainer ["App Component (Router & Contexts)"]
            AuthProvider["AuthContext Provider\n(Token & User State)"]
            Router["React Router DOM\n(Routes: /login, /chat, /about)"]
        end

        subgraph Pages ["View Pages"]
            HomePage["Home / Chat Page\n(pages/Home.tsx)"]
            AboutPage["About Page\n(pages/About.tsx)"]
        end

        subgraph Components ["UI Components Hierarchy"]
            Navbar["Navbar Component\n(Connection Status & Branding)"]
            Sidebar["Sidebar Component\n(Chat Threads & User Profile)"]
            Assistant["Assistant Component\n(Main Chat Window & Telemetry)"]
            AuthModals["Auth & User Registration\n(Login / Register UI)"]
        end

        subgraph StateAndServices ["Services & Communication Layer"]
            SocketService["Socket.io Client Service\n(Real-Time Streaming Listener)"]
            APIService["Axios API Client\n(REST Auth & Thread Management)"]
        end
    end

    subgraph ExternalBackend ["Target Services Utilized"]
        LGB["LangGraph Backend\n(http://localhost:5100)"]
    end

    %% Component Wiring
    AuthProvider --> Router
    Router --> HomePage
    Router --> AboutPage
    HomePage --> Navbar
    HomePage --> Sidebar
    HomePage --> Assistant

    Assistant --> SocketService
    Assistant --> APIService
    Sidebar --> APIService
    AuthModals --> APIService

    SocketService -- "WebSocket Stream (port 5100)" --> LGB
    APIService -- "HTTP REST /api/chats, /api/users (port 5100)" --> LGB
```

---

## 3. Directory Structure & Key Components

```
Plixy_frontend/
├── src/
│   ├── assets/              # Static media assets & icons
│   ├── components/
│   │   ├── Assistant/       # Core Chat Interface & Streaming Renderer
│   │   │   ├── Assistant.tsx
│   │   │   └── Assistant.module.scss
│   │   ├── Auth/            # Authentication UI & Context
│   │   ├── Navbar/          # Global Header Navigation
│   │   ├── Sidebar/         # Dynamic Thread History & Navigation
│   │   ├── UserRegistration/# User management & registration forms
│   │   └── common/          # Reusable Buttons, Inputs, Loaders
│   ├── hooks/               # Custom React hooks (useSocket, useAuth)
│   ├── pages/               # Top-level Page Views (Home, About)
│   ├── services/            # API clients (api.ts, auth.ts, chat.ts)
│   ├── styles/              # Global variables, mixins, & resets
│   ├── App.tsx              # Root React component
│   └── main.tsx             # DOM Mount Entry Point
├── vite.config.ts           # Vite build config & Module Federation setup
└── nginx.conf               # Docker production Nginx web server config
```

---

## 4. Key UI Workflows & State Management

### 4.1 Real-Time Streaming Chat Workflow
```mermaid
sequenceDiagram
    autonumber
    participant User
    participant AssistantUI as Assistant Component
    participant Socket as Socket.io Client
    participant Backend as LangGraph Backend

    User->>AssistantUI: Type message & click Send
    AssistantUI->>AssistantUI: Append user message to local state
    AssistantUI->>Socket: emit("send_message", { threadId, message })
    Socket->>Backend: WebSocket event: send_message
    
    loop Stream Response Tokens
        Backend-->>Socket: emit("stream_token", { chunk })
        Socket-->>AssistantUI: On stream_token event
        AssistantUI->>AssistantUI: Concatenate chunk to active AI message
    end

    Backend-->>Socket: emit("stream_end", { completeResponse, metadata })
    Socket-->>AssistantUI: On stream_end event
    AssistantUI->>AssistantUI: Finalize message state & render action buttons
```

### 4.2 Authentication & Route Protection
- **JWT Handling**: Auth state is maintained via standard JWTs stored in local storage and managed by `AuthContext`.
- **API Interceptor**: `services/api.ts` automatically attaches `Authorization: Bearer <token>` headers to outgoing HTTP requests targeting `LangGraph_backend`.

---

## 5. External Services & Applications Utilized

| External Application / Service | Connection Protocol | Endpoint / Target | Purpose |
| :--- | :--- | :--- | :--- |
| **[LangGraph_backend](file:///c:/Users/Gabriel/Documents/Ai_core_combined/LangGraph_backend)** | HTTP REST | `http://localhost:5100/api/users`<br>`http://localhost:5100/api/chats` | User login/signup, creating chat threads, retrieving thread history. |
| **[LangGraph_backend](file:///c:/Users/Gabriel/Documents/Ai_core_combined/LangGraph_backend)** | WebSocket (Socket.io) | `ws://localhost:5100` | Bidirectional real-time token streaming and agent status updates. |
