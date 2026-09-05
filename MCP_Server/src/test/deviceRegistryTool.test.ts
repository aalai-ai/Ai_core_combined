import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Mock the Device Registry HTTP service so the dispatcher can be exercised
 * without any network access. Every method returns a tagged object so we can
 * assert the correct method was routed to with the correct arguments.
 */
vi.mock("../services/deviceRegistry.service", () => {
  const make = (method: string) =>
    vi.fn(async (...args: any[]) => ({ method, args }));

  return {
    deviceRegistryService: {
      registerUser: make("registerUser"),
      login: make("login"),
      refreshToken: make("refreshToken"),
      logout: make("logout"),
      getCurrentUser: make("getCurrentUser"),
      listUsers: make("listUsers"),
      updateUserRole: make("updateUserRole"),
      createDevice: make("createDevice"),
      listDevices: make("listDevices"),
      getDevice: make("getDevice"),
      updateDevice: make("updateDevice"),
      deleteDevice: make("deleteDevice"),
      createCommunication: make("createCommunication"),
      listCommunications: make("listCommunications"),
      getCommunication: make("getCommunication"),
      updateCommunication: make("updateCommunication"),
      deleteCommunication: make("deleteCommunication"),
      createIndustrialObject: make("createIndustrialObject"),
      listIndustrialObjects: make("listIndustrialObjects"),
      getIndustrialObject: make("getIndustrialObject"),
      updateIndustrialObject: make("updateIndustrialObject"),
      deleteIndustrialObject: make("deleteIndustrialObject"),
    },
  };
});

import { handleDeviceRegistryToolCall } from "../tools/deviceRegistry.tool";
import { deviceRegistryService } from "../services/deviceRegistry.service";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("device_registry_auth dispatch", () => {
  it("routes register with credentials", async () => {
    const res = await handleDeviceRegistryToolCall("device_registry_auth", {
      action: "register",
      email: "a@b.com",
      username: "alice",
      password: "pw",
    });
    expect(deviceRegistryService.registerUser).toHaveBeenCalledWith({
      email: "a@b.com",
      username: "alice",
      password: "pw",
    });
    expect((res as any).method).toBe("registerUser");
  });

  it("routes login", async () => {
    await handleDeviceRegistryToolCall("device_registry_auth", {
      action: "login",
      email: "a@b.com",
      password: "pw",
    });
    expect(deviceRegistryService.login).toHaveBeenCalledWith({
      email: "a@b.com",
      password: "pw",
    });
  });

  it("routes refresh/logout/get_me with the provided token", async () => {
    await handleDeviceRegistryToolCall("device_registry_auth", {
      action: "refresh",
      token: "t1",
    });
    await handleDeviceRegistryToolCall("device_registry_auth", {
      action: "logout",
      token: "t2",
    });
    await handleDeviceRegistryToolCall("device_registry_auth", {
      action: "get_me",
      token: "t3",
    });
    expect(deviceRegistryService.refreshToken).toHaveBeenCalledWith("t1");
    expect(deviceRegistryService.logout).toHaveBeenCalledWith("t2");
    expect(deviceRegistryService.getCurrentUser).toHaveBeenCalledWith("t3");
  });

  it("returns a structured error for an unknown auth action", async () => {
    const res = await handleDeviceRegistryToolCall("device_registry_auth", {
      action: "nope",
    });
    expect(res).toMatchObject({ error: true, status: 500 });
    expect((res as any).details).toMatch(/Unknown auth action/);
  });
});

describe("device_registry_users dispatch", () => {
  it("routes list_users with pagination", async () => {
    await handleDeviceRegistryToolCall("device_registry_users", {
      action: "list_users",
      page: 2,
      limit: 50,
      token: "tok",
    });
    expect(deviceRegistryService.listUsers).toHaveBeenCalledWith(
      { page: 2, limit: 50 },
      "tok"
    );
  });

  it("requires userId and role for update_user_role", async () => {
    const res = await handleDeviceRegistryToolCall("device_registry_users", {
      action: "update_user_role",
      userId: "u1",
    });
    expect(res).toMatchObject({ error: true });
    expect((res as any).details).toMatch(/userId and role are required/);
    expect(deviceRegistryService.updateUserRole).not.toHaveBeenCalled();
  });

  it("routes update_user_role when valid", async () => {
    await handleDeviceRegistryToolCall("device_registry_users", {
      action: "update_user_role",
      userId: "u1",
      role: "Admin",
      token: "tok",
    });
    expect(deviceRegistryService.updateUserRole).toHaveBeenCalledWith(
      "u1",
      { role: "Admin" },
      "tok"
    );
  });
});

describe("device_registry_devices dispatch", () => {
  it("routes create_device with the device payload", async () => {
    await handleDeviceRegistryToolCall("device_registry_devices", {
      action: "create_device",
      manufacturer: "ACME",
      model: "X1",
      firmware: "1.0",
      category: "PLC",
      protocols: ["modbus"],
      token: "tok",
    });
    expect(deviceRegistryService.createDevice).toHaveBeenCalledWith(
      {
        manufacturer: "ACME",
        model: "X1",
        firmware: "1.0",
        category: "PLC",
        protocols: ["modbus"],
      },
      "tok"
    );
  });

  it("requires deviceId for get_device", async () => {
    const res = await handleDeviceRegistryToolCall("device_registry_devices", {
      action: "get_device",
    });
    expect(res).toMatchObject({ error: true });
    expect((res as any).details).toMatch(/deviceId is required/);
  });

  it("routes delete_device", async () => {
    await handleDeviceRegistryToolCall("device_registry_devices", {
      action: "delete_device",
      deviceId: "d9",
      token: "tok",
    });
    expect(deviceRegistryService.deleteDevice).toHaveBeenCalledWith("d9", "tok");
  });
});

describe("device_registry_communications dispatch", () => {
  it("requires communicationId for get_communication", async () => {
    const res = await handleDeviceRegistryToolCall(
      "device_registry_communications",
      { action: "get_communication" }
    );
    expect((res as any).details).toMatch(/communicationId is required/);
  });

  it("routes create_communication", async () => {
    await handleDeviceRegistryToolCall("device_registry_communications", {
      action: "create_communication",
      deviceId: "d1",
      protocol: "Modbus-TCP",
      settings: { port: 502 },
      token: "tok",
    });
    expect(deviceRegistryService.createCommunication).toHaveBeenCalledWith(
      { deviceId: "d1", protocol: "Modbus-TCP", settings: { port: 502 } },
      "tok"
    );
  });
});

describe("device_registry_industrial_objects dispatch", () => {
  it("requires industrialObjectId for delete", async () => {
    const res = await handleDeviceRegistryToolCall(
      "device_registry_industrial_objects",
      { action: "delete_industrial_object" }
    );
    expect((res as any).details).toMatch(/industrialObjectId is required/);
  });

  it("routes list_industrial_objects", async () => {
    await handleDeviceRegistryToolCall(
      "device_registry_industrial_objects",
      { action: "list_industrial_objects", page: 1, limit: 10, protocol: "modbus", token: "tok" }
    );
    expect(deviceRegistryService.listIndustrialObjects).toHaveBeenCalledWith(
      { page: 1, limit: 10, protocol: "modbus" },
      "tok"
    );
  });
});

describe("unknown tool handling", () => {
  it("returns a structured error for an unknown tool name", async () => {
    const res = await handleDeviceRegistryToolCall("device_registry_unknown", {
      action: "x",
    });
    expect(res).toMatchObject({ error: true, status: 500 });
    expect((res as any).details).toMatch(/Unknown tool name/);
  });

  it("tolerates missing args object", async () => {
    const res = await handleDeviceRegistryToolCall(
      "device_registry_auth",
      undefined
    );
    // No action provided -> falls through to the unknown-action branch.
    expect(res).toMatchObject({ error: true });
  });
});
