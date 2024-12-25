import { TavilySearchResults } from '@langchain/community/tools/tavily_search';
import type { AIMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import {
  MessagesAnnotation,
  StateGraph,
  Annotation,
} from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { z } from 'zod';
import { DASH_SCOPE_CONFIGURATION } from '../config/index';
import { TavilySearchResultsAnnotation } from '../types/search.types';
import { UnitProcess, ReferenceSource } from '../types/interfaces';

const InternalStateAnnotation = MessagesAnnotation;
const OutputStateAnnotation = Annotation.Root({
  processesList: Annotation<UnitProcess[]>(),
  referenceSources: Annotation<ReferenceSource[]>(),
});

const tools = [new TavilySearchResults({ maxResults: 5 })];

// Define the function that calls the model
async function buildProcessesList(
  state: typeof InternalStateAnnotation.State,
) {
  // const model = new ChatOpenAI({
  //   model: 'gpt-4o-mini',
  // }).bindTools(tools);

  const model = new ChatOpenAI({
    model: 'qwen-plus',
    configuration: DASH_SCOPE_CONFIGURATION,
  }).bindTools(tools);
  // console.log(state.messages);

  const response = await model.invoke([
    {
      role: 'system',
      content: `You are an expert assistant specialized in analyzing and extracting detailed production processes for manufactured products.
      When provided with a product name and supplier, your task is to:
      1. First search the supplier's official website, focusing on technical documentation, product specifications, and manufacturing details
      2. If supplier information is insufficient, expand your search to:
         - Industry databases and technical repositories
         - Academic papers and patents
         - Manufacturing standards and guidelines
         - Trade publications and industry reports
      3. For each search iteration:
         - Prioritize authoritative and technical sources
         - Focus on step-by-step manufacturing procedures
         - Include key production parameters when available
         - Verify information accuracy across multiple sources
      4. Compile findings into a clear, chronological production workflow
      5. Include direct source links for each major process step identified
      
      Ensure all information is technically accurate and comes from reliable sources. If initial searches don't yield sufficient detail, refine your queries using industry-specific terminology and technical manufacturing terms.`,
    },
    ...state.messages,
  ]);

  return { messages: response };
}

// Define the function that determines whether to continue or not
function routeModelOutput(state: typeof InternalStateAnnotation.State) {
  const messages = state.messages;
  const lastMessage: AIMessage = messages[messages.length - 1];
  // If the LLM is invoking tools, route there.
  if ((lastMessage?.tool_calls?.length ?? 0) > 0 && messages.length < 10) {
    return 'tools';
  }
  // Otherwise to the outputModel.
  return 'outputModel';
}

async function outputModel(state: typeof InternalStateAnnotation.State) {
  const model = new ChatOpenAI({
    model: 'qwen-plus',
    configuration: DASH_SCOPE_CONFIGURATION,
  });

  const ResponseFormatter = z.object({
    processes_list: z
      .array(
        z.object({
          processName: z.string().describe('process name'),
          processDescription: z.string().describe('process description'),
          referenceSources: z.array(z.string()).describe('reference sources'),
        }),
      )
      .describe('production process list'),
  });

  const modelWithStructuredOutput =
    model.withStructuredOutput(ResponseFormatter);

  const lastRelevantMessage = state.messages.slice(-1);
  // console.log(lastRelevantMessage);

  const response = await modelWithStructuredOutput.invoke([
    {
      role: 'system',
      content: `Summarize the extracted production process into a structured format.`,
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
  console.log(lastSearchResult);

  if (lastSearchResult) {
    const results = JSON.parse(lastSearchResult.content as string);
    for (const result of results) {
      searchResults.push({
        content: result.content || [],
        url: result.url || [],
        title: result.title || [],
        score: result.score || [],
      });
    }
  }

  return { processesList: response.processes_list, referenceSources: searchResults };
}

const workflow = new StateGraph({
  input: InternalStateAnnotation,
  output: OutputStateAnnotation,
  stateSchema: InternalStateAnnotation,
})
  .addNode('buildProcessesList', buildProcessesList)
  .addNode('tools', new ToolNode(tools))
  .addNode('outputModel', outputModel)
  .addEdge('__start__', 'buildProcessesList')
  .addConditionalEdges('buildProcessesList', routeModelOutput, [
    'tools',
    'outputModel',
  ])
  .addEdge('tools', 'buildProcessesList')
  .addEdge('outputModel', '__end__');

export const graph = workflow.compile();
