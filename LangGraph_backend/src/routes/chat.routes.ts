import { Router } from "express";
import { createChat, getUserChats, postChatMessage } from "../controllers/chat.controller";

const router = Router();

router.post("/", createChat);
router.post("/message", postChatMessage);
router.get("/user/:userId", getUserChats);

export default router;
