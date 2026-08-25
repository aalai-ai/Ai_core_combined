import axios from 'axios';

const rawBaseURL = import.meta.env.VITE_API_URL || 'http://localhost:5100';
const baseURL = rawBaseURL.endsWith('/api') ? rawBaseURL : `${rawBaseURL}/api`;

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add interceptor to include token in requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const registerUser = async (userData: any) => {
  const response = await api.post('/users', userData);
  return response.data;
};

export const loginUser = async (credentials: any) => {
  const response = await api.post('/users/login', credentials);
  return response.data;
};

export const createChat = async (userId: string, chatId?: string) => {
  const response = await api.post('/chats', { userId, chatId });
  return response.data;
};

export const getUserChats = async (userId: string) => {
  const response = await api.get(`/chats/user/${userId}`);
  return response.data;
};

export const uploadFile = async (file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post("/extraction/upload", formData, {
    headers: {
      "Content-Type": undefined,
    },
  });
  return response.data;
};

export default api;
