import { TavilySearchResults } from '@langchain/community/tools/tavily_search';
import type { AIMessage, BaseMessage } from '@langchain/core/messages';
import { Annotation, StateGraph } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { DASH_SCOPE_CONFIGURATION } from '../config/index';
import { TavilySearchResultsAnnotation } from '../types/search.types';

const StateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
  }),
  ProductName: Annotation<string>(),
  SupplierName: Annotation<string>(),
  productBasicInformation: Annotation<string>(),
  referenceSources: Annotation<TavilySearchResultsAnnotation[]>(),
});

const tools = [new TavilySearchResults({ maxResults: 5 })];

async function getProductBasicInfo(
  state: typeof StateAnnotation.State,
): Promise<Partial<typeof StateAnnotation.State>> {
  console.log('inputState:', state);
  console.log('Full inputState:', JSON.stringify(state, null, 2));
  const model = new ChatOpenAI({
    model: 'qwen-plus',
    configuration: DASH_SCOPE_CONFIGURATION,
  }).bindTools(tools);
  const productName = state.ProductName;
  const supplierName = state.SupplierName;
  console.log(productName, supplierName);
  const response = await model.invoke([
    {
      role: 'system',
      content: `You are an expert assistant specialized in gathering comprehensive product information.
      When provided with a product name, your task is to:
      1. Search for authoritative sources about the product
      2. Focus on gathering:
         - Product classification and category
         - Key characteristics and properties
         - Common applications and uses
         - Industry standards and certifications
      3. Ensure information accuracy by cross-referencing multiple sources
      4. Prioritize technical and official documentation
      
      Provide clear, factual information with proper source attribution.
      `,
    },
    {
      role: 'user',
      content: `Product Name: ${productName}\nSupplier Name: ${supplierName}`,
    },
    ...(state.messages || []),
  ]);

  return { messages: [response] };
}

function routeModelOutput(state: typeof StateAnnotation.State) {
  const messages = state.messages;
  const lastMessage: AIMessage = messages[messages.length - 1];
  if ((lastMessage?.tool_calls?.length ?? 0) > 0 && messages.length < 10) {
    return 'tools';
  }
  return 'outputModel';
}

async function outputModel(
  state: typeof StateAnnotation.State,
): Promise<Partial<typeof StateAnnotation.State>> {
  const model = new ChatOpenAI({
    model: 'qwen-plus',
    configuration: DASH_SCOPE_CONFIGURATION,
  });

  const ResponseFormatter = z.object({
    product_information: z.string().describe('comprehensive product information'),
  });

  const modelWithStructuredOutput = model.withStructuredOutput(ResponseFormatter);

  const lastRelevantMessage = state.messages.slice(-1);

  const response = await modelWithStructuredOutput.invoke([
    {
      role: 'system',
      content: `Summarize the gathered product information into a clear, structured format.`,
    },
    ...lastRelevantMessage,
  ]);

  const searchResults: TavilySearchResultsAnnotation[] = [];
  const lastSearchResult = [...state.messages]
    .reverse()
    .find((msg) => msg.getType() === 'tool' && msg.name === 'tavily_search_results_json');

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
    productBasicInformation: response.product_information,
    referenceSources: searchResults,
  };
}

const workflow = new StateGraph(StateAnnotation)
  .addNode('getProductBasicInfo', getProductBasicInfo)
  .addNode('tools', new ToolNode(tools))
  .addNode('outputModel', outputModel)
  .addEdge('__start__', 'getProductBasicInfo')
  .addConditionalEdges('getProductBasicInfo', routeModelOutput, ['tools', 'outputModel'])
  .addEdge('tools', 'getProductBasicInfo')
  .addEdge('outputModel', '__end__');

export const graph = workflow.compile();

export async function runProductInfoWorkflow(productName: string, supplierName: string) {
  const initialState = {
    ProductName: productName,
    SupplierName: supplierName,
    messages: [],
    productBasicInformation: '',
    referenceSources: [],
  };

  return await graph.invoke(initialState);
}

if (require.main === module) {
  (async () => {
    try {
      const result = await runProductInfoWorkflow('Product 1', 'Supplier 1');
      console.log('Result:', JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('Error:', error);
    }
  })();
}
