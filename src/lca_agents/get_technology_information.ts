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
  technologyInformation: Annotation<string>(),
  referenceSources: Annotation<ReferenceSource[]>(),
});

const tools = [new TavilySearchResults({ maxResults: 5 })];

async function getTechnologyInfo(state: typeof InternalStateAnnotation.State) {
  const model = new ChatOpenAI({
    model: 'qwen-plus',
    configuration: DASH_SCOPE_CONFIGURATION,
  }).bindTools(tools);

  const response = await model.invoke([
    {
      role: 'system',
      content: `You are an expert assistant specialized in analyzing manufacturing technologies and processes.
      When provided with a product name and optional supplier, your task is to:
      1. Research and analyze key technological aspects:
         - Manufacturing technologies and methods
         - Production equipment and machinery
         - Process control systems
         - Quality assurance technologies
         - Automation level and smart manufacturing features
      2. Focus on gathering information about:
         - Technical specifications and parameters
         - Process efficiency and optimization
         - Environmental control technologies
         - Industry 4.0 implementation
      3. Prioritize sources such as:
         - Technical documentation and manuals
         - Industry standards and guidelines
         - Academic and research publications
         - Patent documents
         - Equipment manufacturer specifications
      4. Pay special attention to:
         - Latest technological developments
         - Best available technologies (BAT)
         - Energy efficiency aspects
         - Environmental performance
         
      Provide detailed, technically accurate information with proper source attribution.
      Focus on current and emerging technologies relevant to the product's manufacturing.`,
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
    technology_information: z.string().describe('comprehensive technology information'),
  });

  const modelWithStructuredOutput = model.withStructuredOutput(ResponseFormatter);

  const lastRelevantMessage = state.messages.slice(-1);

  const response = await modelWithStructuredOutput.invoke([
    {
      role: 'system',
      content: `Summarize the gathered technology information into a clear, structured format.
      Include the following aspects:
      - Manufacturing technologies and methods
      - Key equipment and machinery
      - Process control and automation
      - Quality assurance systems
      - Environmental control technologies
      - Energy efficiency features
      - Industry 4.0 elements
      
      Organize the information in a logical flow, from basic technologies to advanced features.`,
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
    technologyInformation: response.technology_information,
    referenceSources: searchResults,
  };
}

const workflow = new StateGraph({
  input: InternalStateAnnotation,
  output: OutputStateAnnotation,
  stateSchema: InternalStateAnnotation,
})
  .addNode('getTechnologyInfo', getTechnologyInfo)
  .addNode('tools', new ToolNode(tools))
  .addNode('outputModel', outputModel)
  .addEdge('__start__', 'getTechnologyInfo')
  .addConditionalEdges('getTechnologyInfo', routeModelOutput, [
    'tools',
    'outputModel',
  ])
  .addEdge('tools', 'getTechnologyInfo')
  .addEdge('outputModel', '__end__');

export const graph = workflow.compile(); 