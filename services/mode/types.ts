
export type StrategyType = 
  | 'CHAT' 
  | 'IMAGE_GEN' 
  | 'AUDIO'
  | 'BANANA_EDIT_ASYNC' 
  | 'VIDEO_GEN_MINIMAX' 
  | 'VIDEO_GEN_STD' 
  | 'VIDEO_GEN_CHAT'
  | 'VIDEO_GEN_FORM' 
  | 'KLING' 
  | 'KLING_OMNI'
  | 'MJ_MODAL' 
  | 'MJ_ACTION';

export type ModelCategory = 'TEXT' | 'IMAGE' | 'AUDIO' | 'VIDEO';

export interface ModelDef {
  id: string; 
  name: string; 
  type: StrategyType;
  category: ModelCategory;
  defaultEndpoint: string;
  defaultQueryEndpoint?: string; 
  defaultDownloadEndpoint?: string; 
}

export interface ModelConfig {
    baseUrl: string;
    key: string;
    modelId: string;
    endpoint: string;
    queryEndpoint?: string;
    downloadEndpoint?: string;
    providerId?: string;
}

export interface ImageModelRules {
    resolutions: string[];
    ratios: string[];
    supportsEdit?: boolean;
    hasPromptExtend?: boolean;
}

export interface VideoModelRules {
    resolutions: string[];
    durations: string[];
    ratios: string[];
    maxInputImages: number;
    hasPromptExtend?: boolean;
}

export interface VideoConstraints {
    resOptions: string[];
    disabledRes: string[];
    disabledRatios: string[];
    disabledDurations: string[];
}

export interface IModelHandler<R> {
    rules: R;
    generate: (config: ModelConfig, prompt: string, params: any) => Promise<string | string[]>;
}
