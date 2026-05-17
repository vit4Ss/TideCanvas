
import type { VideoModelRules, ModelConfig } from "../types";
import { generateGenericVideo, generateVeo3Video, generateGrokVideo, generateSoraVideo, generateQingzhiVeoVideo } from "./veo";
import { generateMinimaxVideo } from "./minimax";
import { generateSeedanceVideo } from "./seedance";
import { generateKlingO1Video, generateKlingStandardVideo } from "./kling";
import { generateAlibailianVideo } from "./alibailian";
import { generateVPaiSeedanceVideo } from "./vpai";
import { fetchThirdParty, constructUrl } from "../network";

// --- Base Rules ---
const BASE_RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9'];
const EXTENDED_RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9', '21:9', '9:21'];
const DURATIONS_STD = ['5s', '10s'];
const RESOLUTIONS_STD = ['720p', '1080p'];

// --- Helper for Chat-based Video (Doubao/KlingO1) ---
const generateChatVideo = async (config: ModelConfig, prompt: string) => {
    const messages = [{ role: 'user', content: `Generate a video: ${prompt}` }];
    const payload = { model: config.modelId, messages, stream: false };
    const url = constructUrl(config.baseUrl, config.endpoint);
    const res = await fetchThirdParty(url, 'POST', payload, config, { timeout: 600000 });
    return res.choices?.[0]?.message?.content;
};

// --- Model Specific Implementations ---

export const Sora2Handler = {
    rules: { resolutions: ['720p', '1080p'], durations: ['4s', '8s', '12s'], ratios: ['16:9', '9:16'], maxInputImages: 2 },
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        const { inputImages = [], aspectRatio = '16:9', resolution = '720p', duration = '8s' } = params;
        
        // 映射 duration 到 Sora 的参数格式
        const durationMap: Record<string, string> = { '4s': '4', '8s': '8', '12s': '12' };
        const durationValue = durationMap[duration] || '8';
        
        // 映射分辨率到 Sora 的 size 参数
        const sizeMap: Record<string, string> = {
            '16:9-720p': '1280x720',
            '16:9-1080p': '1792x1024',
            '9:16-720p': '720x1280',
            '9:16-1080p': '1024x1792'
        };
        const sizeKey = `${aspectRatio}-${resolution}`;
        const sizeValue = sizeMap[sizeKey] || '1280x720';
        
        const messages: any[] = [];
        
        if (inputImages.length > 0) {
            const content: any[] = [];
            
            // 添加提示词
            content.push({ type: 'text', text: prompt || 'Generate a video from these images' });
            
            // 添加图片
            inputImages.forEach((img: string) => {
                content.push({ type: 'image_url', image_url: { url: img } });
            });
            messages.push({ role: 'user', content });
        } else {
            const effectivePrompt = prompt || 'Generate a video';
            messages.push({ role: 'user', content: effectivePrompt });
        }
        
        // 将参数放在 payload 的顶层
        const payload: any = { 
            model: cfg.modelId, 
            messages, 
            stream: false,
            duration: durationValue,
            size: sizeValue,
            images: inputImages.length > 0 ? inputImages : undefined
        };
        
        const url = constructUrl(cfg.baseUrl, cfg.endpoint);
        console.log('[Sora 2] Request URL:', url);
        console.log('[Sora 2] Duration input:', duration, '=> Duration value:', durationValue);
        console.log('[Sora 2] Size key:', sizeKey, '=> Size value:', sizeValue);
        console.log('[Sora 2] Payload:', JSON.stringify(payload, null, 2));
        
        const res = await fetchThirdParty(url, 'POST', payload, cfg, { timeout: 600000 });
        
        console.log('[Sora 2] Response:', JSON.stringify(res, null, 2));
        
        const content = res.choices?.[0]?.message?.content;
        if (!content) {
            console.error('[Sora 2] No content in response:', res);
            throw new Error('No video URL returned from Sora 2');
        }
        
        return content;
    }
};

export const VeoFastHandler = {
    rules: { resolutions: ['720p', '1080p'], durations: ['8s'], ratios: ['16:9', '9:16'], maxInputImages: 3 },
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        let modelId = 'veo3.1'; // Default Text-to-Video (Fast Mode)
        let images = params.inputImages || [];

        // Logic for Veo 3.1 Fast:
        // Text-to-Video -> veo3.1
        // Image-to-Video -> veo3.1-fast-components
        
        if (images.length > 0) {
             modelId = 'veo3.1-fast-components';
        }

        // Enforce max 3 images
        if (images.length > 3) {
            images = images.slice(0, 3);
        }

        // 使用用户配置的 endpoint，如果是默认值才使用 /v1/video/create
        const endpoint = cfg.endpoint && cfg.endpoint !== '/v1/video/create' ? cfg.endpoint : '/v1/video/create';
        const newCfg = { ...cfg, modelId, endpoint };
        return await generateVeo3Video(newCfg, prompt, params.aspectRatio, images);
    }
};

export const VeoProHandler = {
    rules: { resolutions: ['720p', '1080p'], durations: ['8s'], ratios: ['16:9', '9:16'], maxInputImages: 1 },
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        let modelId = 'veo3.1-pro'; // Default Text-to-Video (Pro Mode)
        let images = params.inputImages || [];

        // Logic for Veo 3.1 Pro:
        // Text-to-Video -> veo3.1-pro
        // Image-to-Video -> veo3.1-components
        
        if (images.length > 0) {
            modelId = 'veo3.1-components';
            // Enforce max 1 image
            if (images.length > 1) {
                images = [images[0]];
            }
        }

        // 使用用户配置的 endpoint，如果是默认值才使用 /v1/video/create
        const endpoint = cfg.endpoint && cfg.endpoint !== '/v1/video/create' ? cfg.endpoint : '/v1/video/create';
        const newCfg = { ...cfg, modelId, endpoint };
        return await generateVeo3Video(newCfg, prompt, params.aspectRatio, images);
    }
};

export const HailuoHandler = {
    rules: { resolutions: ['768p', '1080p'], durations: ['6s'], ratios: ['16:9', '9:16', '1:1'], maxInputImages: 2, hasPromptExtend: true },
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        return await generateMinimaxVideo(cfg, prompt, params.aspectRatio, params.inputImages, params.isStartEndMode, params.promptOptimize);
    }
};

export const KlingO1Handler = {
    rules: { resolutions: ['1080p'], durations: ['5s', '10s'], ratios: ['16:9', '9:16', '1:1'], maxInputImages: 2 },
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        return await generateKlingO1Video(cfg, params.modelName || 'Kling O1 Std', prompt, params.aspectRatio, params.resolution, params.duration, params.inputImages, params.isStartEndMode);
    }
};

export const KlingO1StdHandler = {
     ...KlingO1Handler,
     generate: async (cfg: ModelConfig, prompt: string, params: any) => {
         return await generateKlingO1Video(cfg, 'Kling O1 Std', prompt, params.aspectRatio, params.resolution, params.duration, params.inputImages, params.isStartEndMode);
     }
};

export const KlingO1ProHandler = {
     ...KlingO1Handler,
     generate: async (cfg: ModelConfig, prompt: string, params: any) => {
         return await generateKlingO1Video(cfg, 'Kling O1 Pro', prompt, params.aspectRatio, params.resolution, params.duration, params.inputImages, params.isStartEndMode);
     }
};

export const KlingStandardHandler = {
    rules: { resolutions: ['720p', '1080p'], durations: ['5s', '10s'], ratios: ['16:9', '9:16'], maxInputImages: 2 },
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
         // Fallback default
         return await generateKlingStandardVideo(cfg, 'Kling 2.5 Std', prompt, params.aspectRatio, params.duration, params.inputImages, params.isStartEndMode);
    }
};

export const Kling25StdHandler = {
    ...KlingStandardHandler,
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        return await generateKlingStandardVideo(cfg, 'Kling 2.5 Std', prompt, params.aspectRatio, params.duration, params.inputImages, params.isStartEndMode);
    }
};

export const Kling25ProHandler = {
    ...KlingStandardHandler,
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        return await generateKlingStandardVideo(cfg, 'Kling 2.5 Pro', prompt, params.aspectRatio, params.duration, params.inputImages, params.isStartEndMode);
    }
};

export const Kling26ProNSHandler = {
    ...KlingStandardHandler,
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        return await generateKlingStandardVideo(cfg, 'Kling 2.6 ProNS', prompt, params.aspectRatio, params.duration, params.inputImages, params.isStartEndMode);
    }
};

export const Kling26ProYSHandler = {
    ...KlingStandardHandler,
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        return await generateKlingStandardVideo(cfg, 'Kling 2.6 ProYS', prompt, params.aspectRatio, params.duration, params.inputImages, params.isStartEndMode);
    }
};


export const SeedanceHandler = {
    rules: { resolutions: ['480p', '720p', '1080p'], durations: ['5s', '7s', '10s'], ratios: EXTENDED_RATIOS, maxInputImages: 2 },
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        return await generateSeedanceVideo(cfg, prompt, params.aspectRatio, params.resolution, params.duration, params.inputImages, params.isStartEndMode);
    }
};

export const WanHandler = {
    rules: { resolutions: ['720p', '1080p'], durations: ['5s', '10s'], ratios: BASE_RATIOS, maxInputImages: 1 },
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        return await generateAlibailianVideo(cfg, prompt, params.resolution, params.duration, params.inputImages);
    }
};

export const Grok3Handler = {
    rules: { resolutions: ['720p'], durations: ['6s'], ratios: ['1:1', '3:2', '2:3'], maxInputImages: 1 },
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        return await generateGrokVideo(cfg, prompt, params.aspectRatio, params.resolution, params.inputImages);
    }
};

export const GenericVideoHandler = {
    rules: { resolutions: RESOLUTIONS_STD, durations: DURATIONS_STD, ratios: EXTENDED_RATIOS, maxInputImages: 2 },
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        return await generateGenericVideo(
            cfg,
            { id: cfg.modelId, name: cfg.modelId, type: 'VIDEO_GEN_STD', category: 'VIDEO', defaultEndpoint: cfg.endpoint },
            cfg.modelId,
            prompt,
            params.aspectRatio,
            params.resolution,
            params.duration,
            params.inputImages || [],
            params.isStartEndMode
        );
    }
};

// === V-PAI Seedance Handler（5 个模型共用，cfg.modelId 决定具体型号）===
// API 不暴露 size/duration/aspectRatio 入参，由模型自适应
export const VPaiSeedanceHandler = {
    rules: { resolutions: ['480p', '720p', '1080p'], durations: ['5s', '10s'], ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'], maxInputImages: 2 },
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        // 暂固定参数：--ratio adaptive --dur 4（忽略 UI 选项）
        return await generateVPaiSeedanceVideo(
            cfg,
            prompt,
            params.inputImages || [],
            !!params.isStartEndMode,
            'adaptive',     // aspectRatio
            undefined,      // resolution（不拼 --rs）
            '4',            // duration
        );
    }
};

// === 青栀 AI 视频生成 Handler（共用，cfg.modelId 决定具体走哪个 Veo 变体）===
// 端点：POST /veo/v1/video/create  +  GET /veo/v1/video/query
// 鉴权：Authorization 头放裸 key（不要 Bearer）
// payload 字段：{ prompt, model, enhance_prompt, images, aspect_ratio }
export const QingzhiVeoHandler = {
    rules: { resolutions: ['720p', '1080p'], durations: ['8s'], ratios: ['16:9', '9:16'], maxInputImages: 3 },
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        // modelId 已经由 MODEL_REGISTRY 里登记的 id 字段决定（veo2 / veo2-fast / veo3-pro 等）
        return await generateQingzhiVeoVideo(cfg, prompt, params.aspectRatio, params.inputImages || []);
    }
};

export const VIDEO_HANDLERS: Record<string, any> = {
    '__GENERIC__': GenericVideoHandler,
    'Sora 2': Sora2Handler,
    'Veo 3.1 Fast': VeoFastHandler,
    'Veo 3.1 Pro': VeoProHandler,
    '海螺2.0': HailuoHandler,
    '海螺2.3': HailuoHandler,

    // Kling O1
    'Kling O1 Std': KlingO1StdHandler,
    'Kling O1 Pro': KlingO1ProHandler,

    // Kling 2.5
    'Kling 2.5 Std': Kling25StdHandler,
    'Kling 2.5 Pro': Kling25ProHandler,

    // Kling 2.6
    'Kling 2.6 ProNS': Kling26ProNSHandler,
    'Kling 2.6 ProYS': Kling26ProYSHandler,

    '即梦 3.5': SeedanceHandler,

    'Wan2.6': WanHandler,
    'Wan2.5': WanHandler,

    'Grok video 3': Grok3Handler,

    // 青栀 AI Veo 系列（11 个变体共用一个 handler，由 modelId 区分）
    'Veo 2 (青栀)':                  QingzhiVeoHandler,
    'Veo 2 Fast (青栀)':             QingzhiVeoHandler,
    'Veo 2 Fast Frames (青栀)':      QingzhiVeoHandler,
    'Veo 2 Fast Components (青栀)':  QingzhiVeoHandler,
    'Veo 2 Pro (青栀)':              QingzhiVeoHandler,
    'Veo 3 (青栀)':                  QingzhiVeoHandler,
    'Veo 3 Fast (青栀)':             QingzhiVeoHandler,
    'Veo 3 Pro (青栀)':              QingzhiVeoHandler,
    'Veo 3 Pro Frames (青栀)':       QingzhiVeoHandler,
    'Veo 3.1 (青栀)':                QingzhiVeoHandler,
    'Veo 3.1 Pro (青栀)':            QingzhiVeoHandler,

    // V-PAI Seedance 系列（5 个模型共用一个 handler，由 modelId 区分）
    'Seedance 1.5 全能 (V-PAI)':         VPaiSeedanceHandler,
    'Seedance 1.0 全能 (V-PAI)':         VPaiSeedanceHandler,
    'Seedance 1.0 全能 · 快速 (V-PAI)':   VPaiSeedanceHandler,
    'Seedance Lite 文生 (V-PAI)':        VPaiSeedanceHandler,
    'Seedance Lite 首尾帧 (V-PAI)':      VPaiSeedanceHandler,
};
