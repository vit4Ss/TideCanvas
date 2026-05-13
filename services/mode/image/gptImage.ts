
import type { ModelConfig } from "../types";
import { constructUrl, fetchThirdParty, extractUrlFromContent } from "../network";

// 从 data URL 或 http URL 抓取为 File，便于 multipart 上传
const fetchAsFile = async (src: string, filename: string): Promise<File> => {
    const res = await fetch(src);
    const blob = await res.blob();
    const type = blob.type || 'image/png';
    return new File([blob], filename, { type });
};

// 把 OpenAI Images API 通常允许的尺寸做一次最近邻映射
const mapToGptImageSize = (aspectRatio: string, resolution: string): string => {
    const wantsLandscape = aspectRatio === '16:9' || aspectRatio === '4:3' || aspectRatio === '21:9';
    const wantsPortrait = aspectRatio === '9:16' || aspectRatio === '3:4' || aspectRatio === '9:21';
    if (wantsLandscape) return '1536x1024';
    if (wantsPortrait) return '1024x1536';
    return '1024x1024';
};

const mapQuality = (resolution: string): string => {
    if (resolution === '4k') return 'high';
    if (resolution === '2k') return 'high';
    return 'medium';
};

// 从各种代理的返回结构里提取图片 URL/base64
const extractImagesFromResponse = (res: any): string[] => {
    const results: string[] = [];
    const pushIfImage = (item: any) => {
        if (!item) return;
        if (typeof item === 'string') {
            const url = extractUrlFromContent(item);
            if (url) results.push(url);
            return;
        }
        if (item.b64_json) results.push(`data:image/png;base64,${item.b64_json}`);
        else if (item.url) results.push(item.url);
        else if (item.image_url) results.push(typeof item.image_url === 'string' ? item.image_url : item.image_url.url);
    };

    if (Array.isArray(res?.data)) res.data.forEach(pushIfImage);
    else if (res?.data) pushIfImage(res.data);

    if (results.length === 0 && Array.isArray(res?.images)) res.images.forEach(pushIfImage);

    if (results.length === 0 && res?.choices?.[0]?.message) {
        const msg = res.choices[0].message;
        if (typeof msg.content === 'string') {
            const url = extractUrlFromContent(msg.content);
            if (url) results.push(url);
        } else if (Array.isArray(msg.content)) {
            msg.content.forEach((c: any) => {
                if (c?.type === 'image_url' && c.image_url?.url) results.push(c.image_url.url);
                else if (c?.image?.url) results.push(c.image.url);
                else if (c?.b64_json) results.push(`data:image/png;base64,${c.b64_json}`);
                else if (typeof c?.text === 'string') {
                    const url = extractUrlFromContent(c.text);
                    if (url) results.push(url);
                }
            });
        }
    }

    if (results.length === 0 && Array.isArray(res?.candidates)) {
        for (const candidate of res.candidates) {
            const parts = candidate?.content?.parts || [];
            for (const part of parts) {
                if (part?.inlineData) results.push(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
                else if (part?.text) {
                    const url = extractUrlFromContent(part.text);
                    if (url) results.push(url);
                }
            }
        }
    }

    return results;
};

// 把上游图片们打包进 chat/completions 多模态消息，并在顶层冗余放置常见图像字段，
// 兼容那些不识别 message content 数组但读取顶层 image_url 的代理。
const buildChatMultimodalPayload = (
    config: ModelConfig,
    prompt: string,
    aspectRatio: string,
    resolution: string,
    inputImages: string[]
) => {
    const refHint = inputImages.length > 1 ? `这 ${inputImages.length} 张参考图片` : '这张参考图片';
    const text = `请根据${refHint}进行创作。要求：${prompt || '保持原图主体并按描述生成'}。输出比例：${aspectRatio}，分辨率档位：${resolution.toUpperCase()}。`;

    // 图片优先放在前面，更多模型尤其国产代理对这个顺序更友好
    const content: any[] = [];
    for (const img of inputImages) {
        if (img) content.push({ type: 'image_url', image_url: { url: img } });
    }
    content.push({ type: 'text', text });

    const primary = inputImages[0];
    return {
        model: config.modelId,
        messages: [{ role: 'user', content }],
        response_format: { type: 'image' },
        // 顶层冗余字段
        image: primary,
        image_url: primary,
        images: [...inputImages],
        image_urls: [...inputImages],
        reference_image: primary,
        input_image: primary,
        aspect_ratio: aspectRatio,
        size: mapToGptImageSize(aspectRatio, resolution),
    };
};

export const generateGptImage = async (
    config: ModelConfig,
    prompt: string,
    aspectRatio: string,
    resolution: string,
    inputImages: string[],
    n: number = 1
): Promise<string[]> => {
    const hasInput = inputImages.length > 0;
    const size = mapToGptImageSize(aspectRatio, resolution);
    const quality = mapQuality(resolution);
    const safePrompt = prompt || (hasInput ? '请保留参考图主体与风格，按上下文生成新图' : '生成一张高质量图片');

    if (hasInput) {
        // === 路径 1：OpenAI Images Edits multipart（GPT Image 系列官方图生图路径）===
        try {
            const editsUrl = constructUrl(config.baseUrl, '/v1/images/edits');
            const form = new FormData();
            form.append('model', config.modelId);
            form.append('prompt', safePrompt);
            form.append('size', size);
            form.append('quality', quality);
            form.append('n', String(n));
            for (let i = 0; i < inputImages.length; i++) {
                const file = await fetchAsFile(inputImages[i], `reference_${i}.png`);
                // 同时提供单数 image 与数组 image[]，覆盖不同代理实现
                if (i === 0) form.append('image', file);
                form.append('image[]', file);
            }
            console.log(`[GPTImage] Trying /v1/images/edits multipart with ${inputImages.length} ref image(s)`);
            const res = await fetchThirdParty(editsUrl, 'POST', form, config, { timeout: 200000, isFormData: true });
            const urls = extractImagesFromResponse(res);
            if (urls.length > 0) return urls;
            console.warn('[GPTImage] /v1/images/edits returned no images, falling back to chat multimodal');
        } catch (err: any) {
            console.warn('[GPTImage] /v1/images/edits failed, fallback to chat multimodal:', err?.message || err);
        }

        // === 路径 2：/v1/chat/completions 多模态（Nano-Banana 类聊天图像接口）===
        const chatUrl = constructUrl(config.baseUrl, '/v1/chat/completions');
        const payload = buildChatMultimodalPayload(config, safePrompt, aspectRatio, resolution, inputImages);
        console.log('[GPTImage] Falling back to /v1/chat/completions multimodal');
        const res = await fetchThirdParty(chatUrl, 'POST', payload, config, { timeout: 200000 });
        const urls = extractImagesFromResponse(res);
        if (urls.length === 0) throw new Error('GPT Image 生成成功但未返回图片，可能是代理不支持该模型的图生图');
        return urls;
    }

    // === 纯文生图：/v1/images/generations ===
    const genUrl = constructUrl(config.baseUrl, '/v1/images/generations');
    const payload: any = {
        model: config.modelId,
        prompt: safePrompt,
        size,
        quality,
        n,
        response_format: 'b64_json',
    };
    console.log('[GPTImage] Text-to-image via /v1/images/generations');
    const res = await fetchThirdParty(genUrl, 'POST', payload, config, { timeout: 200000 });
    const urls = extractImagesFromResponse(res);
    if (urls.length === 0) throw new Error('GPT Image 文生图未返回结果');
    return urls;
};
