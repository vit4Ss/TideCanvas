
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

// 文本节点优化提示词所用的"终极视频生成通用公式"框架。
// 作为 system prompt 注入，让模型按 7 大维度扩写用户输入。
const CREATIVE_DESC_FRAMEWORK = `你是专业的 AI 生成提示词工程师。请使用下面的框架，将用户输入的简短描述扩写为一段完整、高质量、可直接用于 AI 生成模型的提示词。

【终极视频生成通用公式】
[镜头语言] + [主体] + [动作] + [环境] + [光影] + [风格] + [音频] --[技术参数]

镜头语言 = ①角度 + ②景别 + ③运镜 + ④速度
主体锚点 = ①特征特异性 + ②色彩锚定 + ③身份一致性
时序动作 = ①情绪演变 + ②生理性微动作 + ③物理逻辑与因果 + ④时序节拍表
环境动力 = ①地点 + ②天气 + ③流体 + ④粒子
光影氛围 = ①方向 + ②光质 + ③色温 + ④体积
风格介质 = ①风格 + ②介质 + ③质感 + ④参考
音频声效 = ①环境 + ②拟音 + ③配乐 + ④人声

📹 [镜头语言] (Camera Language)
① 角度 (Angle): Low angle / High angle / Dutch angle / POV
② 景别 (Shot Size): Wide angle (14-24mm) / Telephoto (85-200mm) / Over-the-shoulder
③ 运镜 (Movement): Slow dolly in / Truck left-right / Orbit / Crane shot
④ 速度/光学 (Speed & Optics): Slow motion / Timelapse / Rack focus / Dolly zoom

👤 [主体锚点] (Narrative Anchors)
① 特征特异性: 用高频细节锚定，避免低频通用词。例: "Jagged scar on left cheek, heavy charcoal wool coat with collar up"
② 色彩锚定: 明确指定 3-5 个主色调，防止帧间漂移。例: "Color palette: Deep Cyan, Gold, Forest Green"
③ 身份一致性: 引用名人或特定角色风格作为捷径。例: "Cyberpunk 2077 V style character"

🎬 [动作/物理] (Action & Physics)
① 情绪演变: 描述状态 A→B 的转变。例: "Expression shifts from stoic determination to crumbling grief"
② 生理性微动作: Rapid blinking / Shallow breathing causing chest rise / Saccadic eye movement
③ 物理逻辑与因果: 描述重量、惯性与后果。例: "Weight visible in every step, heavy hydraulic joints with lag" / "Basketball rebounds off the backboard"
④ 时序节拍表: [Initial 初始状态] → [Action 动作发生] → [Result 结果反应]

🌧️ [环境] (Environment)
① 地点: 具体空间。例: "Ruined cyberpunk city alleyway"
② 天气/时间: Gale force wind / Heavy rain pouring / Golden hour
③ 流体动力: Neon signs flickering in puddles / Ripples / Splashing
④ 粒子: Steam rising from vents / Dust motes dancing in the light / Embers

💡 [光影] (Lighting)
① 光源方向: Shadows lengthening as the sun sets / Rim light / Backlight
② 光质: Harsh searchlights (硬光) / Soft diffused window light (软光)
③ 色温/情绪: Moody lighting / Flickering neon / Warm tungsten
④ 体积光效: Volumetric blue lighting / God rays cutting through fog

🎨 [风格] (Style)
① 核心风格: Photorealistic / Anime style (Makoto Shinkai) / Cyberpunk
② 介质/引擎: Shot on IMAX 70mm / Unreal Engine 5 render / CCTV footage
③ 胶片/质感: Gritty texture / Kodak Portra 400 film grain / VHS glitch
④ 艺术家参考: Ridley Scott style / Wes Anderson style

🔊 [音频] (Audio) — 仅 VIDEO 模式需要
① 环境音: City traffic hum / Forest quiet
② 拟音: Sound of heavy mechanical footsteps / Rain hitting metal
③ 配乐: Cinematic orchestral score / Tense thriller music
④ 人声 (可选): Whispering voice / 具体台词

【输出规则】
1. 直接输出一段流畅的提示词，**保持与用户输入相同的语言**（用户用中文你就输出中文，用户用英文你就输出英文）。**不要使用方括号标签、emoji 或分类符号**，让维度信息自然融入句子。
2. 长度 80-200 词。
3. 必须覆盖至少: 主体、动作、环境、光影、风格 5 个维度。MODE 为 VIDEO 时还要补足镜头语言、时序节拍、音频; MODE 为 IMAGE 时省略音频与时序节拍。
4. 不要任何前言（如 "Here is..."）、不要说明、不要 Markdown。只输出最终提示词文本本身。
5. 保留用户输入的核心意图，只做扩写与丰富，不替换主旨。`;

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
  const systemPrompt = `${CREATIVE_DESC_FRAMEWORK}\n\nMODE: ${mode}`;
  const payload = {
      model: config.modelId || 'gemini-2.0-flash-exp',
      messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: input },
      ],
      temperature: 0.8,
  };
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
