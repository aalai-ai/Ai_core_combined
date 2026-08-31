import { ChatOllama } from "@langchain/ollama";
import { MessagesAnnotation, StateGraph, START, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";

export async function createAgent(tools: any[]) {
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const docModelName = process.env.OLLAMA_DOC_MODEL || "qwen3.5:9b";
  const plcModelName = process.env.OLLAMA_PLC_MODEL || "llama3.1:8b";

  console.log(`🤖 Initializing agent models: Doc Model = '${docModelName}', PLC Model = '${plcModelName}'`);

  const docModel = new ChatOllama({
    model: docModelName,
    temperature: 0,
    baseUrl: baseUrl,
  });

  const plcModel = new ChatOllama({
    model: plcModelName,
    temperature: 0,
    baseUrl: baseUrl,
  });

  // Categorize tools for specialized workers
  const documentToolNames = ["get_grounding_context", "generate_3d_prompt"];
  const documentTools = tools.filter((t) => documentToolNames.includes(t.name));
  const plcTools = tools.filter((t) => !documentToolNames.includes(t.name));

  const modelWithDocTools = documentTools.length > 0 ? docModel.bindTools(documentTools) : docModel;
  const modelWithPlcTools = plcTools.length > 0 ? plcModel.bindTools(plcTools) : plcModel;

  // 1. Fast Instant Intent Router (0ms latency, zero internal JSON leaks!)
  function routeIntent(state: typeof MessagesAnnotation.State): "documentAgent" | "plcAgent" {
    const lastMsg = state.messages[state.messages.length - 1];
    const query = (lastMsg?.content || "").toString().toLowerCase();

    // Keywords indicating hardware config / database actions
    const isPlcConfig = ["save", "configure", "create project", "create tab", "set register", "set alarm"].some(
      (kw) => query.includes(kw)
    );

    if (isPlcConfig) {
      return "plcAgent";
    }
    return "documentAgent";
  }

  // 2. Node: Document RAG Specialist Agent (Outputs clean Markdown directly!)
  async function documentAgentNode(state: any) {
    const is3DPromptApp = state.applicationId === '3d_prompt_generator';

    const systemPromptText = is3DPromptApp
      ? `You are a Senior Industrial 3D Art Director & CAD Technical Lead (Application: 3D Prompt Generator).

        Rules & Mandates:
        - Primary Objective: Act as an expert 3D Art Director giving detailed, exhaustive design & modeling instructions to a 3D artist. Your text response MUST NOT be brief or dull. You MUST produce a rich, highly descriptive, expansive 3D Modeling Brief & Specification Guide explaining the device to a 3D artist.
        - Tool Usage: Call the 'generate_3d_prompt' tool directly whenever the user requests 3D prompts, device model parameters, or Blender scripts.
        - Multi-File Fusion: Fuse text, CAD vector layers (.dxf/.step), and reference images across all uploaded session documents in a single pass.
        - Output Formatting Requirements (Always render ALL of the following sections in full detail):
          1. 🎨 **3D Art Director Brief & Architectural CAD Specification Guide**: Include the full, expansive prose breakdown (from the tool's \`artDirectorBrief\` field or synthesized by you) detailing the main casing form factor, corner chamfers, bezel cutout steps, front display optics (acrylic lens, transmission, IOR), rubber pushbuttons, status LEDs, rear terminal array rows, pin pitch, PBT green housing, steel screws, and DIN rail channel.
          2. 📐 **Micro-Detailed Technical Specifications Table**: The full markdown grid table listing all mechanical, terminal, display, and shader parameters.
          3. 📝 **Master 3D Model Prompt (Claude MCP / Midjourney / Text-to-3D Format)**: The comprehensive, hyper-descriptive prompt block.
          4. 🐍 **Executable Production Blender Python (bpy) Script**: The complete, production-ready Blender script inside a \`\`\`python code block.
          5. 🖼️ **Device Perspective / Reference Images**: If the 'generate_3d_prompt' tool returns images in its JSON response (under the "images" field), render all images inline using markdown: \`![Device Image](http://localhost:5100/uploads/<filePath>)\`.`
      : `You are an IIoT Document RAG Assistant (Application: Plixy).

        Rules:
        - Primary Objective: Solve user queries from uploaded manuals, schematics, and files (PDF, Excel, Word, CSV, etc.) using semantic vector retrieval.
        - Always use the 'get_grounding_context' tool first to retrieve contents from uploaded manuals/files when answering document queries.
        - Multi-Intent Queries: Output multiple separate tool calls in parallel to retrieve complete context for compound questions.
        - Output Formatting: Synthesize retrieved information into clean Markdown grid tables for parameter/register lists, clear section headers, and callouts (> ⚠️ **CAUTION**).
        - Images & Layouts: Render retrieved image diagrams inline using standard markdown syntax \`![Device Diagram](http://localhost:5100/uploads/<fileName>)\`.`;

    const docPrompt = ChatPromptTemplate.fromMessages([
      ["system", systemPromptText],
      new MessagesPlaceholder("messages"),
    ]);

    const formattedPrompt = await docPrompt.formatMessages({
      messages: state.messages,
    });

    const response = await modelWithDocTools.invoke(formattedPrompt);
    return { messages: [response] };
  }

  // 3. Node: PLC & Hardware Specialist Agent
  async function plcAgentNode(state: typeof MessagesAnnotation.State) {
    const plcPrompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        `You are an IIoT PLC & Industrial Hardware Specialist.

        Rules:
        - Use available PLC and database tools (save_device, save_register, save_alarm, save_parameter, create_project, create_tab) to configure industrial hardware profiles and save parameters.
        - Provide clear confirmation of all saved parameters and configurations using clean Markdown formatting.`,
      ],
      new MessagesPlaceholder("messages"),
    ]);

    const formattedPrompt = await plcPrompt.formatMessages({
      messages: state.messages,
    });

    const response = await modelWithPlcTools.invoke(formattedPrompt);
    return { messages: [response] };
  }

  // 4. Node: Prebuilt ToolNode
  const toolNode = new ToolNode(tools);

  // Tool Routing edge evaluator
  function shouldContinueTools(state: typeof MessagesAnnotation.State): "tools" | typeof END {
    const lastMessage = state.messages[state.messages.length - 1];
    const hasToolCalls =
      (lastMessage as any).tool_calls?.length ||
      lastMessage.additional_kwargs?.tool_calls?.length;

    if (lastMessage && hasToolCalls) {
      return "tools";
    }
    return END;
  }

  // Compile StateGraph structure (Streamlined 1-turn generation graph!)
  const workflow = new StateGraph(MessagesAnnotation)
    .addNode("documentAgent", documentAgentNode)
    .addNode("plcAgent", plcAgentNode)
    .addNode("tools", toolNode)
    .addConditionalEdges(START, routeIntent, {
      documentAgent: "documentAgent",
      plcAgent: "plcAgent",
    })
    .addConditionalEdges("documentAgent", shouldContinueTools, {
      tools: "tools",
      __end__: END,
    })
    .addConditionalEdges("plcAgent", shouldContinueTools, {
      tools: "tools",
      __end__: END,
    })
    .addEdge("tools", "documentAgent");

  return workflow.compile();
}