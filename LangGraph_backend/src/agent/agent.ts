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
  const documentToolNames = ["get_grounding_context"];
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
  async function documentAgentNode(state: typeof MessagesAnnotation.State) {
    const docPrompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        `You are an IIoT Document RAG Assistant.

        Rules:
        - Always use the 'get_grounding_context' tool first to retrieve contents from uploaded manuals/files (PDF, Excel, Word, CSV, etc.) when answering document queries.
        - Multi-Intent Queries: If the user asks a compound question (e.g. asking for the device model name AND the Modbus address map/registers), output multiple separate 'get_grounding_context' tool calls in parallel to retrieve complete context.
        - Iterative Search: If your retrieved context chunks are incomplete or reference specific sections/appendices that were not returned, call the tool again with a targeted search query for those referenced chapters.
        - Output Formatting: Synthesize your retrieved information into a clean, executive-ready response. Use Markdown grid tables for any parameter/register lists, clear section headers (e.g. ### Modbus Address Map), and callouts (> ⚠️ **CAUTION**) for warnings. Do not output raw JSON or system debug logs.
        - Images & Layouts: If a retrieved chunk has contentType: 'IMAGE' or contains image metadata (e.g. metadata.fileName) and the user is asking to retrieve, view, or display an image/diagram (like the rear panel, wiring diagram, etc.), render it inline using standard markdown image syntax pointing to the server: \`![Device Diagram](http://localhost:5100/uploads/<fileName>)\`, where <fileName> is the filename/path of the image from the chunk's metadata (e.g., \`metadata.fileName\`). Do NOT state that you cannot display images if this image filename metadata is available in your context.`,
      ],
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