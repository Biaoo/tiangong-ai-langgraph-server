import { TavilySearchResults } from '@langchain/community/tools/tavily_search';
import type { AIMessage } from '@langchain/core/messages';
import { Annotation, MessagesAnnotation, StateGraph } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { DASH_SCOPE_CONFIGURATION } from '../config/index';
import { TavilySearchResultsAnnotation } from '../types/search.types';

const InternalStateAnnotation = MessagesAnnotation;

const OutputStateAnnotation = Annotation.Root({
  productBasicInformation: Annotation<string>(),
  referenceSources: Annotation<TavilySearchResultsAnnotation[]>(),
});

const InputStateAnnotation = Annotation.Root({
  ProductName: Annotation<string>(),
  SupplierName: Annotation<string>(),
});

const tools = [new TavilySearchResults({ maxResults: 5 })];

async function getProductBasicInfo({
  inputState,
  internalState,
}: {
  inputState: typeof InputStateAnnotation.State;
  internalState: typeof InternalStateAnnotation.State;
}): Promise<typeof InternalStateAnnotation.State> {
  console.log('inputState:', inputState);
  console.log('internalState:', internalState);
  console.log('Full inputState:', JSON.stringify(inputState, null, 2));
  const model = new ChatOpenAI({
    model: 'qwen-plus',
    configuration: DASH_SCOPE_CONFIGURATION,
  }).bindTools(tools);
  const productName = inputState.ProductName;
  const supplierName = inputState.SupplierName;
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
    ...internalState.messages,
  ]);

  return { messages: [response] };
}

function routeModelOutput(state: typeof InternalStateAnnotation.State) {
  const messages = state.messages;
  const lastMessage: AIMessage = messages[messages.length - 1];
  if ((lastMessage?.tool_calls?.length ?? 0) > 0 && messages.length < 10) {
    return 'tools';
  }
  return 'outputModel';
}

async function outputModel(
  state: typeof InternalStateAnnotation.State,
): Promise<typeof OutputStateAnnotation.State> {
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

const workflow = new StateGraph({
  input: InputStateAnnotation,
  output: OutputStateAnnotation,
  stateSchema: InternalStateAnnotation,
})
  .addNode('getProductBasicInfo', getProductBasicInfo)
  .addNode('tools', new ToolNode(tools))
  .addNode('outputModel', outputModel)
  .addEdge('__start__', 'getProductBasicInfo')
  .addConditionalEdges('getProductBasicInfo', routeModelOutput, ['tools', 'outputModel'])
  .addEdge('tools', 'getProductBasicInfo')
  .addEdge('outputModel', '__end__');

export const graph = workflow.compile();

(async () => {
  const result = await graph.invoke({
    ProductName: 'Product 1',
    SupplierName: 'Supplier 1',
  });
  console.log('Result:', JSON.stringify(result, null, 2));
})();

