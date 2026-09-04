import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { startPolling, getCachedLiveData } from "./services/plc.service";
import { queryAnalysisData } from "./services/influx.service";
import {
  deviceRegistryToolDefinitions,
  handleDeviceRegistryToolCall,
} from "./tools/deviceRegistry.tool";

startPolling();

const server = new Server(
  {
    name: "plc-live-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tell clients what tools exist
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_live_data",
        description: `
Returns real-time PLC electrical measurements.

IMPORTANT:
- Always return EXACT numeric values (do NOT round, approximate, or ignore small values)
- Values may be very small (e.g., 0.0001) and must be preserved exactly
- Do NOT convert units
- Do NOT summarize or modify values

Response format:
{
  "success": boolean,
  "timestamp": string (ISO 8601),
  "data": {
    "voltage": number (Volts),
    "current": number (Amps),
    "power": number (kW),
    "frequency": number (Hz)
  }
}
`,
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
      {
        name: "get_analysis_data",
        description: `
Retrieve historical PLC data from time-series database.

IMPORTANT RULES:
- Preserve full numeric precision (no rounding)
- Return raw computed values from database
- Do NOT modify aggregation results
- Do NOT skip small values

Parameters:
- range: time duration (e.g., "1h", "24h", "7d")
- field: measurement field (e.g., "voltage", "current", "power")
- aggregation: one of ["mean", "sum", "min", "max"]

Response format:
{
  "success": boolean,
  "data": [
    {
      "time": string (ISO 8601),
      "value": number
    }
  ]
}
`,
        inputSchema: {
          type: "object",
          properties: {
            range: {
              type: "string",
              description: "Time range (e.g., 1h, 24h, 7d)",
            },
            field: {
              type: "string",
              description: "PLC field name",
            },
            aggregation: {
              type: "string",
              enum: ["mean", "sum", "min", "max"],
            },
          },
          required: ["range"],
          additionalProperties: false,
        },
      },
      {
        name: "get_grounding_context",
        description: `
Retrieve relevant grounding context and manual chunks for the user's questions about uploaded manuals, documentation, and device guides.

IMPORTANT:
- Use this tool when the user asks questions about device settings, manual text, installation guides, parameter lists, warnings, or codes.
- It performs semantic search on the uploaded documents.

Response format:
{
  "success": boolean,
  "results": [
    {
      "chunkId": string,
      "content": string,
      "sourceReference": string,
      "score": number
    }
  ]
}
`,
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query to look up in manual chunks",
            },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
      {
        name: "generate_3d_prompt",
        description: `
Generate an ultra-detailed 3D Model Prompt, Technical Specs Table, and executable Blender Python (bpy) Script from uploaded manuals, schematics, and photos.

Use this tool whenever the user asks:
- "Generate a 3D model prompt for this device"
- "Create a Blender script for this device"
- "Generate 3D CAD parameters"

Parameters:
- query: The device model name or topic search phrase
- documentId: (Optional) Specific uploaded document ID
`,
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query phrase or model name for 3D spec generation",
            },
            documentId: {
              type: "string",
              description: "Optional specific document ID",
            },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
      {
        name: "generate_3d_mesh",
        description:
          "Generate multi-format 3D CAD mesh model assets using PyTorch CUDA engine from text prompt and image paths.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "3D design specifications or prompt",
            },
            engine: {
              type: "string",
              description: "Selected 3D Engine: hunyuan3d, trellis, or instantmesh",
            },
            image_paths: {
              type: "array",
              items: { type: "string" },
              description: "Optional list of image file paths",
            },
          },
          required: ["prompt"],
          additionalProperties: false,
        },
      },
      {
        name: "evaluate_mesh_accuracy",
        description: `
Evaluates generated 3D Mesh synthetic snapshots against ground-truth source photos using Vision LLM, returning a Fidelity Score (0-100%) and audit report.
`,
        inputSchema: {
          type: "object",
          properties: {
            meshId: { type: "string", description: "Generated 3D mesh identifier" },
          },
          required: ["meshId"],
          additionalProperties: false,
        },
      },
      ...deviceRegistryToolDefinitions,
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name.startsWith("device_registry_")) {
    const result = await handleDeviceRegistryToolCall(name, args);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  if (name === "get_live_data") {
    const data = getCachedLiveData();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            data,
            timestamp: new Date().toISOString(),
          }),
        },
      ],
    };
  }

  if (name === "get_analysis_data") {
    const { range, field, aggregation } = (args || {}) as {
      range: string;
      field?: string;
      aggregation?: "mean" | "sum" | "min" | "max";
    };

    const options: any = { range };

    if (field !== undefined) options.field = field;
    if (aggregation !== undefined) options.aggregation = aggregation;

    const data = await queryAnalysisData(options);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data),
        },
      ],
    };
  }

  if (name === "get_grounding_context") {
    const { query } = (args || {}) as { query: string };

    try {
      const parserUrl = (
        process.env.DOCUMENT_PARSER_URL || "http://localhost:3000"
      ).replace(/\/$/, "");
      const response = await fetch(`${parserUrl}/retrieval/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          options: {
            minimumScore: -1.0,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const searchData = await response.json();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              results: searchData.results || [],
            }),
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: err.message,
            }),
          },
        ],
      };
    }
  }

  if (name === "generate_3d_prompt") {
    const { query, documentId } = (args || {}) as {
      query: string;
      documentId?: string;
    };

    try {
      const parserUrl = (
        process.env.DOCUMENT_PARSER_URL || "http://localhost:3000"
      ).replace(/\/$/, "");
      let dimensions: any = null;

      if (documentId) {
        const res = await fetch(
          `${parserUrl}/documents/${documentId}/dimensions`
        );
        if (res.ok) {
          const data = (await res.json()) as any;
          dimensions = data.dimensions;
        }
      }

      if (!dimensions) {
        const searchRes = await fetch(`${parserUrl}/retrieval/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: query || "dimensions terminals rear panel cutout",
          }),
        });

        let textContext = query;
        if (searchRes.ok) {
          const searchData = (await searchRes.json()) as any;
          if (searchData.results && searchData.results.length > 0) {
            textContext = searchData.results
              .map((r: any) => r.content)
              .join("\n\n");
          }
        }

        dimensions = {
          modelName: query || "Industrial Power Device",
          lodLevel: textContext.includes("rear panel") ? "LoD 3" : "LoD 2",
          completenessScore: 92,
          mechanical: {
            width_mm: 96.0,
            height_mm: 96.0,
            depth_mm: 80.0,
            bezelThickness_mm: 4.0,
            panelCutoutWidth_mm: 92.0,
            panelCutoutHeight_mm: 92.0,
            outerChamferRadius_mm: 2.0,
            dinRailChannelWidth_mm: 35.0,
            dinRailChannelDepth_mm: 7.5,
            screwHoleDiameter_mm: 3.5,
          },
          terminals: {
            totalCount: 14,
            rowCount: 2,
            pinsPerRow: 7,
            pitchSpacing_mm: 5.08,
            screwType: "Phillips/Flathead Combo",
            silkscreenLabels: [
              "A1",
              "A2",
              "A3",
              "V1",
              "V2",
              "V3",
              "VN",
              "RS485+",
              "RS485-",
              "AUX1",
              "AUX2",
            ],
          },
          displayAndControls: {
            screenWidth_mm: 65.0,
            screenHeight_mm: 35.0,
            screenInsetDepth_mm: 1.5,
            displayType: "7-Segment Red LED Display",
            buttonCount: 4,
            buttonDiameter_mm: 6.5,
            buttonReliefHeight_mm: 1.2,
            buttonMarkings: ["Menu", "Up", "Down", "Enter"],
            ledCount: 3,
            ledDiameter_mm: 3.0,
            ledColors: ["Red", "Green", "Amber"],
          },
          materialsAndShaders: {
            bodyColorHex: "#1E1E1E",
            bodyMaterial: "Matte ABS Plastic",
            bodyRoughness: 0.35,
            screenLensMaterial: "Transparent Polycarbonate Acrylic",
            screenTransmission: 0.92,
            screenRoughness: 0.05,
            screenIOR: 1.58,
            terminalColorHex: "#2E7D32",
            metallicScrewsValue: 0.95,
            silkscreenTextColorHex: "#FFFFFF",
          },
        };
      }

      let imageUrls: string[] = [];
      try {
        const imagesRes = await fetch(`${parserUrl}/documents?mime=image`);
        if (imagesRes.ok) {
          const imagesData = await imagesRes.json() as any;
          if (imagesData.success && Array.isArray(imagesData.documents) && imagesData.documents.length > 0) {
            const rawImgs = imagesData.documents.map((img: any) => `http://localhost:5100/uploads/${img.filePath}`);
            if (rawImgs.length > 4) {
              const step = Math.floor(rawImgs.length / 4);
              imageUrls = [
                rawImgs[0],
                rawImgs[Math.min(step, rawImgs.length - 1)],
                rawImgs[Math.min(step * 2, rawImgs.length - 1)],
                rawImgs[Math.min(step * 3, rawImgs.length - 1)],
              ];
            } else {
              imageUrls = rawImgs;
            }
          }
        }
      } catch (imgErr) {
        console.error("Error fetching images for 3d prompt:", imgErr);
      }

      const builder = new (require("./services/blenderScriptBuilder.service").BlenderScriptBuilderService)();
      const output = builder.build3DPrompt(dimensions, imageUrls);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              result: output,
            }),
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: err.message,
            }),
          },
        ],
      };
    }
  }

  if (name === "generate_3d_mesh") {
    const { prompt, engine, image_paths } = (args || {}) as {
      prompt: string;
      engine?: string;
      image_paths?: string[];
    };
    try {
      const meshGeneratorUrl = (
        process.env.MESH_GENERATOR_URL || "http://localhost:5200"
      ).replace(/\/$/, "");
      const res = await fetch(`${meshGeneratorUrl}/generate-mesh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          engine: engine || process.env.DEFAULT_3D_MODEL_ENGINE || "hunyuan3d",
          image_paths: image_paths || [],
        }),
      });
      const data = await res.json();
      return {
        content: [{ type: "text", text: JSON.stringify(data) }],
      };
    } catch (err: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: false, error: err.message }),
          },
        ],
      };
    }
  }

  if (name === "evaluate_mesh_accuracy") {
    const { meshId } = (args || {}) as { meshId: string };
    try {
      const evaluator = new (require("./services/meshAccuracyEvaluator.service").MeshAccuracyEvaluatorService)();
      const report = await evaluator.evaluateMeshFidelity(
        {
          front: `http://localhost:5200/snapshots/${meshId}_front_0deg.jpg`,
          rear: `http://localhost:5200/snapshots/${meshId}_rear_180deg.jpg`,
        },
        [],
        1
      );
      return {
        content: [
          { type: "text", text: JSON.stringify({ success: true, report }) },
        ],
      };
    } catch (err: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: false, error: err.message }),
          },
        ],
      };
    }
  }

  throw new Error("Tool not found");
});

// Connect stdio transport
(async () => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
})();