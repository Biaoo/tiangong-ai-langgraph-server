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
  relatedSupplierList: Annotation<string[]>(),
  referenceSources: Annotation<ReferenceSource[]>(),
});

const tools = [new TavilySearchResults({ maxResults: 5 })];

async function getRelatedSupplier(state: typeof InternalStateAnnotation.State) {
  const model = new ChatOpenAI({
    model: 'qwen-plus',
    configuration: DASH_SCOPE_CONFIGURATION,
  }).bindTools(tools);

  const response = await model.invoke([
    {
      role: 'system',
      content: `You are an expert assistant specialized in identifying and analyzing suppliers in manufacturing industries.
      When provided with a product name and optional supplier, your task is to:
      1. Search for and identify:
         - Major manufacturers and suppliers of the product
         - Key market players in the industry
         - Regional and global suppliers
         - Specialized/niche suppliers if applicable
      2. Focus on gathering:
         - Company profiles and capabilities
         - Manufacturing locations and facilities
         - Quality certifications and standards
         - Market presence and reputation
      3. Prioritize information from:
         - Industry directories and databases
         - Company websites and annual reports
         - Trade associations and industry reports
         - Business news and market analyses
      4. Verify supplier credibility through:
         - Industry certifications
         - Market presence duration
         - Customer references when available
         
      Provide comprehensive, accurate supplier information with proper source attribution.`,
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
    supplier_list: z.array(z.string()).describe('list of relevant suppliers with descriptions'),
  });

  const modelWithStructuredOutput = model.withStructuredOutput(ResponseFormatter);

  const lastRelevantMessage = state.messages.slice(-1);

  const response = await modelWithStructuredOutput.invoke([
    {
      role: 'system',
      content: `Summarize the gathered supplier information into a clear, structured list format.
      Each supplier entry should include:
      - Company name
      - Brief description of capabilities
      - Key products/services
      - Notable certifications or qualifications`,
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
    relatedSupplierList: response.supplier_list,
    referenceSources: searchResults,
  };
}

const workflow = new StateGraph({
  input: InternalStateAnnotation,
  output: OutputStateAnnotation,
  stateSchema: InternalStateAnnotation,
})
  .addNode('getRelatedSupplier', getRelatedSupplier)
  .addNode('tools', new ToolNode(tools))
  .addNode('outputModel', outputModel)
  .addEdge('__start__', 'getRelatedSupplier')
  .addConditionalEdges('getRelatedSupplier', routeModelOutput, [
    'tools',
    'outputModel',
  ])
  .addEdge('tools', 'getRelatedSupplier')
  .addEdge('outputModel', '__end__');

export const graph = workflow.compile(); 