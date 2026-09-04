import axios, { AxiosInstance } from "axios";
import https from "https";
import dotenv from "dotenv";

dotenv.config();

const baseUrl = process.env.DEVICE_REGISTRY_BASE_URL || "http://192.168.21.108:8000";
const rejectUnauthorized = process.env.DEVICE_REGISTRY_REJECT_UNAUTHORIZED === "true";
const defaultToken = process.env.DEVICE_REGISTRY_DEFAULT_TOKEN || "";

export class DeviceRegistryService {
  private client: AxiosInstance;
  private activeToken: string = "";
  private activeRefreshToken: string = "";
  private rawCookieString: string = "";

  constructor() {
    const agent = new https.Agent({
      rejectUnauthorized,
    });

    this.activeToken = defaultToken;

    this.client = axios.create({
      baseURL: baseUrl,
      httpsAgent: agent,
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });
  }

  public setToken(token: string) {
    this.activeToken = token;
  }

  public getToken(): string {
    return this.activeToken;
  }

  private extractCookies(setCookieHeader: string[] | undefined) {
    if (!setCookieHeader || !Array.isArray(setCookieHeader)) return;
    this.rawCookieString = setCookieHeader.map((c) => c.split(";")[0]).join("; ");

    for (const cookie of setCookieHeader) {
      const accessMatch = cookie.match(/accessToken=([^;]+)/);
      if (accessMatch && accessMatch[1]) this.activeToken = accessMatch[1];

      const refreshMatch = cookie.match(/refreshToken=([^;]+)/);
      if (refreshMatch && refreshMatch[1]) this.activeRefreshToken = refreshMatch[1];
    }
  }

  private getAuthHeaders(overrideToken?: string) {
    const token = overrideToken || this.activeToken;
    const headers: Record<string, string> = {};

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
      headers["Cookie"] = `accessToken=${token}`;
      if (this.activeRefreshToken) {
        headers["Cookie"] += `; refreshToken=${this.activeRefreshToken}`;
      }
    } else if (this.rawCookieString) {
      headers["Cookie"] = this.rawCookieString;
    }

    return headers;
  }

  // ==========================================
  // AUTH MODULE
  // ==========================================
  async registerUser(data: { email?: string; username?: string; password?: string }) {
    const res = await this.client.post("/api/auth/register", data);
    this.extractCookies(res.headers["set-cookie"]);
    return res.data;
  }

  async login(data: { email?: string; password?: string }) {
    const res = await this.client.post("/api/auth/login", data);
    this.extractCookies(res.headers["set-cookie"]);

    const result = res.data;
    if (result && result.data && (result.data.accessToken || result.data.token)) {
      this.activeToken = result.data.accessToken || result.data.token;
    }
    return result;
  }

  async refreshToken(overrideToken?: string) {
    const res = await this.client.post(
      "/api/auth/refresh",
      {},
      { headers: this.getAuthHeaders(overrideToken) }
    );
    this.extractCookies(res.headers["set-cookie"]);
    return res.data;
  }

  async logout(overrideToken?: string) {
    const res = await this.client.post(
      "/api/auth/logout",
      {},
      { headers: this.getAuthHeaders(overrideToken) }
    );
    this.activeToken = "";
    this.activeRefreshToken = "";
    this.rawCookieString = "";
    return res.data;
  }

  async getCurrentUser(overrideToken?: string) {
    const res = await this.client.get("/api/auth/me", {
      headers: this.getAuthHeaders(overrideToken),
    });
    return res.data;
  }

  // ==========================================
  // USERS MODULE
  // ==========================================
  async listUsers(params?: { page?: number; limit?: number }, overrideToken?: string) {
    const res = await this.client.get("/api/users", {
      params,
      headers: this.getAuthHeaders(overrideToken),
    });
    return res.data;
  }

  async updateUserRole(userId: string, data: { role: string }, overrideToken?: string) {
    const res = await this.client.put(`/api/users/${userId}/role`, data, {
      headers: this.getAuthHeaders(overrideToken),
    });
    return res.data;
  }

  // ==========================================
  // DEVICES MODULE
  // ==========================================
  async createDevice(
    data: {
      manufacturer?: string;
      model?: string;
      firmware?: string;
      category?: string;
      protocols?: any;
    },
    overrideToken?: string
  ) {
    const res = await this.client.post("/api/devices", data, {
      headers: this.getAuthHeaders(overrideToken),
    });
    return res.data;
  }

  async listDevices(
    params?: { page?: number; limit?: number; search?: string },
    overrideToken?: string
  ) {
    const res = await this.client.get("/api/devices", {
      params,
      headers: this.getAuthHeaders(overrideToken),
    });
    return res.data;
  }

  async getDevice(deviceId: string, overrideToken?: string) {
    const res = await this.client.get(`/api/devices/${deviceId}`, {
      headers: this.getAuthHeaders(overrideToken),
    });
    return res.data;
  }

  async updateDevice(
    deviceId: string,
    data: {
      manufacturer?: string;
      model?: string;
      firmware?: string;
      category?: string;
      protocols?: any;
    },
    overrideToken?: string
  ) {
    const res = await this.client.put(`/api/devices/${deviceId}`, data, {
      headers: this.getAuthHeaders(overrideToken),
    });
    return res.data;
  }

  async deleteDevice(deviceId: string, overrideToken?: string) {
    const res = await this.client.delete(`/api/devices/${deviceId}`, {
      headers: this.getAuthHeaders(overrideToken),
    });
    return res.data;
  }

  // ==========================================
  // COMMUNICATIONS MODULE
  // ==========================================
  async createCommunication(
    data: {
      deviceId?: string;
      protocol?: string;
      settings?: any;
    },
    overrideToken?: string
  ) {
    const res = await this.client.post("/api/communications", data, {
      headers: this.getAuthHeaders(overrideToken),
    });
    return res.data;
  }

  async listCommunications(
    params?: { page?: number; limit?: number; deviceId?: string },
    overrideToken?: string
  ) {
    const res = await this.client.get("/api/communications", {
      params,
      headers: this.getAuthHeaders(overrideToken),
    });
    return res.data;
  }

  async getCommunication(communicationId: string, overrideToken?: string) {
    const res = await this.client.get(`/api/communications/${communicationId}`, {
      headers: this.getAuthHeaders(overrideToken),
    });
    return res.data;
  }

  async updateCommunication(
    communicationId: string,
    data: {
      protocol?: string;
      settings?: any;
    },
    overrideToken?: string
  ) {
    const res = await this.client.put(`/api/communications/${communicationId}`, data, {
      headers: this.getAuthHeaders(overrideToken),
    });
    return res.data;
  }

  async deleteCommunication(communicationId: string, overrideToken?: string) {
    const res = await this.client.delete(`/api/communications/${communicationId}`, {
      headers: this.getAuthHeaders(overrideToken),
    });
    return res.data;
  }

  // ==========================================
  // INDUSTRIAL OBJECTS MODULE
  // ==========================================
  async createIndustrialObject(
    data: {
      deviceId?: string;
      protocol?: string;
      objectType?: string;
      identifier?: string;
      datatype?: string;
    },
    overrideToken?: string
  ) {
    const res = await this.client.post("/api/industrial-objects/", data, {
      headers: this.getAuthHeaders(overrideToken),
    });
    return res.data;
  }

  async listIndustrialObjects(
    params?: { page?: number; limit?: number; protocol?: string },
    overrideToken?: string
  ) {
    const res = await this.client.get("/api/industrial-objects", {
      params,
      headers: this.getAuthHeaders(overrideToken),
    });
    return res.data;
  }

  async getIndustrialObject(industrialObjectId: string, overrideToken?: string) {
    const res = await this.client.get(`/api/industrial-objects/${industrialObjectId}`, {
      headers: this.getAuthHeaders(overrideToken),
    });
    return res.data;
  }

  async updateIndustrialObject(
    industrialObjectId: string,
    data: {
      objectType?: string;
      identifier?: string;
      datatype?: string;
    },
    overrideToken?: string
  ) {
    const res = await this.client.put(
      `/api/industrial-objects/${industrialObjectId}`,
      data,
      { headers: this.getAuthHeaders(overrideToken) }
    );
    return res.data;
  }

  async deleteIndustrialObject(industrialObjectId: string, overrideToken?: string) {
    const res = await this.client.delete(
      `/api/industrial-objects/${industrialObjectId}`,
      { headers: this.getAuthHeaders(overrideToken) }
    );
    return res.data;
  }
}

export const deviceRegistryService = new DeviceRegistryService();
