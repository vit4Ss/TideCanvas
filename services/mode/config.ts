
import { EnvConfig } from "../env";
import type { ModelDef, ModelConfig } from "./types";
import { resolveProviderEndpoint } from "../providerService";

export type { ModelConfig };

const CUSTOM_MODELS_KEY = 'CUSTOM_MODEL_REGISTRY';
const DELETED_MODELS_KEY = 'DELETED_MODELS';

const loadCustomModels = (): Record<string, ModelDef> => {
    if (typeof window === 'undefined') return {};
    try {
        const stored = localStorage.getItem(CUSTOM_MODELS_KEY);
        return stored ? JSON.parse(stored) : {};
    } catch(e) { return {}; }
};

// 加载已删除的模型列表
const loadDeletedModels = (): Set<string> => {
    if (typeof window === 'undefined') return new Set();
    try {
        const stored = localStorage.getItem(DELETED_MODELS_KEY);
        return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch(e) { return new Set(); }
};

const unhideModel = (key: string): void => {
    if (typeof window === 'undefined') return;
    const deleted = loadDeletedModels();
    if (!deleted.has(key)) return;
    deleted.delete(key);
    deletedModels.delete(key);
    localStorage.setItem(DELETED_MODELS_KEY, JSON.stringify([...deleted]));
};

const customModels = loadCustomModels();
const deletedModels = loadDeletedModels();

export const MODEL_REGISTRY: Record<string, ModelDef> = {
  // --- Image Models ---
  'BananaPro': { id: 'gemini-3-pro-image-preview', name: 'Banana Pro', type: 'CHAT', category: 'IMAGE', defaultEndpoint: '/v1/chat/completions' },
  'Banana': { id: 'gemini-2.5-flash-image-preview', name: 'Banana', type: 'CHAT', category: 'IMAGE', defaultEndpoint: '/v1/chat/completions' },
  'Flux2': { id: 'flux-kontext-pro', name: 'Flux 2', type: 'IMAGE_GEN', category: 'IMAGE', defaultEndpoint: '/v1/images/generations' },
  
  '即梦 4.5': { id: 'doubao-seedream-4-5-251128', name: 'Jimeng 4.5', type: 'IMAGE_GEN', category: 'IMAGE', defaultEndpoint: '/v1/images/generations' },
  '即梦 4': { id: 'doubao-seedream-4-0-250828', name: 'Jimeng 4', type: 'IMAGE_GEN', category: 'IMAGE', defaultEndpoint: '/v1/images/generations' },
  
  'MJ': { id: 'mj_modal', name: 'Midjourney', type: 'MJ_MODAL', category: 'IMAGE', defaultEndpoint: '/mj/submit/modal' },
  'Zimage': { id: 'z-image-turbo', name: 'Qwen Zimage', type: 'IMAGE_GEN', category: 'IMAGE', defaultEndpoint: '/v1/images/generations' },

  // --- Video Models ---
  'Sora 2': { id: 'sora-2', name: 'Sora 2', type: 'VIDEO_GEN_CHAT', category: 'VIDEO', defaultEndpoint: '/v1/chat/completions' },
  'Veo 3.1 Fast': { id: 'veo3.1', name: 'Veo 3.1 Fast', type: 'VIDEO_GEN_STD', category: 'VIDEO', defaultEndpoint: '/v1/video/create', defaultQueryEndpoint: '/v1/video/query' },
  'Veo 3.1 Pro': { id: 'veo3.1-pro', name: 'Veo 3.1 Pro', type: 'VIDEO_GEN_STD', category: 'VIDEO', defaultEndpoint: '/v1/video/create', defaultQueryEndpoint: '/v1/video/query' },
  '海螺2.0': { 
      id: 'MiniMax-Hailuo-02', 
      name: 'Hailuo 2.0', 
      type: 'VIDEO_GEN_MINIMAX', 
      category: 'VIDEO', 
      defaultEndpoint: '/v1/video_generation',
      defaultQueryEndpoint: '/v1/query/video_generation',
      defaultDownloadEndpoint: '/v1/files/retrieve'
  },
  '海螺2.3': { 
      id: 'MiniMax-Hailuo-2.3', 
      name: 'Hailuo 2.3', 
      type: 'VIDEO_GEN_MINIMAX', 
      category: 'VIDEO', 
      defaultEndpoint: '/v1/video_generation',
      defaultQueryEndpoint: '/v1/query/video_generation',
      defaultDownloadEndpoint: '/v1/files/retrieve'
  },
  
  // Kling O1
  'Kling O1 Pro': { id: 'kling-omni-video', name: 'Kling O1 Pro', type: 'KLING_OMNI', category: 'VIDEO', defaultEndpoint: '/kling/v1/videos/omni-video' },
  
  '即梦 3.5': { id: 'doubao-seedance-1-5-pro', name: '即梦 3.5', type: 'VIDEO_GEN_STD', category: 'VIDEO', defaultEndpoint: '/v1/videos' },
  
  // Kling 2.5
  'Kling 2.5 Pro': { id: 'kling-v2-5-turbo', name: 'Kling 2.5 Pro', type: 'KLING', category: 'VIDEO', defaultEndpoint: '/kling/v1/videos' },

  'Wan2.6': { 
      id: 'wan2.6-i2v', 
      name: 'Qwen Wan 2.6', 
      type: 'VIDEO_GEN_STD', 
      category: 'VIDEO', 
      defaultEndpoint: '/alibailian/api/v1/services/aigc/video-generation/video-synthesis',
      defaultQueryEndpoint: '/alibailian/api/v1/tasks/{id}'
  },
  'Wan2.5': { 
      id: 'wan2.5-i2v-preview', 
      name: 'Qwen Wan 2.5', 
      type: 'VIDEO_GEN_STD', 
      category: 'VIDEO', 
      defaultEndpoint: '/alibailian/api/v1/services/aigc/video-generation/video-synthesis',
      defaultQueryEndpoint: '/alibailian/api/v1/tasks/{id}'
  },
  
  'Grok video 3': { id: 'grok-video-3', name: 'Grok Video', type: 'VIDEO_GEN_STD', category: 'VIDEO', defaultEndpoint: '/v1/video/create', defaultQueryEndpoint: '/v1/video/query' },

  // 青栀 AI Veo 系列（鉴权用裸 key 不加 Bearer，端点带 /veo 前缀；网关只代理 Veo）
  'Veo 2 (青栀)':                  { id: 'veo2',                  name: 'Veo 2 · Fast 默认',           type: 'VIDEO_GEN_STD', category: 'VIDEO', defaultEndpoint: '/veo/v1/video/create', defaultQueryEndpoint: '/veo/v1/video/query' },
  'Veo 2 Fast (青栀)':             { id: 'veo2-fast',             name: 'Veo 2 · Fast',                type: 'VIDEO_GEN_STD', category: 'VIDEO', defaultEndpoint: '/veo/v1/video/create', defaultQueryEndpoint: '/veo/v1/video/query' },
  'Veo 2 Fast Frames (青栀)':      { id: 'veo2-fast-frames',      name: 'Veo 2 · Fast 首尾帧',         type: 'VIDEO_GEN_STD', category: 'VIDEO', defaultEndpoint: '/veo/v1/video/create', defaultQueryEndpoint: '/veo/v1/video/query' },
  'Veo 2 Fast Components (青栀)':  { id: 'veo2-fast-components',  name: 'Veo 2 · Fast 多图素材合成',    type: 'VIDEO_GEN_STD', category: 'VIDEO', defaultEndpoint: '/veo/v1/video/create', defaultQueryEndpoint: '/veo/v1/video/query' },
  'Veo 2 Pro (青栀)':              { id: 'veo2-pro',              name: 'Veo 2 · Pro 高质量',          type: 'VIDEO_GEN_STD', category: 'VIDEO', defaultEndpoint: '/veo/v1/video/create', defaultQueryEndpoint: '/veo/v1/video/query' },
  'Veo 3 (青栀)':                  { id: 'veo3',                  name: 'Veo 3 · Fast 带音频',         type: 'VIDEO_GEN_STD', category: 'VIDEO', defaultEndpoint: '/veo/v1/video/create', defaultQueryEndpoint: '/veo/v1/video/query' },
  'Veo 3 Fast (青栀)':             { id: 'veo3-fast',             name: 'Veo 3 · Fast 带音频',         type: 'VIDEO_GEN_STD', category: 'VIDEO', defaultEndpoint: '/veo/v1/video/create', defaultQueryEndpoint: '/veo/v1/video/query' },
  'Veo 3 Pro (青栀)':              { id: 'veo3-pro',              name: 'Veo 3 · Pro 超高质量带音频',    type: 'VIDEO_GEN_STD', category: 'VIDEO', defaultEndpoint: '/veo/v1/video/create', defaultQueryEndpoint: '/veo/v1/video/query' },
  'Veo 3 Pro Frames (青栀)':       { id: 'veo3-pro-frames',       name: 'Veo 3 · Pro 首帧 带音频',      type: 'VIDEO_GEN_STD', category: 'VIDEO', defaultEndpoint: '/veo/v1/video/create', defaultQueryEndpoint: '/veo/v1/video/query' },
  'Veo 3.1 (青栀)':                { id: 'veo3.1',                name: 'Veo 3.1 · Fast 自适应首帧',     type: 'VIDEO_GEN_STD', category: 'VIDEO', defaultEndpoint: '/veo/v1/video/create', defaultQueryEndpoint: '/veo/v1/video/query' },
  'Veo 3.1 Pro (青栀)':            { id: 'veo3.1-pro',            name: 'Veo 3.1 · Pro 自适应首帧',     type: 'VIDEO_GEN_STD', category: 'VIDEO', defaultEndpoint: '/veo/v1/video/create', defaultQueryEndpoint: '/veo/v1/video/query' },

  // V-PAI Seedance 系列（鉴权用标准 Bearer，创建走 /task/volces/seedance，查询走 /task/{id}）
  'Seedance 1.5 全能 (V-PAI)':       { id: 'doubao-seedance-1-5-pro-251215',      name: '1.5 全能视频模型',        type: 'VIDEO_GEN_STD', category: 'VIDEO', defaultEndpoint: '/task/volces/seedance', defaultQueryEndpoint: '/task' },
  'Seedance 1.0 全能 (V-PAI)':       { id: 'doubao-seedance-1-0-pro-250528',      name: '1.0 全能视频模型',        type: 'VIDEO_GEN_STD', category: 'VIDEO', defaultEndpoint: '/task/volces/seedance', defaultQueryEndpoint: '/task' },
  'Seedance 1.0 全能 · 快速 (V-PAI)': { id: 'doubao-seedance-1-0-pro-fast-251015', name: '1.0 全能视频模型 · 快速', type: 'VIDEO_GEN_STD', category: 'VIDEO', defaultEndpoint: '/task/volces/seedance', defaultQueryEndpoint: '/task' },
  'Seedance Lite 文生 (V-PAI)':      { id: 'doubao-seedance-1-0-lite-t2v-250428', name: '文生视频模型',           type: 'VIDEO_GEN_STD', category: 'VIDEO', defaultEndpoint: '/task/volces/seedance', defaultQueryEndpoint: '/task' },
  'Seedance Lite 首尾帧 (V-PAI)':    { id: 'doubao-seedance-1-0-lite-i2v-250428', name: '首尾帧视频模型',         type: 'VIDEO_GEN_STD', category: 'VIDEO', defaultEndpoint: '/task/volces/seedance', defaultQueryEndpoint: '/task' },

  ...customModels
};

// 启动时删除已标记删除的模型
deletedModels.forEach(key => {
    delete MODEL_REGISTRY[key];
});

const getStorageKey = (modelName: string) => `API_CONFIG_MODEL_${modelName}`;

// 全局配置 Key（与 SettingsModal 保持一致）
const GLOBAL_BASE_URL_KEY = 'GLOBAL_BASE_URL';
const GLOBAL_API_KEY_KEY = 'GLOBAL_API_KEY';

// 获取全局配置
const getGlobalConfig = (): { baseUrl: string; key: string } => {
    if (typeof window === 'undefined') {
        return { baseUrl: '', key: '' };
    }
    return {
        baseUrl: localStorage.getItem(GLOBAL_BASE_URL_KEY) || '',
        key: localStorage.getItem(GLOBAL_API_KEY_KEY) || ''
    };
};

export const getModelConfig = (modelName: string): ModelConfig => {
    const def = MODEL_REGISTRY[modelName];
    const globalConfig = getGlobalConfig();
    
    if (!def) {
        return {
            baseUrl: globalConfig.baseUrl || EnvConfig.DEFAULT_BASE_URL,
            key: globalConfig.key, 
            modelId: '',
            endpoint: '/v1/chat/completions'
        };
    }

    if (typeof window !== 'undefined') {
        const stored = localStorage.getItem(getStorageKey(modelName));
        if (stored) {
            const parsed = JSON.parse(stored);
            
            // 自动更新过时的 endpoint
            let endpoint = parsed.endpoint;
            let queryEndpoint = parsed.queryEndpoint;
            let downloadEndpoint = parsed.downloadEndpoint;
            
            // 如果当前 endpoint 是旧的 chat completions，更新为新的 video create
            if (endpoint === '/v1/chat/completions' && def.type === 'VIDEO_GEN_STD') {
                endpoint = def.defaultEndpoint;
                queryEndpoint = def.defaultQueryEndpoint || '';
                downloadEndpoint = def.defaultDownloadEndpoint || '';
                
                // 保存更新后的配置
                saveModelConfig(modelName, {
                    ...parsed,
                    endpoint,
                    queryEndpoint,
                    downloadEndpoint
                });
            }
            
            // 解析服务商回退（优先级：模型特定 > 服务商 > 全局 > 默认）
            const providerEndpoint = parsed.providerId ? resolveProviderEndpoint(parsed.providerId) : null;

            return {
                baseUrl: parsed.baseUrl || providerEndpoint?.baseUrl || globalConfig.baseUrl || EnvConfig.DEFAULT_BASE_URL,
                key: parsed.key || providerEndpoint?.key || globalConfig.key || '',
                modelId: parsed.modelId || def.id,
                endpoint: endpoint || def.defaultEndpoint,
                queryEndpoint: queryEndpoint || def.defaultQueryEndpoint || '',
                downloadEndpoint: downloadEndpoint || def.defaultDownloadEndpoint || '',
                providerId: parsed.providerId,
            };
        }
    }

    // 没有模型特定配置时，使用全局配置
    return {
        baseUrl: globalConfig.baseUrl || EnvConfig.DEFAULT_BASE_URL,
        key: globalConfig.key || '', 
        modelId: def.id,
        endpoint: def.defaultEndpoint,
        queryEndpoint: def.defaultQueryEndpoint || '',
        downloadEndpoint: def.defaultDownloadEndpoint || ''
    };
};

export const saveModelConfig = (modelName: string, config: ModelConfig) => {
    localStorage.setItem(getStorageKey(modelName), JSON.stringify(config));
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('modelConfigUpdated', { detail: { modelName } }));
    }
};

export const registerCustomModel = (key: string, def: ModelDef) => {
    MODEL_REGISTRY[key] = def;
    const current = loadCustomModels();
    current[key] = def;
    localStorage.setItem(CUSTOM_MODELS_KEY, JSON.stringify(current));
    // 如果之前隐藏过，取消隐藏
    unhideModel(key);
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('modelRegistryUpdated'));
    }
};

// 删除模型（任意模型都可删除）
export const deleteModel = (key: string): boolean => {
    if (!MODEL_REGISTRY[key]) return false;
    
    // 从 MODEL_REGISTRY 中删除
    delete MODEL_REGISTRY[key];
    
    // 如果是自定义模型，从自定义模型存储中删除
    const customModels = loadCustomModels();
    if (customModels[key]) {
        delete customModels[key];
        localStorage.setItem(CUSTOM_MODELS_KEY, JSON.stringify(customModels));
    }
    
    // 记录已删除的内置模型
    const deleted = loadDeletedModels();
    deleted.add(key);
    localStorage.setItem(DELETED_MODELS_KEY, JSON.stringify([...deleted]));
    deletedModels.add(key);
    
    // 删除该模型的配置
    localStorage.removeItem(`API_CONFIG_MODEL_${key}`);
    
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('modelRegistryUpdated'));
    }
    return true;
};

// 检查是否是自定义模型
export const isCustomModel = (key: string): boolean => {
    const customModels = loadCustomModels();
    return !!customModels[key];
};

// 获取可见的模型列表（用于下拉框）
export const getVisibleModels = (): string[] => {
    return Object.keys(MODEL_REGISTRY);
};
