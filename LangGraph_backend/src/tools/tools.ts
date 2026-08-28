import { tool } from "@langchain/core/tools";
import { z } from "zod";

function getToolSchema(name: string) {
  switch (name) {
    case "create_project":
      return z.object({
        user_id: z.string().describe("The identifier of the user owner."),
        name: z.string().describe("Name of the project."),
      });
    case "create_tab":
      return z.object({
        project_id: z.string().describe("The project ID this tab belongs to."),
        title: z.string().describe("Title of the tab."),
      });
    case "save_device":
      return z.object({
        name: z.string().describe("Name of device."),
        manufacturer: z.string().describe("Manufacturer name."),
        model: z.string().describe("Model identifier."),
        firmware: z.string().optional().describe("Firmware version details."),
        product_family: z.string().optional().describe("Product category line."),
      });
    case "save_communication_settings":
      return z.object({
        protocol: z.string().describe("Communication protocol (e.g. Modbus, BACnet)."),
        interface: z.string().describe("Interface standard (e.g. RS-485, Ethernet)."),
        parameters: z.record(z.any()).optional().describe("Config details (baudrate, IP address, parity, etc.)."),
      });
    case "save_register":
      return z.object({
        address: z.string().describe("Register memory address."),
        type: z.string().describe("Register database/data type."),
        name: z.string().describe("Name of the register point."),
        access_type: z.string().describe("Capability standard (R, W, R/W)."),
        description: z.string().optional().describe("Description of the parameter."),
        scale: z.number().optional().describe("Multiplier scaling value."),
        unit: z.string().optional().describe("Measurement unit symbol."),
      });
    case "save_alarm":
      return z.object({
        code: z.string().describe("Error/Fault code."),
        description: z.string().describe("Fault condition description."),
        severity: z.string().describe("Criticality rating."),
        trigger_condition: z.string().optional().describe("Limit criteria of alarm trigger."),
      });
    case "save_parameter":
      return z.object({
        name: z.string().describe("Name of parameters."),
        type: z.string().describe("Value type string."),
        description: z.string().optional().describe("Details about parameter configuration."),
        default_value: z.string().optional().describe("Factory fallback default value."),
        min_val: z.string().optional().describe("Floor threshold boundary."),
        max_val: z.string().optional().describe("Ceiling threshold boundary."),
      });
    case "get_grounding_context":
      return z.object({
        query: z.string().describe("The user search prompt query containing keywords or model numbers to look up in the uploaded manuals."),
      });
    case "generate_3d_prompt":
      return z.object({
        query: z.string().describe("Search query or device name for generating 3D model prompts and Blender scripts."),
        documentId: z.string().optional().describe("Optional specific document ID."),
      });
    case "generate_3d_mesh":
      return z.object({
        prompt: z.string().describe("3D model description or prompt."),
        engine: z.string().optional().describe("3D Engine: hunyuan3d, trellis, or instantmesh."),
        image_paths: z.array(z.string()).optional().describe("Optional list of image paths extracted from the uploaded document to use for reconstruction."),
      });
    case "evaluate_mesh_accuracy":
      return z.object({
        meshId: z.string().describe("Generated 3D mesh identifier."),
      });
    default:
      return z.object({});
  }
}

export async function loadTools(mcpClient: any) {
  const toolList = await mcpClient.listTools();

  return toolList.tools.map((t: any) => {
    const schema = getToolSchema(t.name);
    return tool(
      async (args: any) => {
        console.log(`🔌 Calling MCP Tool '${t.name}' with arguments:`, args);
        
        const result = await mcpClient.callTool({
          name: t.name,
          arguments: args,
        });

        const parsed = JSON.parse(result.content[0].text);

        return JSON.stringify({
          type: "mcp_response",
          tool: t.name,
          data: parsed,
        });
      },
      {
        name: t.name,
        description: t.description,
        schema,
      }
    );
  });
}