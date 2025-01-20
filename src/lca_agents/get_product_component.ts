import { TavilySearchResults } from '@langchain/community/tools/tavily_search';
import type { AIMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { MessagesAnnotation, StateGraph, Annotation } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { z } from 'zod';
import { DASH_SCOPE_CONFIGURATION } from '../config/index';
import { TavilySearchResultsAnnotation } from '../types/search.types';
import { ReferenceSource } from '../types/interfaces';

const InternalStateAnnotation = MessagesAnnotation;
const OutputStateAnnotation = Annotation.Root({
  productComponent: Annotation<string>(),
  referenceSources: Annotation<ReferenceSource[]>(),
});

const tools = [new TavilySearchResults({ maxResults: 5 })];

async function getProductComponent(state: typeof InternalStateAnnotation.State) {
  const model = new ChatOpenAI({
    model: 'qwen-plus',
    configuration: DASH_SCOPE_CONFIGURATION,
  }).bindTools(tools);

  const response = await model.invoke([
    {
      role: 'system',
      content: `You are an expert assistant specialized in analyzing product compositions and materials.
      When provided with a product name and optional supplier, your task is to:
      1. Search for detailed information about:
         - Material composition and percentages
         - Chemical constituents
         - Key components and their specifications
         - Manufacturing materials
      2. Focus on:
         - Technical specifications
         - Material safety data sheets
         - Product documentation
         - Industry standards
      3. Verify information across multiple reliable sources
      4. Prioritize supplier-specific information when available
      
      Provide detailed, accurate composition information with proper source attribution.`,
    },
    ...state.messages,
  ]);

  return { messages: response };
}

function routeModelOutput(state: typeof InternalStateAnnotation.State) {
  const messages = state.messages;
  const lastMessage: AIMessage = messages[messages.length - 1];
  if ((lastMessage?.tool_calls?.length ?? 0) > 0 && messages.length < 10) {
    return 'tools';
  }
  return 'outputModel';
}

async function outputModel(state: typeof InternalStateAnnotation.State) {
  const model = new ChatOpenAI({
    model: 'qwen-plus',
    configuration: DASH_SCOPE_CONFIGURATION,
  });

  const ResponseFormatter = z.object({
    component_information: z.string().describe('detailed component information'),
  });

  const modelWithStructuredOutput = model.withStructuredOutput(ResponseFormatter);

  const lastRelevantMessage = state.messages.slice(-1);

  const response = await modelWithStructuredOutput.invoke([
    {
      role: 'system',
      content: `Summarize the gathered component information into a clear, structured format.`,
    },
    ...lastRelevantMessage,
  ]);

  const searchResults: TavilySearchResultsAnnotation[] = [];
  const lastSearchResult = [...state.messages]
    .reverse()
    .find(
      (msg) =>
        msg.getType() === 'tool' && msg.name === 'tavily_search_results_json',
    );

  if (lastSearchResult) {
    const results = JSON.parse(lastSearchResult.content as string);
    for (const result of results) {
      searchResults.push({
        content: result.content || '',
        url: result.url || '',
        title: result.title || '',
        score: result.score || 0,
      });
    }
  }

  return {
    productComponent: response.component_information,
    referenceSources: searchResults,
  };
}

const workflow = new StateGraph({
  input: InternalStateAnnotation,
  output: OutputStateAnnotation,
  stateSchema: InternalStateAnnotation,
})
  .addNode('getProductComponent', getProductComponent)
  .addNode('tools', new ToolNode(tools))
  .addNode('outputModel', outputModel)
  .addEdge('__start__', 'getProductComponent')
  .addConditionalEdges('getProductComponent', routeModelOutput, [
    'tools',
    'outputModel',
  ])
  .addEdge('tools', 'getProductComponent')
  .addEdge('outputModel', '__end__');

export const graph = workflow.compile(); 