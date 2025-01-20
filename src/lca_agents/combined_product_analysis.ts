import { TavilySearchResults } from '@langchain/community/tools/tavily_search';
import type { AIMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { MessagesAnnotation, StateGraph, Annotation, Command } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { DASH_SCOPE_CONFIGURATION } from '../config/index';
import { 
  ReferenceSource, 
  UnitProcess, 
  EmissionSource,
  StringWithReferenceSource 
} from '../types/interfaces';
import { graph as productBasicInfoGraph } from './get_product_basic_information';
import { graph as productComponentGraph } from './get_product_component';
import { graph as relatedSupplierGraph } from './get_related_supplier';
import { graph as technologyInfoGraph } from './get_technology_information';
import { graph as processesListGraph } from './build_processes_list';
import { graph as emissionSourcesGraph } from './build_emission_sources';

// 定义组合输出的状态注解
const InternalStateAnnotation = MessagesAnnotation;
const OutputStateAnnotation = Annotation.Root({
  productBasicInformation: Annotation<StringWithReferenceSource>(),
  productComponent: Annotation<StringWithReferenceSource>(),
  relatedSupplierList: Annotation<StringWithReferenceSource[]>(),
  technologyInformation: Annotation<StringWithReferenceSource>(),
  processesList: Annotation<UnitProcess[]>(),
  emissionSources: Annotation<EmissionSource[]>(),
  referenceSources: Annotation<ReferenceSource[]>(),
});

interface AnalysisState {
  currentStep: string | null;
  completedSteps: Set<string>;
  productBasicInfo?: StringWithReferenceSource;
  productComponent?: StringWithReferenceSource;
  relatedSupplierList?: StringWithReferenceSource[];
  technologyInfo?: StringWithReferenceSource;
  processesList?: UnitProcess[];
  currentProcessIndex?: number;
  emissionSourcesList?: EmissionSource[][];
}

async function routeToNextStep(state: typeof InternalStateAnnotation.State) {
  if (!state.metadata) {
    state.metadata = { analysisState: { currentStep: null, completedSteps: new Set() } };
  }
  const analysisState = state.metadata.analysisState as AnalysisState;
  
  // 记录当前步骤完成
  if (analysisState.currentStep) {
    analysisState.completedSteps.add(analysisState.currentStep);
  }

  // 检查是否可以进入 getProcesses
  const requiredForProcesses = ['getComponent', 'getTechnology'];
  const canStartProcesses = requiredForProcesses.every(step => 
    analysisState.completedSteps.has(step)
  );

  if (canStartProcesses && !analysisState.completedSteps.has('getProcesses')) {
    return 'getProcesses';
  }

  if (analysisState.currentStep === 'getProcesses') {
    return 'getEmissions';
  }

  if (analysisState.currentStep === 'getEmissions') {
    if (analysisState.processesList && 
        typeof analysisState.currentProcessIndex === 'number' &&
        analysisState.currentProcessIndex < analysisState.processesList.length - 1) {
      return 'getEmissions';
    }
    return 'finalizeResults';
  }

  // 默认返回 finalizeResults 而不是 null
  return 'finalizeResults';
}

const workflow = new StateGraph({
  input: InternalStateAnnotation,
  output: OutputStateAnnotation,
  stateSchema: InternalStateAnnotation,
})
  .addNode('getBasicInfo', productBasicInfoGraph)
  .addNode('getComponent', productComponentGraph)
  .addNode('getSupplier', relatedSupplierGraph)
  .addNode('getTechnology', technologyInfoGraph)
  .addNode('getProcesses', processesListGraph)
  .addNode('getEmissions', emissionSourcesGraph)
  .addNode('finalizeResults', async (state) => {
    const analysisState = state.metadata.analysisState as AnalysisState;
    const allEmissionSources = (analysisState.emissionSourcesList || []).flat();
    
    return {
      productBasicInformation: analysisState.productBasicInfo || '',
      productComponent: analysisState.productComponent || '',
      relatedSupplierList: analysisState.relatedSupplierList || [],
      technologyInformation: analysisState.technologyInfo || '',
      processesList: analysisState.processesList || [],
      emissionSources: allEmissionSources,
      referenceSources: [],
    };
  })
  
  .addEdge('__start__', 'getComponent')
  .addEdge('__start__', 'getTechnology')
  .addEdge('__start__', 'getSupplier')
  .addEdge('__start__', 'getBasicInfo')
  
  .addConditionalEdges('getComponent', routeToNextStep, [
    'getProcesses',
  ])
  .addConditionalEdges('getTechnology', routeToNextStep, [
    'getProcesses',
  ])
  
  .addConditionalEdges('getBasicInfo', routeToNextStep, [
    'finalizeResults',
  ])
  .addConditionalEdges('getSupplier', routeToNextStep, [
    'finalizeResults',
  ])
  
  .addConditionalEdges('getProcesses', routeToNextStep, [
    'getEmissions',
  ])
  .addConditionalEdges('getEmissions', routeToNextStep, [
    'getEmissions',
    'finalizeResults',
  ])
  .addEdge('finalizeResults', '__end__');

export const graph = workflow.compile();

export async function analyzeProduct(productName: string, supplier?: string) {
  const initialMessage = {
    role: 'user',
    content: `Analyze the product "${productName}"${supplier ? ` from supplier "${supplier}"` : ''}`
  };
  
  const result = await graph.invoke({
    messages: [initialMessage],
    metadata: { 
      analysisState: {
        currentStep: null,
        completedSteps: new Set(),
      }
    }
  });
  
  return result;
} 