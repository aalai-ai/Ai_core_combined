import { StateGraph, START, END, MemorySaver } from '@langchain/langgraph';
import { AgentStateAnnotation } from './state';
import { startNode } from './nodes/start.node';
import { intentNode } from './nodes/intent.node';
import { planningNode } from './nodes/planning.node';
import { toolSelectionNode } from './nodes/toolSelection.node';
import { toolExecutionNode } from './nodes/toolExecution.node';
import { contextValidationNode } from './nodes/contextValidation.node';
import { llmNode } from './nodes/llm.node';
import { responseNode } from './nodes/response.node';
import { endNode } from './nodes/end.node';

export function createAgentWorkflow() {
  const workflow = new StateGraph(AgentStateAnnotation)
    .addNode('start', startNode)
    .addNode('intentDetection', intentNode)
    .addNode('planning', planningNode)
    .addNode('toolSelection', toolSelectionNode)
    .addNode('toolExecution', toolExecutionNode)
    .addNode('contextValidation', contextValidationNode)
    .addNode('llm', llmNode)
    .addNode('response', responseNode)
    .addNode('end', endNode);

  // Set sequence path flow edges
  //test
  workflow.addEdge(START, 'start');
  workflow.addEdge('start', 'intentDetection');
  workflow.addEdge('intentDetection', 'planning');
  workflow.addEdge('planning', 'toolSelection');
  workflow.addEdge('toolSelection', 'toolExecution');
  workflow.addEdge('toolExecution', 'contextValidation');
  workflow.addEdge('contextValidation', 'llm');
  workflow.addEdge('llm', 'response');
  workflow.addEdge('response', 'end');
  workflow.addEdge('end', END);

  const checkpointer = new MemorySaver();
  return workflow.compile({ checkpointer });
}

export const agentGraph = createAgentWorkflow();
export default agentGraph;
