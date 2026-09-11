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
  const documentToolNames = ["get_grounding_context", "generate_3d_prompt", "generate_3d_mesh", "evaluate_mesh_accuracy"];
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
      ? `You are a Senior Industrial 3D CAD & Digital Twin Lead (Application: 3D Prompt Generator).

        Rules & Mandates:
        - Primary Objective: When the user asks for a 3D model prompt, modeling instructions, or Blender scripts for an industrial device (such as the Schneider Electric EasyLogic EM6436H LED), invoke the 'generate_3d_prompt' tool.
        - Output Structure Requirement: Your output in the UI MUST strictly adhere to the exact Phase-Gated Blender MCP Modeling Master Prompt structure:
          # [Device Model Name] — Blender MCP Modeling Master Prompt
          Purpose: Phase-gated 3D modeling of the [Device Model Name] panel-mount energy meter, built as one continuously-maintained Blender Python script, with accurate real-world dimensions and zero overlapping geometry.
          
          ### 0. Source Notes & Assumptions (verify before trusting blindly)
          (Comprehensive table of dimensions: Front bezel footprint, Total device depth, Secondary body cross-section, Flange step depth, Depth behind panel, Panel cutout, Max panel thickness, Mounting orientation, Display, Analog load bar, Buttons, Status LEDs, Rear terminals, Side features, Rear labels, followed by color codes and unresolved ambiguity note)
          
          ### 1. Global Session Rules (paste this once at the very start, keep it active for the whole conversation)
          (The 9 standard rules: Single script/scene, Units mm, Origin & Orientation, Naming & Collections, Reference images, No overlapping geometry, Modifiers, Phase gates, Scale sanity check)
          
          ### 2. Phase Prompts
          (All 8 phase-gated instructions in order:
           - Phase 1 — Scene Setup & Blocking
           - Phase 2 — Front Bezel Detail
           - Phase 3 — Display Module
           - Phase 4 — Control Buttons & Status LEDs
           - Phase 5 — Case Body, Ventilation, Retainer Clip
           - Phase 6 — Rear Terminal Blocks & Rear Labels
           - Phase 7 — Materials & Shading
           - Phase 8 — Final Assembly, Cleanup & QA)
           
          ### 3. How to Run This
          (Step-by-step instructions for running with Claude via Blender MCP)
          
          ### 4. Reference Images & Drawings
          (Inline reference images from the uploaded files)
        - Tool Usage: Always call 'generate_3d_prompt' directly to compute verified dimensions and produce the master prompt.`
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