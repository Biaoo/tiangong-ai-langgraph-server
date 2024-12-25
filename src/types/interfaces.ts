/**
 * 引用来源类型定义
 * @description 定义引用来源的基本结构
 */
export type ReferenceSource = {
  /** 引用来源的标题 */
  title: string;
  /** 引用来源的URL */
  url: string;
  /** 引用的具体内容 */
  content: string;
  /** 引用来源的相关度评分 */
  score?: number;
};

/**
 *  带有引用来源的文本描述类型
 * @description 定义一个字符串类型，该类型包含引用来源
 * @example
 *  ""
 */
export type StringWithReferenceSource = string;

/**
 * 工序类型定义
 * @description 定义单个工序的结构，包含工序名称、描述、引用来源
 */
export type UnitProcess = {
  /** 工序名称 */
  processName: string;
  /** 工序描述 */
  processDescription?: StringWithReferenceSource;
  /** 工序相关的引用来源 */
  referenceSources?: ReferenceSource[];
};

/**
 * 排放源类型定义
 * @description 定义单个排放源/排放清单的数据结构，包含排放源名称、描述、引用来源
 */
export type EmissionSource = {
  /** 排放源名称 */
  name: string;
  /** 排放源描述 */
  description?: StringWithReferenceSource;
  /** 排放源相关的引用来源 */
  referenceSources?: ReferenceSource[];
};

/**
 * 背景数据类型定义
 * @description 定义背景数据的数据结构，包含UUID、数据版本、数据集名称、数据集参考产品名称、单位、地理位置、全球变暖潜能值、数据来源URL
 */
export type BackgroundData = {
  /** 唯一标识符 */
  uuid: string;
  /** 数据版本 */
  version: string;
  /** 数据集名称 */
  processName: string;
  /** 参考产品名称 */
  referenceProductName: string;
  /** 计量单位 */
  unit: string;
  /** 地理位置 */
  location: string;
  /** 全球变暖潜能值 */
  gwp: number;
  /** 数据来源URL */
  url: string;
};

/** 相关推荐类型定义 */
export type RelatedType =
  | 'SameSupplier'
  | 'RelatedMaterial'
  | 'SimilarProduct'
  | 'Other';

/** 不确定性数据类型 */
export type Uncertainty = {
  /** 标准差 */
  std: number;
};

/** 数据验证结果类型 */
export type ValidateResult = 'valid' | 'invalid' | 'warning';

// PART 1: 信息获取/生成类接口

/** INTERFACE 1.1: GetProductBasicInformation
 * 获取产品基本信息接口
 * @description 获取产品基本信息,输入产品名称,输出产品基本信息,以及引用来源
 */
export interface GetProductBasicInformation {
  /** 请求参数 */
  request: {
    /** 目标产品名称 */
    productName: string;
  };
  /** 响应数据 */
  response: {
    /** 产品基本信息描述 */
    productBasicInformation: StringWithReferenceSource;
    /** 信息的引用来源列表 */
    referenceSources?: ReferenceSource[];
  };
}

/** INTERFACE 1.2: GetProductComponent
 * 获取产品组分信息接口
 * @description 获取产品组分信息,输入产品名称,输出产品组分信息,以及引用来源
 */
export interface GetProductComponent {
  /** 请求参数 */
  request: {
    /** 目标产品名称 */
    productName: string;
    /** 可选的供应商名称 */
    supplier?: string;
  };
  /** 响应数据 */
  response: {
    /** 产品构成的详细描述 */
    productComponent: StringWithReferenceSource;
    /** 信息的引用来源列表 */
    referenceSources?: ReferenceSource[];
  };
}

/** INTERFACE 1.3: GetRelatedSupplier
 * 获取相关供应商信息的接口
 * @description 获取相关供应商信息,输入产品名称,输出相关供应商信息,以及引用来源
 */
export interface GetRelatedSupplier {
  /** 请求参数 */
  request: {
    /** 目标产品名称 */
    productName: string;
    /** 可选的供应商名称，用于筛选相关供应商 */
    supplier?: string;
  };
  /** 响应数据 */
  response: {
    /** 相关供应商列表描述 */
    relatedSupplierList: StringWithReferenceSource[];
    /** 信息的引用来源列表 */
    referenceSources?: ReferenceSource[];
  };
}

/** INTERFACE 1.4: GetTechnologyInformation
 * 获取技术信息的接口
 * @description 获取技术信息,输入产品名称,输出技术信息,以及引用来源
 */
export interface GetTechnologyInformation {
  /** 请求参数 */
  request: {
    /** 目标产品名称 */
    /** 目标产品名称 */
    productName: string;
    /** 可选的供应商名称 */
    supplier?: string;
  };
  /** 响应数据 */
  response: {
    /** 产品相关的技术信息描述 */
    technologyInformation: StringWithReferenceSource;
    /** 信息的引用来源列表 */
    referenceSources?: ReferenceSource[];
  };
}

// 2. LCA模型构建类接口

/** INTERFACE 2.1: BuildProcessesList
 * 构建工艺流程的接口
 * @description 构建工艺流程,输入产品名称,输出工艺流程,以及引用来源
 */
export interface BuildProcessesList {
  /** 请求参数 */
  request: {
    /** 目标产品名称 */
    productName: string;
    /** 可选的供应商名称 */
    supplier?: string;
    /** 可选的产品构成信息 */
    productComponent?: StringWithReferenceSource;
    /** 可选的技术信息 */
    technologyInformation?: StringWithReferenceSource;
  };
  /** 响应数据 */
  response: {
    /** 生成的工艺流程列表 */
    processesList: UnitProcess[];
    /** 搜索结果 */
    referenceSources: ReferenceSource[];
  };
}

/** INTERFACE 2.2: GenerateEmissionSources
 * 构建排放源清单接口
 * @description 构建排放源清单,输入产品名称,输出排放源清单,以及引用来源
 */
export interface BuildEmissionSources {
  /** 请求参数 */
  request: {
    /** 目标产品名称 */
    productName: string;
    /** 可选的供应商名称 */
    supplier?: string;
    /** 可选的产品构成信息 */
    productComponent?: StringWithReferenceSource;
    /** 可选的技术信息 */
    technologyInformation?: StringWithReferenceSource;
    /** 目标工序 */
    targetUnitProcess: UnitProcess;
    /** 可选的工序列表 */
    unitProcesses?: UnitProcess[];
  };
  /** 响应数据 */
  response: {
    /** 生成的排放源列表 */
    emissionSources: EmissionSource[];
    /** 信息的引用来源列表 */
    referenceSources: ReferenceSource[];
  };
}

/** INTERFACE 2.3: MatchBackgroundData
 * 匹配背景数据接口
 * @description 匹配背景数据,输入排放源名称,输出背景数据,以及引用来源
 */
export interface MatchBackgroundData {
  /** 请求参数 */
  request: {
    /** 排放源名称 */
    emissionSourceName: string;
    /** 可选的排放源描述信息 */
    emissionSourceDescription?: StringWithReferenceSource;
  };
  /** 响应数据 */
  response: {
    /** 匹配到的背景数据 */
    backgroundData: BackgroundData;
  };
}

/** INTERFACE 2.4: RecommendSimilarLCAData
 * 推荐相似LCA数据接口
 * @description 推荐相似LCA数据,输入产品名称,输出相似的LCA数据,以及引用来源
 */
export interface RecommendSimilarLCAData {
  /** 请求参数 */
  request: {
    /** 目标产品名称 */
    productName: string;
  };
  /** 响应数据 */
  response: {
    /** 相似的LCA数据列表 */
    similarLCADatas: BackgroundData[];
  };
}

/** INTERFACE 2.5: RecommendRelatedLCAData
 * 推荐相关LCA数据接口
 * @description 推荐相关LCA数据,输入产品名称,输出相关LCA数据,以及引用来源
 */
export interface RecommendRelatedLCAData {
  /** 请求参数 */
  request: {
    /** 目标产品名称 */
    productName: string;
    /** 相关类型 */
    relatedType: RelatedType;
  };
  /** 响应数据 */
  response: {
    /** 相关LCA数据列表 */
    relatedLCADatas: BackgroundData[];
  };
}

/** INTERFACE 2.6: GenerateActivityData
 * 活动数据生成请求接口
 * @description 用于请求生成特定产品、工序和排放源的活动数据
 */
export interface GenerateActivityData {
  /** 请求参数 */
  request: {
    /** 目标产品名称 */
    productName: string;
    /** 工序名称 */
    processName: string;
    /** 排放源名称 */
    emissionSourceName: string;
    /** 可选的排放源描述信息 */
    emissionSourceDescription?: StringWithReferenceSource;
  };
  /** 响应数据 */
  response: {
    /** 生成的活动数据值 */
    activityData: number;
    /** 数据的引用来源列表 */
    referenceSources?: ReferenceSource[];
    /** 数据的不确定性信息 */
    uncertainty: Uncertainty;
  };
}

/** INTERFACE 2.7: GenerateActivityDataByHistoryData
 * 基于历史数据生成活动数据的请求接口
 * @description 返回生成的活动数据及其相关信息
 */
export type GenerateActivityDataByHistoryData = GenerateActivityData;

/** INTERFACE 2.8: GenerateActivityDataByIOTable
 * 基于投入产出表生成活动数据的请求接口
 * @description 返回生成的活动数据及其相关信息
 */
export type GenerateActivityDataByIOTable = GenerateActivityData;

// PART 3: 数据校验接口

/**
 * INTERFACE 3.1: ValidateActivityData
 * 活动数据验证请求接口
 * @description 用于验证特定产品、工序和排放源的活动数据是否合理
 */
export interface ValidateActivityData {
  /** 请求参数 */
  request: {
    /** 目标产品名称 */
    productName: string;
    /** 工序名称 */
    processName: string;
    /** 排放源名称 */
    emissionSourceName: string;
    /** 待验证的活动数据值 */
    activityData: number;
  };
  /** 响应数据 */
  response: {
    /** 验证结果 */
    validateResult: ValidateResult;
    /** 验证结果相关的建议说明 */
    advice: string;
  };
}

/** INTERFACE 3.2: ValidateGWPData
 * 全球变暖潜能值(GWP)数据验证请求接口
 * @description 用于验证特定产品的GWP值是否在合理范围内
 */
export interface ValidateGWPData {
  /** 请求参数 */
  request: {
    /** 目标产品名称 */
    productName: string;
    /** 待验证的GWP值 */
    gwp: number;
  };
  /** 响应数据 */
  response: {
    /** 验证结果 */
    validateResult: ValidateResult;
    /** 验证结果相关的建议说明 */
    advice: string;
  };
}

// PART 4: 生态设计接口
/** INTERFACE 4.1: ReductionAnalysis
 * 减排分析请求接口
 * @description 减排分析,输入LCA模型数据,输出减排分析结果
 */
export interface ReductionAnalysis {
  /** 请求参数 */
  request: {
    /** LCA模型数据 */
    lcaModel: any; // 具体类型待定
  };
  /** 响应数据 */
  response: {
    /** 减排分析结果 */
    reductionAnalysis: any; // 具体类型待定
  };
}
