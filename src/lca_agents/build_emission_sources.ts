import { TavilySearchResults } from '@langchain/community/tools/tavily_search';
import type { AIMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { MessagesAnnotation, StateGraph, Annotation } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { z } from 'zod';
import { DASH_SCOPE_CONFIGURATION } from '../config/index';
import { TavilySearchResultsAnnotation } from '../types/search.types';
import { ReferenceSource, EmissionSource, UnitProcess } from '../types/interfaces';

const InternalStateAnnotation = MessagesAnnotation;
const OutputStateAnnotation = Annotation.Root({
  emissionSources: Annotation<EmissionSource[]>(),
  referenceSources: Annotation<ReferenceSource[]>(),
});

const tools = [new TavilySearchResults({ maxResults: 5 })];

async function buildEmissionSources(state: typeof InternalStateAnnotation.State) {
  const model = new ChatOpenAI({
    model: 'qwen-plus',
    configuration: DASH_SCOPE_CONFIGURATION,
  }).bindTools(tools);

  const response = await model.invoke([
    {
      role: 'system',
      content: `You are an expert assistant specialized in identifying and analyzing emission sources in industrial processes.
      When provided with a manufacturing process and product information, your task is to:
      1. Analyze the process for potential emission sources:
         - Direct process emissions
         - Energy-related emissions
         - Auxiliary process emissions
         - Fugitive emissions
         - Waste treatment emissions
      2. For each emission source, identify:
         - Source characteristics and type
         - Emission mechanisms
         - Operating conditions
         - Control technologies
      3. Focus on gathering information from:
         - Environmental permits and reports
         - BAT reference documents
         - Emission factor databases
         - Industry environmental guidelines
         - Scientific literature
      4. Consider emissions across different media:
         - Air emissions
         - Water discharges
         - Soil contamination
         - Waste generation
      5. Pay special attention to:
         - Greenhouse gas emissions
         - Regulated pollutants
         - Hazardous substances
         - Criteria air pollutants
         
      Provide comprehensive emission source information with proper technical details and references.`,
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

  const EmissionSourceSchema = z.object({
    name: z.string().describe('emission source name'),
    description: z.string().describe('detailed description of the emission source'),
    referenceSources: z.array(z.string()).describe('reference sources'),
  });

  const ResponseFormatter = z.object({
    emission_sources: z.array(EmissionSourceSchema).describe('list of emission sources'),
  });

  const modelWithStructuredOutput = model.withStructuredOutput(ResponseFormatter);

  const lastRelevantMessage = state.messages.slice(-1);

  const response = await modelWithStructuredOutput.invoke([
    {
      role: 'system',
      content: `Summarize the identified emission sources into a structured format.
      For each emission source, include:
      - Clear identification and name
      - Detailed technical description
      - Emission characteristics
      - Relevant control measures
      - Associated process steps
      
      Organize sources by their type and significance in the process.
      Ensure all major emission pathways are covered.`,
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

  return {
    emissionSources: response.emission_sources,
    referenceSources: searchResults,
  };
}

const workflow = new StateGraph({
  input: InternalStateAnnotation,
  output: OutputStateAnnotation,
  stateSchema: InternalStateAnnotation,
})
  .addNode('buildEmissionSources', buildEmissionSources)
  .addNode('tools', new ToolNode(tools))
  .addNode('outputModel', outputModel)
  .addEdge('__start__', 'buildEmissionSources')
  .addConditionalEdges('buildEmissionSources', routeModelOutput, [
    'tools',
    'outputModel',
  ])
  .addEdge('tools', 'buildEmissionSources')
  .addEdge('outputModel', '__end__');

export const graph = workflow.compile(); 