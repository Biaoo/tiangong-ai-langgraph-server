import { graph } from '../lca_agents/build_processes_list';
import { BuildProcessesList } from '../types/interfaces';

type BuildProcessesListFn = {
  buildProcessesList(
    params: BuildProcessesList['request']
  ): Promise<BuildProcessesList['response']>;
};

export class ProcessesListService implements BuildProcessesListFn {
  /**
   * 构建产品的生产流程列表
   * @param params - BuildProcessesList.request 参数
   * @returns BuildProcessesList.response 响应
   */
  public async buildProcessesList(
    params: BuildProcessesList['request']
  ): Promise<BuildProcessesList['response']> {
    try {
      const { productName, supplier, productComponent, technologyInformation } = params;
      
      let prompt = `Please analyze and extract the detailed production processes for ${productName}`;
      
      if (supplier) {
        prompt += ` manufactured by ${supplier}`;
      }
      
      if (productComponent) {
        prompt += `\nProduct Component Information: ${productComponent}`;
      }
      
      if (technologyInformation) {
        prompt += `\nTechnology Information: ${technologyInformation}`;
      }

      const result = await graph.invoke({
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      return {
        processesList: result.processesList,
        referenceSources: result.referenceSources
      };
    } catch (error) {
      console.error('Error building processes list:', error);
      throw new Error('Failed to build processes list');
    }
  }
} 