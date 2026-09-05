import { describe, it, expect } from "vitest";
import { deviceRegistryToolDefinitions } from "../tools/deviceRegistry.tool";

/**
 * These tests validate the *shape* of the tool definitions that the MCP server
 * advertises via the ListTools request. They act as a contract test: if a tool
 * is renamed, loses its schema, or drops a supported action, this suite fails.
 */

const EXPECTED_TOOLS: Record<string, string[]> = {
  device_registry_auth: ["register", "login", "refresh", "logout", "get_me"],
  device_registry_users: ["list_users", "update_user_role"],
  device_registry_devices: [
    "create_device",
    "list_devices",
    "get_device",
    "update_device",
    "delete_device",
  ],
  device_registry_communications: [
    "create_communication",
    "list_communications",
    "get_communication",
    "update_communication",
    "delete_communication",
  ],
  device_registry_industrial_objects: [
    "create_industrial_object",
    "list_industrial_objects",
    "get_industrial_object",
    "update_industrial_object",
    "delete_industrial_object",
  ],
};

describe("deviceRegistryToolDefinitions", () => {
  it("exposes exactly the expected set of tools", () => {
    const names = deviceRegistryToolDefinitions.map((t) => t.name).sort();
    expect(names).toEqual(Object.keys(EXPECTED_TOOLS).sort());
  });

  it("every tool has a non-empty description and an object input schema", () => {
    for (const tool of deviceRegistryToolDefinitions) {
      expect(tool.description, `${tool.name} description`).toBeTruthy();
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.properties).toBeTypeOf("object");
    }
  });

  it("every tool requires the action property", () => {
    for (const tool of deviceRegistryToolDefinitions) {
      expect((tool.inputSchema as any).required, `${tool.name} required`).toContain(
        "action"
      );
    }
  });

  it("each tool's action enum matches the supported actions", () => {
    for (const tool of deviceRegistryToolDefinitions) {
      const actionProp = (tool.inputSchema.properties as any).action;
      expect(actionProp, `${tool.name} action prop`).toBeDefined();
      expect(actionProp.enum.sort()).toEqual(
        EXPECTED_TOOLS[tool.name]!.slice().sort()
      );
    }
  });

  it("has no duplicate tool names", () => {
    const names = deviceRegistryToolDefinitions.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
