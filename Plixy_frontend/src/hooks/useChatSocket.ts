 import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5100';

export interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  timestamp?: string;
  responseTime?: number;
}

export const useChatSocket = (chatId: string | null, userId?: string, onChatUpdated?: (chatId: string, title: string) => void) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimatedTimeMs, setEstimatedTimeMs] = useState<number | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    setIsHistoryLoaded(false);
    if (!chatId) return;

    console.log(`Connecting to socket at: ${SOCKET_URL} for chatId: ${chatId}`);
    
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'], // Prioritize websocket
    });
    
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Socket connected successfully');
      socket.emit('join', chatId);
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      setError(`Connection failed: ${err.message}`);
    });

    socket.on('history', (history: ChatMessage[]) => {
      setMessages(history);
      setIsHistoryLoaded(true);
    });

    socket.on('stream', (payload: { type: 'text' | 'tool'; content: any }) => {
      setIsStreaming(true);
      setIsLoading(false);
      setMessages((prev) => {
        const lastMessage = prev[prev.length - 1];
        
        let contentToAppend = '';
        if (payload.type === 'text') {
          contentToAppend = payload.content;
          setIsLoading(false);
        } else if (payload.type === 'tool') {
          setIsLoading(true);
        }

        if (lastMessage && lastMessage.role === 'ai') {
          return [
            ...prev.slice(0, -1),
            { ...lastMessage, content: lastMessage.content + contentToAppend },
          ];
        } else {
          return [...prev, { role: 'ai', content: contentToAppend }];
        }
      });
    });

    socket.on('estimated_time', (payload: { estimatedTimeMs: number }) => {
      setEstimatedTimeMs(payload.estimatedTimeMs);
    });

    socket.on('done', (payload?: { timeTakenMs?: number }) => {
      setIsStreaming(false);
      setEstimatedTimeMs(null);
      if (payload?.timeTakenMs) {
        setMessages((prev) => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage && lastMessage.role === 'ai') {
            return [
              ...prev.slice(0, -1),
              { ...lastMessage, responseTime: payload.timeTakenMs },
            ];
          }
          return prev;
        });
      }
    });

    socket.on('chatUpdated', (payload: { chatId: string; title: string }) => {
      if (onChatUpdated) {
        onChatUpdated(payload.chatId, payload.title);
      }
    });

    socket.on('error', (err: { message: string }) => {
      setError(err.message);
      setIsLoading(false);
      setIsStreaming(false);
    });

    return () => {
      socket.disconnect();
    };
  }, [chatId, onChatUpdated]);

  const sendMessage = (message: string, applicationId?: string) => {
    if (socketRef.current && chatId) {
      setMessages((prev) => [...prev, { role: 'user', content: message }]);
      setIsLoading(true);
      setEstimatedTimeMs(null);
      socketRef.current.emit('message', { chatId, message, userId, applicationId });
    }
  };

  return {
    messages,
    isStreaming,
    isLoading,
    isHistoryLoaded,
    error,
    estimatedTimeMs,
    sendMessage,
  };
};
