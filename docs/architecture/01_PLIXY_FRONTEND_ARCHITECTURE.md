# Application Architecture: Plixy Frontend

This document details the internal architecture, UI component structure, state management, module flows, and service integrations for **Plixy Frontend**.

---

## 1. Overview & Tech Stack

- **Application Type**: Single Page Application (SPA) Web Frontend
- **Framework**: React 18 with TypeScript
- **Build System**: Vite 5
- **Styling**: SCSS Modules (`*.module.scss`)
- **Routing**: React Router DOM v6
- **Real-Time Client**: Socket.io Client (`socket.io-client`)
- **HTTP Client**: Axios
- **Micro-Frontend Support**: `@originjs/vite-plugin-federation`

---

## 2. Internal Module Architecture Diagram

```mermaid
flowchart TD
    subgraph Browser ["Web Browser Container"]
        subgraph Mount ["Vite Entry Point"]
            MainTSX["main.tsx Mount Point"]
            AppTSX["App.tsx Root Router"]
        end

        subgraph Contexts ["React State Contexts"]
            AuthContext["AuthContext Provider\n(JWT Token, User Info, Login/Logout)"]
        end

        subgraph ViewPages ["Top Level Page Views"]
            PageHome["Home Page (pages/Home.tsx)\nMain Chat & Telemetry View"]
            PageAbout["About Page (pages/About.tsx)\nSystem Information View"]
        end

        subgraph Components ["UI Component Modules"]
            subgraph AssistantModule ["Assistant Chat Module"]
                AssistantComp["Assistant.tsx (Chat Feed Renderer)"]
                AssistantCSS["Assistant.module.scss"]
                MessageStream["Stream Token Concatenator"]
                TelemetryWidget["PLC Live Telemetry Card"]
                UploadWidget["Manual Attachment Input"]
            end

            subgraph SidebarModule ["Sidebar Module"]
                SidebarComp["Sidebar.tsx"]
                ThreadList["Thread History List"]
                NewThreadBtn["Create New Thread Button"]
                UserProfile["User Profile Card"]
            end

            subgraph NavbarModule ["Navbar Module"]
                NavbarComp["Navbar.tsx"]
                ConnStatus["WebSocket Connection Status Badge"]
            end

            subgraph AuthModule ["Auth UI Module"]
                LoginModal["Login Modal Form"]
                RegisterModal["User Registration Form"]
            end
        end

        subgraph Services ["API & Network Services"]
            APIService["Axios Client (services/api.ts)\nAttaches Authorization: Bearer JWT"]
            AuthService["Auth API Service (services/auth.ts)"]
            ChatService["Chat API Service (services/chat.ts)"]
            SocketService["Socket.io Client Listener"]
        end
    end

    subgraph BackendTarget ["External Target Backend"]
        LGB["LangGraph Backend\n(http://localhost:5100)"]
    end

    %% Flow Wiring
    MainTSX --> AppTSX
    AppTSX --> AuthContext
    AuthContext --> PageHome
    AuthContext --> PageAbout

    PageHome --> NavbarComp
    PageHome --> SidebarComp
    PageHome --> AssistantComp

    AssistantComp --> MessageStream
    AssistantComp --> TelemetryWidget
    AssistantComp --> UploadWidget

    SidebarComp --> ThreadList
    SidebarComp --> NewThreadBtn
    SidebarComp --> UserProfile

    LoginModal --> AuthService
    RegisterModal --> AuthService
    ThreadList --> ChatService
    AssistantComp --> SocketService
    AssistantComp --> APIService

    AuthService --> APIService
    ChatService --> APIService

    APIService -- "HTTP REST Requests" --> LGB
    SocketService -- "WebSocket Real-Time Stream" --> LGB
```

---

## 3. Basic Level Flow: Streaming Chat Interaction

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant Assistant as Assistant Component
    participant Socket as Socket.io Client
    participant API as Axios Service
    participant LGB as LangGraph Backend

    User->>Assistant: Enters chat prompt & presses Send
    Assistant->>Assistant: Append user prompt to local state messages array
    Assistant->>Socket: Socket.emit("send_message", { threadId, message })
    Socket->>LGB: Transmit WS payload
    
    loop Real-Time Streaming
        LGB-->>Socket: Socket.on("stream_token", { chunk })
        Socket-->>Assistant: Append chunk to active response buffer
        Assistant->>Assistant: Trigger React UI re-render
    end

    LGB-->>Socket: Socket.on("stream_end", { completeMessage, metadata })
    Socket-->>Assistant: Finalize message status & display action buttons
    Assistant->>API: HTTP GET /api/chats/:threadId (Sync history)
    API->>LGB: Retrieve updated thread document
    LGB-->>API: Return Thread JSON
    API-->>Assistant: Update React state
```

---

## 4. Key Directory Structure

```
Plixy_frontend/
├── src/
│   ├── assets/              # Static media & SVG icons
│   ├── components/
│   │   ├── Assistant/       # Core Chat Interface & Streaming Renderer
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
└── vite.config.ts           # Vite build config
```

---

## 5. External Services Utilized

- **LangGraph Backend** (`http://localhost:5100`): Provides authentication, chat thread persistence, document extraction triggers, and Socket.io WebSockets token streaming.
