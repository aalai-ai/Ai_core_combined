import { Server } from "socket.io";
import { Chat } from "../db/chat.model";
import { streamAgent, generateTitle, getEstimatedResponseTime } from "../services/agent.service";

export function initSocket(server: any) {
  const io = new Server(server, {
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
    socket.on("join", async (chatId: string) => {
      socket.join(chatId);

      const chat = await Chat.findOne({ chatId });
      socket.emit("history", chat?.messages || []);
    });

    socket.on("message", async ({ chatId, message, userId, applicationId }) => {
      try {
        console.log(`💬 Socket message received: "${message}" [App: ${applicationId || 'plixy'}] for chatId: ${chatId}`);
        let chat = await Chat.findOne({ chatId });

        if (!chat) {
          if (!userId) {
            return socket.emit("error", { message: "userId is required for new chats" });
          }
          chat = new Chat({ chatId, userId, messages: [] });
        }

        const isFirstMessage = chat.messages.length === 0;

        chat.messages.push({ role: "user", content: message });
        await chat.save();

        // Emit estimated response time (ETA) immediately
        const estimatedTimeMs = await getEstimatedResponseTime(chat.userId, message);
        io.to(chatId).emit("estimated_time", { estimatedTimeMs });

        // Track start time
        const startTime = Date.now();
        let aiMessage = "";

        console.log(`🤖 Starting streamAgent execution...`);
        await streamAgent(
          message,
          chat.messages,
          (token) => {
            aiMessage += token;
            io.to(chatId).emit("stream", {
              type: "text",
              content: token,
            });
          },
          (tool) => {
            console.log("🛠️ Tool call chunk:", tool);
            io.to(chatId).emit("stream", {
              type: "tool",
              content: tool,
            });
          },
          applicationId
        );
        console.log(`🤖 streamAgent execution finished successfully.`);

        // Track actual elapsed time
        const timeTakenMs = Date.now() - startTime;

        chat.messages.push({ role: "ai", content: aiMessage, responseTime: timeTakenMs });
        
        if (isFirstMessage) {
          // Generate abstract chat title based on the first user message
          const title = await generateTitle(message);
          chat.title = title;
          // Broadcast a custom event 'chatUpdated' with the new title if the client expects it
          io.to(chatId).emit("chatUpdated", { chatId, title });
        }

        await chat.save();
        console.log(`💾 Saved AI response to database. Emitting 'done' event.`);

        // Send actual generation time in done event
        io.to(chatId).emit("done", { timeTakenMs });
      } catch (error: any) {
        console.error("❌ Error in socket message handler:", error);
        socket.emit("error", { message: "Server error occurred: " + error.message });
      }
    });
  });
}