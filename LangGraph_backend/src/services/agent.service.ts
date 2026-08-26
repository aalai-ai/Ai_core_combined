import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { ChatOllama } from "@langchain/ollama";
import { Chat } from "../db/chat.model.js";

let executor: any;

export async function initAgent(tools: any[], createAgent: any) {
  executor = await createAgent(tools);
}

export async function streamAgent(
  input: string,
  history: any[],
  onToken: (token: string) => void,
  onTool: (tool: any) => void,
  applicationId?: string
) {
  // Map flat log records into LangChain Message schemas
  const messages = history.map((msg: any) => {
    if (msg.role === "user") {
      return new HumanMessage(msg.content);
    } else {
      return new AIMessage({ content: msg.content });
    }
  });

  // Append new user prompt input
  messages.push(new HumanMessage(input));

  // Execute Graph using streamMode "messages" to get incremental token outputs
  console.log(`[streamAgent] input messages length: ${messages.length}, applicationId: ${applicationId || 'plixy'}`);
  const stream = await executor.stream(
    { messages, applicationId: applicationId || 'plixy' },
    { streamMode: "messages" }
  );
  console.log("[streamAgent] stream created successfully");

  let count = 0;
  for await (const chunk of stream) {
    count++;
    const [msg, metadata] = Array.isArray(chunk) ? chunk : [chunk, {}];

    if (msg) {
      const msgType = typeof (msg as any)._getType === "function" 
        ? (msg as any)._getType() 
        : (typeof (msg as any).getType === "function" ? (msg as any).getType() : "");

      // Only stream AI response text tokens to the frontend user
      if (msgType === "ai" || (!msgType && msg.constructor?.name?.includes("AI"))) {
        if ((msg as any).content) {
          onToken((msg as any).content.toString());
        }

        const toolCalls = (msg as any).tool_calls || (msg as any).additional_kwargs?.tool_calls;
        if (toolCalls && toolCalls.length) {
          onTool(toolCalls);
        }
      }
    }
  }
  console.log(`[streamAgent] stream iteration finished, total chunks: ${count}`);
}

export async function generateTitle(message: string): Promise<string> {
  try {
    const model = new ChatOllama({
      model: process.env.OLLAMA_MODEL || "qwen3.5:9b",
      temperature: 0,
      baseUrl: process.env.OLLAMA_BASE_URL,
    });

    const response = await model.invoke(
      `Summarize the following user message into a concise 3-4 word title for a chat window. If the message is a simple greeting like "hi", "hello", "hey", or "test", make a title like "General Conversation" or "Greeting". Do not include quotes, markdown formatting, or any extra text. Make it abstract and descriptive. 
      
Message: "${message}"`,
      { signal: AbortSignal.timeout(5000) }
    );

    const result = response.content.toString().trim();
    const cleanResult = result.toLowerCase().replace(/['"]/g, "");
    if (cleanResult === "new chat" || cleanResult === "" || message.trim().length < 5) {
      return "General Conversation";
    }
    return result;
  } catch (error) {
    console.error("Error generating title:", error);
    return "General Conversation";
  }
}

export async function getEstimatedResponseTime(userId: string, inputMessage: string): Promise<number> {
  try {
    const result = await Chat.aggregate([
      { $match: { userId } },
      { $unwind: "$messages" },
      { $match: { "messages.role": "ai", "messages.responseTime": { $exists: true } } },
      { $sort: { "messages.timestamp": -1 } },
      { $limit: 5 },
      { $group: { _id: null, avgTime: { $avg: "$messages.responseTime" } } }
    ]);

    if (result.length > 0 && result[0].avgTime) {
      return Math.round(result[0].avgTime);
    }
  } catch (error) {
    console.error("Error calculating average response time:", error);
  }

  // Fallback heuristic if no history exists
  const hasToolKeywords = /\b(plc|db|database|status|pressure|temperature|tag|sensor|read|write)\b/i.test(inputMessage);
  return hasToolKeywords ? 5000 : 2500;
}