import express from "express";
import http from "http";
import cors from "cors";
import path from "path";

import { config } from "./config";
import { connectDB } from "./db";
import { initSocket } from "./sockets/chat.socket";
import { createMcpClient } from "./mcp/mcpClient";
import { loadTools } from "./tools/tools";
import { createAgent } from "./agent/agent";
import { initAgent } from "./services/agent.service";
import { checkOllamaModels } from "./utils/ollama";

import userRoutes from "./routes/user.routes";
import chatRoutes from "./routes/chat.routes";
import extractionRoutes from "./routes/extraction.routes";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", async (req, res, next) => {
  try {
    const parserUrl = (process.env.DOCUMENT_PARSER_URL || "http://localhost:3000").replace(/\/$/, "");
    console.log(`🔌 Proxying request for uploads to document parsing backend: ${parserUrl}/uploads${req.path}`);
    const response = await fetch(`${parserUrl}/uploads${req.path}`);
    if (!response.ok) {
      return res.status(response.status).send(await response.text());
    }
    const contentType = response.headers.get("content-type");
    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }
    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    next(err);
  }
});

app.use("/api/users", userRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/extraction", extractionRoutes);

const server = http.createServer(app);

async function start() {
  await connectDB();
  await checkOllamaModels();

  const mcpClient = await createMcpClient();
  const tools = await loadTools(mcpClient);

  await initAgent(tools, createAgent);

  initSocket(server);

  server.listen(config.port, () => {
    console.log(`🚀 Server running on http://localhost:${config.port}`);
  });
}

start();