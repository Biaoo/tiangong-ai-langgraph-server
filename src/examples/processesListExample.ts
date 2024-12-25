import { config } from 'dotenv';
import { ProcessesListService } from '../services/ProcessesListService';

// 加载环境变量
config();

// 验证必要的环境变量
function validateEnv() {
  const requiredEnvVars = ['TAVILY_API_KEY'];
  const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
  
  if (missingEnvVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  }
}

async function main() {
  try {
    // 验证环境变量
    validateEnv();
    
    const processesListService = new ProcessesListService();
    
    console.log('\n开始分析生产流程...');
    const startTime = Date.now();
    
    // 示例：分析太阳能电池板的生产流程
    const result = await processesListService.buildProcessesList({
      productName: 'Solar Panel',
      supplier: 'Suntech Power',
      // 可选参数
      productComponent: '主要由硅片、玻璃、EVA胶膜、背板等材料组成',
      technologyInformation: '使用PERC电池技术'
    });
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000; // 转换为秒
    
    console.log(`\n分析完成! 用时: ${duration.toFixed(2)}秒`);
    console.log('\n=== Production Processes ===');
    result.processesList.forEach((process, index) => {
      console.log(`\n${index + 1}. ${process.processName}`);
      console.log(`Description: ${process.processDescription}`);
      if (process.referenceSources) {
        console.log('References:', process.referenceSources);
      }
    });
    result.referenceSources.forEach((source, index) => {
      console.log(`${index + 1}. ${source.title}: ${source.url} ${source.content} ${source.score}`);
    });

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// 运行示例
main(); 
// npx tsx src/examples/processesListExample.ts