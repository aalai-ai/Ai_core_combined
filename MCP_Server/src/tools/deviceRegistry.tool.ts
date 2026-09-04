import { deviceRegistryService } from "../services/deviceRegistry.service";

export const deviceRegistryToolDefinitions = [
  {
    name: "device_registry_auth",
    description: "Manage User Registration, Login, JWT Token Refresh, Logout, and User Profile on Device Registry Service.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["register", "login", "refresh", "logout", "get_me"],
          description: "Auth action to perform",
        },
        email: { type: "string", description: "User email address" },
        username: { type: "string", description: "Username for registration" },
        password: { type: "string", description: "User password" },
        token: { type: "string", description: "Optional explicit Bearer token" },
      },
      required: ["action"],
    },
  },
  {
    name: "device_registry_users",
    description: "List registered users and update user roles on Device Registry Service (Admin access required).",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list_users", "update_user_role"],
          description: "User management action to perform",
        },
        userId: { type: "string", description: "Target User ID for updating role" },
        role: { type: "string", description: "New role for user (e.g. Admin, User, Operator)" },
        page: { type: "number", description: "Page number for pagination" },
        limit: { type: "number", description: "Items per page limit" },
        token: { type: "string", description: "Optional explicit Bearer token" },
      },
      required: ["action"],
    },
  },
  {
    name: "device_registry_devices",
    description: "Create, List, Retrieve, Update, and Delete IoT & Industrial devices on Device Registry Service.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["create_device", "list_devices", "get_device", "update_device", "delete_device"],
          description: "Device action to perform",
        },
        deviceId: { type: "string", description: "Device ID for get/update/delete actions" },
        manufacturer: { type: "string", description: "Device manufacturer" },
        model: { type: "string", description: "Device model name/number" },
        firmware: { type: "string", description: "Firmware version" },
        category: { type: "string", description: "Device category (e.g., PLC, Sensor, Gateway)" },
        protocols: { description: "Supported protocols (object or array)" },
        page: { type: "number", description: "Page number for pagination" },
        limit: { type: "number", description: "Items per page limit" },
        search: { type: "string", description: "Search term for filtering devices" },
        token: { type: "string", description: "Optional explicit Bearer token" },
      },
      required: ["action"],
    },
  },
  {
    name: "device_registry_communications",
    description: "Create, List, Retrieve, Update, and Delete Communication configurations on Device Registry Service.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "create_communication",
            "list_communications",
            "get_communication",
            "update_communication",
            "delete_communication",
          ],
          description: "Communication action to perform",
        },
        communicationId: { type: "string", description: "Communication config ID" },
        deviceId: { type: "string", description: "Associated Device ID" },
        protocol: { type: "string", description: "Communication protocol (e.g. Modbus-TCP, MQTT, OPC-UA)" },
        settings: { description: "Protocol settings object (e.g. port, ip, baudRate, topic)" },
        page: { type: "number", description: "Page number for pagination" },
        limit: { type: "number", description: "Items per page limit" },
        token: { type: "string", description: "Optional explicit Bearer token" },
      },
      required: ["action"],
    },
  },
  {
    name: "device_registry_industrial_objects",
    description: "Create, List, Retrieve, Update, and Delete Industrial Data Objects on Device Registry Service.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "create_industrial_object",
            "list_industrial_objects",
            "get_industrial_object",
            "update_industrial_object",
            "delete_industrial_object",
          ],
          description: "Industrial Object action to perform",
        },
        industrialObjectId: { type: "string", description: "Industrial Object ID" },
        deviceId: { type: "string", description: "Associated Device ID" },
        protocol: { type: "string", description: "Protocol used by object" },
        objectType: { type: "string", description: "Type of industrial object (e.g., Register, Coils, Tag)" },
        identifier: { type: "string", description: "Identifier / address / tag name" },
        datatype: { type: "string", description: "Data type (e.g. float32, int16, boolean)" },
        page: { type: "number", description: "Page number for pagination" },
        limit: { type: "number", description: "Items per page limit" },
        token: { type: "string", description: "Optional explicit Bearer token" },
      },
      required: ["action"],
    },
  },
];

export async function handleDeviceRegistryToolCall(name: string, args: any) {
  try {
    switch (name) {
      case "device_registry_auth": {
        const { action, email, username, password, token } = args || {};
        switch (action) {
          case "register":
            return await deviceRegistryService.registerUser({ email, username, password });
          case "login":
            return await deviceRegistryService.login({ email, password });
          case "refresh":
            return await deviceRegistryService.refreshToken(token);
          case "logout":
            return await deviceRegistryService.logout(token);
          case "get_me":
            return await deviceRegistryService.getCurrentUser(token);
          default:
            throw new Error(`Unknown auth action: ${action}`);
        }
      }

      case "device_registry_users": {
        const { action, userId, role, page, limit, token } = args || {};
        switch (action) {
          case "list_users":
            return await deviceRegistryService.listUsers({ page, limit }, token);
          case "update_user_role":
            if (!userId || !role) throw new Error("userId and role are required for update_user_role");
            return await deviceRegistryService.updateUserRole(userId, { role }, token);
          default:
            throw new Error(`Unknown users action: ${action}`);
        }
      }

      case "device_registry_devices": {
        const {
          action,
          deviceId,
          manufacturer,
          model,
          firmware,
          category,
          protocols,
          page,
          limit,
          search,
          token,
        } = args || {};
        switch (action) {
          case "create_device":
            return await deviceRegistryService.createDevice(
              { manufacturer, model, firmware, category, protocols },
              token
            );
          case "list_devices":
            return await deviceRegistryService.listDevices({ page, limit, search }, token);
          case "get_device":
            if (!deviceId) throw new Error("deviceId is required for get_device");
            return await deviceRegistryService.getDevice(deviceId, token);
          case "update_device":
            if (!deviceId) throw new Error("deviceId is required for update_device");
            return await deviceRegistryService.updateDevice(
              deviceId,
              { manufacturer, model, firmware, category, protocols },
              token
            );
          case "delete_device":
            if (!deviceId) throw new Error("deviceId is required for delete_device");
            return await deviceRegistryService.deleteDevice(deviceId, token);
          default:
            throw new Error(`Unknown device action: ${action}`);
        }
      }

      case "device_registry_communications": {
        const { action, communicationId, deviceId, protocol, settings, page, limit, token } =
          args || {};
        switch (action) {
          case "create_communication":
            return await deviceRegistryService.createCommunication(
              { deviceId, protocol, settings },
              token
            );
          case "list_communications":
            return await deviceRegistryService.listCommunications(
              { page, limit, deviceId },
              token
            );
          case "get_communication":
            if (!communicationId) throw new Error("communicationId is required");
            return await deviceRegistryService.getCommunication(communicationId, token);
          case "update_communication":
            if (!communicationId) throw new Error("communicationId is required");
            return await deviceRegistryService.updateCommunication(
              communicationId,
              { protocol, settings },
              token
            );
          case "delete_communication":
            if (!communicationId) throw new Error("communicationId is required");
            return await deviceRegistryService.deleteCommunication(communicationId, token);
          default:
            throw new Error(`Unknown communications action: ${action}`);
        }
      }

      case "device_registry_industrial_objects": {
        const {
          action,
          industrialObjectId,
          deviceId,
          protocol,
          objectType,
          identifier,
          datatype,
          page,
          limit,
          token,
        } = args || {};
        switch (action) {
          case "create_industrial_object":
            return await deviceRegistryService.createIndustrialObject(
              { deviceId, protocol, objectType, identifier, datatype },
              token
            );
          case "list_industrial_objects":
            return await deviceRegistryService.listIndustrialObjects(
              { page, limit, protocol },
              token
            );
          case "get_industrial_object":
            if (!industrialObjectId) throw new Error("industrialObjectId is required");
            return await deviceRegistryService.getIndustrialObject(industrialObjectId, token);
          case "update_industrial_object":
            if (!industrialObjectId) throw new Error("industrialObjectId is required");
            return await deviceRegistryService.updateIndustrialObject(
              industrialObjectId,
              { objectType, identifier, datatype },
              token
            );
          case "delete_industrial_object":
            if (!industrialObjectId) throw new Error("industrialObjectId is required");
            return await deviceRegistryService.deleteIndustrialObject(industrialObjectId, token);
          default:
            throw new Error(`Unknown industrial objects action: ${action}`);
        }
      }

      default:
        throw new Error(`Unknown tool name: ${name}`);
    }
  } catch (error: any) {
    const errorDetails = error.response ? error.response.data : error.message;
    return {
      error: true,
      status: error.response?.status || 500,
      details: errorDetails,
    };
  }
}
