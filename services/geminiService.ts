
import { MODEL_REGISTRY, getModelConfig, saveModelConfig, registerCustomModel, deleteModel, isCustomModel, getVisibleModels } from "./mode/config";
import type { ModelConfig } from "./mode/config";
import { IMAGE_HANDLERS, BananaHandler, BananaProHandler, Flux2Handler, Jimeng45Handler, MJHandler, ZimageHandler, QwenEditHandler, GptImageHandler } from "./mode/image/configurations";
import { VIDEO_HANDLERS, Sora2Handler, GenericVideoHandler } from "./mode/video/configurations";
import { constructUrl, fetchThirdParty } from "./mode/network";
import { getPrimaryModelServiceBinding } from "./modelService";

// 枚举槽 -> 处理器映射。基于 registryKey 的 slot 名称片段路由到对应的 handler，
// 否则所有枚举图像槽都会落到 Flux2Handler，把图片塞进 /v1/images/generations 的 payload.image
// 字段，而该端点根本不识别该字段，导致上游图被静默丢弃。
const resolveImageHandlerForEnumSlot = (registryKey: string): any | null => {
    if (typeof registryKey !== 'string' || !registryKey.startsWith('枚举/IMAGE/')) return null;
    const slotName = registryKey.replace('枚举/IMAGE/', '').toLowerCase();
    if (slotName.includes('nano banana') || slotName.includes('banana')) return BananaProHandler;
    if (slotName.includes('gpt image') || slotName.includes('gpt-image')) return GptImageHandler;
    if (slotName.includes('seedream')) return Jimeng45Handler;
    if (slotName.includes('midjourney') || slotName === 'mj') return MJHandler;
    if (slotName.includes('zimage') || slotName.includes('z-image')) return ZimageHandler;
    if (slotName.includes('qwen')) return QwenEditHandler;
    if (slotName.includes('flux')) return Flux2Handler;
    return null;
};

// Re-export for UI
export { MODEL_REGISTRY, getModelConfig, saveModelConfig, registerCustomModel, deleteModel, isCustomModel, getVisibleModels };
export type { ModelConfig };

// --- Generators ---

export const generateCreativeDescription = async (input: string, mode: 'IMAGE' | 'VIDEO', registryKey?: string): Promise<string> => {
  // 优先级：节点上选的具体 TEXT 模型 registryKey → 首个 TEXT 绑定 → 兜底 BananaPro
  let config: ModelConfig | null = null;
  if (registryKey && registryKey.startsWith('枚举/TEXT/')) {
      config = getModelConfig(registryKey);
      console.log('[CreativeDesc] using node-selected model', { registryKey, modelId: config?.modelId, hasKey: !!config?.key, baseUrl: config?.baseUrl, endpoint: config?.endpoint });
  }
  if (!config || !config.key) {
      const textBinding = getPrimaryModelServiceBinding('TEXT');
      config = textBinding?.registryKey
          ? getModelConfig(textBinding.registryKey)
          : textBinding
          ? { ...getModelConfig('BananaPro'), providerId: textBinding.providerId, modelId: textBinding.modelId }
          : getModelConfig('BananaPro');
      console.log('[CreativeDesc] fallback to primary TEXT binding', { hasKey: !!config?.key, baseUrl: config?.baseUrl, modelId: config?.modelId });
  }
  if (!config.key) {
      throw new Error('未配置可用的文本模型 API Key。请在「服务商」中填入 API Key，或在「模型管理 → 配置」中给该模型补上 Key。');
  }
  const prompt = `Optimize this ${mode.toLowerCase()} description for professional AI generation. Input: "${input}". Provide ONLY the optimized prompt text.`;
  const payload = { model: config.modelId || 'gemini-2.0-flash-exp', messages: [{ role: 'user', content: prompt }] };
  const endpoint = config.endpoint || '/v1/chat/completions';
  const url = constructUrl(config.baseUrl, endpoint);
  console.log('[CreativeDesc] POST', url, 'model:', payload.model);
  const res = await fetchThirdParty(url, 'POST', payload, config);
  const content = res?.choices?.[0]?.message?.content
      ?? res?.choices?.[0]?.text
      ?? res?.content?.[0]?.text                  // Anthropic 风格
      ?? res?.candidates?.[0]?.content?.parts?.[0]?.text;  // Gemini 原生
  if (!content) {
      console.warn('[CreativeDesc] response had no recognizable content field', res);
      throw new Error('接口返回格式无法解析。请确认所选模型的接口兼容 /v1/chat/completions。');
  }
  return content;
};

export const generateImage = async (
    prompt: string, 
    aspectRatio: string = "1:1", 
    modelName: string = "BananaPro", 
    resolution: string = "1k", 
    count: number = 1,
    inputImages: string[] = [],
    promptOptimize: boolean = false
): Promise<string[]> => {
  let handler = IMAGE_HANDLERS[modelName];

  // 优先级 1：直接匹配旧版固定 key（'BananaPro' / 'Flux2' / ...）
  // 优先级 2：当传入的是枚举槽 registryKey（如 "枚举/IMAGE/GPT Image 2"），按槽名解析处理器
  if (!handler) handler = resolveImageHandlerForEnumSlot(modelName);

  // 优先级 3：自定义模型按 registry def.type 兜底
  if (!handler) {
      const def = MODEL_REGISTRY[modelName];
      if (def) {
          if (def.type === 'CHAT') handler = BananaHandler;
          else handler = Flux2Handler; // Default to Generic Image Gen
      }
  }

  if (!handler) handler = IMAGE_HANDLERS['BananaPro'];

  const config = getModelConfig(modelName);
  
  // Debug: Log image generation parameters
  console.log(`[Image Gen] Model: ${modelName}, Input Images: ${inputImages.length}, Prompt Optimize: ${promptOptimize}`);
  
  try {
      const result = await handler.generate(config, prompt, { aspectRatio, resolution, inputImages, count, promptOptimize });
      return Array.isArray(result) ? result : [result];
  } catch (e) {
    console.error(`Error generating image with ${modelName}`, e);
    throw e;
  }
};

export const generateVideo = async (
    prompt: string, 
    inputImages: string[] = [], 
    aspectRatio: string = "16:9", 
    modelName: string = "Sora2", 
    resolution: string = "720p", 
    duration: string = "5s",
    count: number = 1,
    promptOptimize: boolean = false
): Promise<string[]> => {
    let realModelName = modelName;
    const isStartEndMode = modelName.endsWith('_FL');
    if (isStartEndMode) realModelName = modelName.replace('_FL', '');

    let handler = VIDEO_HANDLERS[realModelName];
    
    // Fallback for custom models
    if (!handler) {
        const def = MODEL_REGISTRY[realModelName];
        if (def) {
            if (def.type === 'VIDEO_GEN_CHAT') handler = Sora2Handler;
            else handler = GenericVideoHandler;
        }
    }

    if (!handler) handler = VIDEO_HANDLERS['Sora 2'];

    const config = getModelConfig(realModelName);
    
    // Debug: Log video generation parameters
    console.log(`[Video Gen] Model: ${realModelName}, Input Images: ${inputImages.length}, Start-End Mode: ${isStartEndMode}, Prompt Optimize: ${promptOptimize}`);
    console.log(`[Video Gen] Config:`, { baseUrl: config.baseUrl, endpoint: config.endpoint, queryEndpoint: config.queryEndpoint, modelId: config.modelId, hasKey: !!config.key });
    
    try {
        const result = await handler.generate(config, prompt, { 
            aspectRatio, resolution, duration, inputImages, isStartEndMode, count, promptOptimize 
        });
        return Array.isArray(result) ? result : [result];
    } catch (e) {
        console.error(`Error generating video with ${modelName}`, e);
        throw e;
    }
};
