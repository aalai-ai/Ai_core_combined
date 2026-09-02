import { Request, Response } from "express";
import crypto from "crypto";
import { Chat } from "../db/chat.model";
import { streamAgent } from "../services/agent.service";

export const createChat = async (req: Request, res: Response) => {
  try {
    const { chatId, userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    // Use provided chatId or generate a new one
    const newChatId = chatId || crypto.randomUUID();
    
    // Check if chat already exists with this ID
    const existingChat = await Chat.findOne({ chatId: newChatId });
    if (existingChat) {
      return res.status(409).json({ error: "Chat ID already exists" });
    }

    const newChat = new Chat({
      chatId: newChatId,
      userId,
      messages: [],
    });

    await newChat.save();

    return res.status(201).json({
      message: "Chat created successfully",
      chat: newChat,
    });
  } catch (error: any) {
    console.error("Error creating chat:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const getUserChats = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ error: "userId parameter is required" });
    }

    // Fetch only chatId, title, and updatedAt for the sidebar
    const chats = await Chat.find(
      { userId },
      { chatId: 1, title: 1, updatedAt: 1 }
    ).sort({ updatedAt: -1 });

export const postChatMessage = async (req: Request, res: Response) => {
  try {
    const { chatId, userId, message, applicationId } = req.body;
    const finalChatId = chatId || crypto.randomUUID();
    const finalUserId = userId || "user_default_3d_studio";

    let chat = await Chat.findOne({ chatId: finalChatId });
    if (!chat) {
      chat = new Chat({ chatId: finalChatId, userId: finalUserId, messages: [] });
    }

    chat.messages.push({ role: "user", content: message });
    await chat.save();

    let fullAiResponse = "";
    await streamAgent(
      message,
      chat.messages,
      (token) => { fullAiResponse += token; },
      (tool) => {},
      applicationId || "3d_prompt_generator"
    );

    chat.messages.push({ role: "ai", content: fullAiResponse });
    await chat.save();

    return res.status(200).json({
      chatId: finalChatId,
      response: fullAiResponse,
    });
  } catch (error: any) {
    console.error("Error in postChatMessage:", error);
    return res.status(500).json({ error: error.message });
  }
};

