import { AgentState } from '../state';
import { OllamaProvider } from '../../../rag/providers/ollama.provider';
import { config } from '../../../config/config';
import { logger } from '../../../utils/logger';

export async function llmNode(state: AgentState): Promise<Partial<AgentState>> {
  logger.info('[LLM Node] Formulating response.');
  
  // 1. Check if we already have an answer from askRAG tool
  const ragResult = (state.toolResults || []).find(r => r.tool === 'askRAG');
  if (ragResult && ragResult.output && ragResult.output.answer) {
    logger.info('[LLM Node] Reusing answer from Ask RAG Tool.');
    return { llmResponse: ragResult.output.answer };
  }

  // 2. Otherwise generate response using LLM provider
  const provider = new OllamaProvider();
  
  let prompt = '';
  const messagesStr = (state.messages || [])
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n');

  if (state.intent === 'Metadata Request') {
    const metaResult = (state.toolResults || []).find(r => r.tool === 'getMetadata');
    const metaStr = metaResult ? JSON.stringify(metaResult.output, null, 2) : 'No metadata retrieved.';
    prompt = `SYSTEM: ${config.agentSystemPrompt || 'Format the following metadata information clearly.'}
USER: Explain or show this metadata in a readable format for query: "${state.currentQuery}"
METADATA:
${metaStr}`;
  } else if (state.intent === 'Document Search') {
    const searchResult = (state.toolResults || []).find(r => r.tool === 'searchDocuments');
    const searchStr = searchResult ? JSON.stringify(searchResult.output, null, 2) : 'No search results.';
    prompt = `SYSTEM: ${config.agentSystemPrompt || 'Summarize the document search results.'}
USER: Show the following search results matching: "${state.currentQuery}"
RESULTS:
${searchStr}`;
  } else {
    // General chat
    prompt = `SYSTEM: ${config.agentSystemPrompt || 'You are a helpful AI assistant.'}
CONVERSATION HISTORY:
${messagesStr}
ASSISTANT:`;
  }

  const llmResponse = await provider.generateResponse(prompt, {
    model: config.agentDefaultModel || 'gpt-4o-mini',
  });

  return { llmResponse: llmResponse.answer };
}

export default llmNode;
