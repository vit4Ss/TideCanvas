
import type { ModelConfig, ModelDef } from "../types";
import { fetchThirdParty, constructUrl } from "../network";

export const generateGenericVideo = async (
    config: ModelConfig,
    modelDef: ModelDef,
    modelName: string,
    prompt: string,
    aspectRatio: string,
    resolution: string,
    duration: string,
    inputImages: string[],
    isStartEndMode: boolean
): Promise<string> => {
     const targetUrl = constructUrl(config.baseUrl, config.endpoint);
     const payload: any = {
         model: config.modelId,
         prompt: prompt,
         aspect_ratio: aspectRatio,
         resolution: resolution,
         duration: duration,
     };
     
     if (inputImages.length > 0) {
         if (isStartEndMode) {
              payload.image_url = inputImages[0];
              if (inputImages.length > 1) {
                 payload.last_frame_image = inputImages[inputImages.length - 1];
                 payload.tail_image = inputImages[inputImages.length - 1];
              }
         } else {
              payload.image_url = inputImages[0];
         }
         
         payload.image_urls = inputImages; 

         if (modelDef.type === 'KLING') {
             payload.src_image = inputImages[0];
             if (isStartEndMode && inputImages.length > 1) {
                payload.tail_image = inputImages[inputImages.length - 1]; 
             }
         }
     }

     if (modelName.includes('Veo') || modelName.includes('Sora')) {
          payload.quality = resolution;
          if (duration) payload.seconds = parseInt(duration);
     }

     const res = await fetchThirdParty(targetUrl, 'POST', payload, config, { timeout: 900000, retries: 3 });
     
     if (res.url || res.data?.[0]?.url || res.data?.url) {
         return res.url || res.data?.[0]?.url || res.data?.url;
     }

     const taskId = res.id || res.task_id || res.data?.id || res.data?.task_id;
     if (!taskId) throw new Error("No Task ID returned");
     
     const qUrl = config.queryEndpoint 
        ? constructUrl(config.baseUrl, config.queryEndpoint)
        : `${targetUrl}/${taskId}`;

     let attempts = 0;
     while (attempts < 120) {
        await new Promise(r => setTimeout(r, 5000));
        try {
            const check = await fetchThirdParty(qUrl.includes(taskId) || (config.queryEndpoint && config.queryEndpoint.includes('{id}')) ? qUrl : `${qUrl}?task_id=${taskId}`, 'GET', null, config, { timeout: 10000 });
            const status = (check.status || check.task_status || check.state || '').toString().toUpperCase();
            
            if (['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'OK'].includes(status)) {
                 if (check.url) return check.url;
                 if (check.output?.url) return check.output.url;
                 if (check.result?.url) return check.result.url;
                 if (check.data?.url) return check.data.url;
                 if (check.data?.video?.url) return check.data.video.url;
                 if (check.video?.url) return check.video.url;
                 if (Array.isArray(check.data) && check.data[0]?.url) return check.data[0].url;
                 if (check.data?.video?.url) return check.data.video.url;
            } else if (['FAIL', 'FAILED', 'FAILURE', 'ERROR'].includes(status)) {
                 throw new Error(`Video Gen failed: ${check.fail_reason || check.error || 'Unknown error'}`);
            }
        } catch (e: any) {
            if (attempts > 10 && e.isNonRetryable) throw e;
        }
        attempts++;
     }
     throw new Error("Video generation timed out");
};

// === 青栀 AI 专用 Veo 视频生成 ===
// 特殊点：Authorization header 用「裸 key」而不是「Bearer <key>」
// 端点：POST /veo/v1/video/create  +  GET /veo/v1/video/query?id=xxx
// payload：{ prompt, model, enhance_prompt, images, aspect_ratio }
const qingzhiRawRequest = async (url: string, method: 'GET' | 'POST', apiKey: string, body?: any, timeout = 240000): Promise<{ ok: boolean; status: number; text: string }> => {
    const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Authorization': apiKey, // ← 不加 Bearer 前缀
    };
    if (method === 'POST' && body) headers['Content-Type'] = 'application/json';

    const isElectron = !!(window as any).electronAPI?.requestUrl;
    if (isElectron) {
        const res = await (window as any).electronAPI.requestUrl({
            url, method, headers, timeout, isFormData: false,
            body: body ? JSON.stringify(body) : undefined,
        });
        return { ok: res.ok, status: res.status, text: res.text };
    }
    // Fallback：浏览器 fetch
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
        const res = await fetch(url, {
            method, headers, signal: ctrl.signal,
            body: body ? JSON.stringify(body) : undefined,
        });
        const text = await res.text();
        return { ok: res.ok, status: res.status, text };
    } finally {
        clearTimeout(timer);
    }
};

export const generateQingzhiVeoVideo = async (
    config: ModelConfig,
    prompt: string,
    aspectRatio: string,
    inputImages: string[]
): Promise<string> => {
    if (!config.key) throw new Error('未配置 API Key（青栀 AI）');
    if (!config.modelId) throw new Error('未配置 modelId（青栀 AI Veo，例如 veo3 / veo3.1 / veo2）');

    const createUrl = constructUrl(config.baseUrl, config.endpoint || '/veo/v1/video/create');
    const queryUrl = constructUrl(config.baseUrl, config.queryEndpoint || '/veo/v1/video/query');

    // 比例兼容：Veo 通常只接受 16:9 / 9:16；其它统一映射成 16:9
    const ratio = (aspectRatio === '9:16' ? '9:16' : '16:9');

    const payload: any = {
        prompt,
        model: config.modelId,
        enhance_prompt: true,
        aspect_ratio: ratio,
        images: inputImages.length > 0 ? inputImages.slice(0, 3) : [],
    };

    console.log('[Qingzhi Veo] POST', createUrl, { model: payload.model, ratio, imgs: payload.images.length, promptLen: prompt.length });
    const createRes = await qingzhiRawRequest(createUrl, 'POST', config.key, payload, 180000);
    if (!createRes.ok) {
        console.error('[Qingzhi Veo] create failed:', createRes.text);
        throw new Error(`API Error ${createRes.status}: ${createRes.text.slice(0, 500)}`);
    }
    let createJson: any;
    try { createJson = JSON.parse(createRes.text); } catch { throw new Error(`接口返回非 JSON：${createRes.text.slice(0, 200)}`); }

    // 立即返回的直连 URL（极少见）
    if (createJson.video_url || createJson.url) return (createJson.video_url || createJson.url) as string;

    const taskId = createJson.id || createJson.task_id;
    if (!taskId) throw new Error('青栀 Veo 接口未返回 task id');
    console.log('[Qingzhi Veo] taskId:', taskId);

    // 轮询查询 ——  120 次 × 5s = 10 分钟
    let attempts = 0;
    while (attempts < 120) {
        await new Promise(r => setTimeout(r, 5000));
        attempts++;
        try {
            const queryFinalUrl = `${queryUrl}?id=${encodeURIComponent(taskId)}`;
            const queryRes = await qingzhiRawRequest(queryFinalUrl, 'GET', config.key, undefined, 15000);
            if (!queryRes.ok) {
                console.warn('[Qingzhi Veo] query non-OK', queryRes.status, queryRes.text.slice(0, 200));
                continue;
            }
            let q: any;
            try { q = JSON.parse(queryRes.text); } catch { continue; }
            const status = (q.status || '').toString().toLowerCase();
            console.log(`[Qingzhi Veo] poll #${attempts}: status=${status}`);
            if (['completed', 'success', 'succeeded', 'ok'].includes(status)) {
                if (q.video_url) return q.video_url;
                if (q.url) return q.url;
                if (q.detail?.video_url) return q.detail.video_url;
                throw new Error('已完成但未返回 video_url');
            }
            if (['failed', 'failure', 'error'].includes(status)) {
                throw new Error(`青栀 Veo 生成失败：${q.fail_reason || q.error || q.message || '未知错误'}`);
            }
            // pending / video_generating 等中间态 → 继续等
        } catch (e: any) {
            if (e?.message?.startsWith('青栀 Veo 生成失败')) throw e;
            console.warn('[Qingzhi Veo] poll error', e?.message);
        }
    }
    throw new Error('青栀 Veo 生成超时（10 分钟）');
};

export const generateVeo3Video = async (
    config: ModelConfig,
    prompt: string,
    aspectRatio: string,
    inputImages: string[]
): Promise<string> => {
     const targetUrl = constructUrl(config.baseUrl, config.endpoint);
     
     const payload: any = {
         prompt: prompt,
         model: config.modelId,
         enhance_prompt: true,
         enable_upsample: true,
         aspect_ratio: aspectRatio
     };
     
     if (inputImages.length > 0) {
         payload.images = inputImages;
     }

     const res = await fetchThirdParty(targetUrl, 'POST', payload, config, { timeout: 900000, retries: 2 });
     
     if (res.url || res.video_url || res.data?.url) {
         return res.url || res.video_url || res.data?.url;
     }

     const taskId = res.id || res.task_id || res.data?.id;
     if (!taskId) throw new Error("No Task ID returned from Veo3");
     
     const queryEndpoint = config.queryEndpoint || '/v1/video/query';
     const qUrl = constructUrl(config.baseUrl, queryEndpoint);

     let attempts = 0;
     while (attempts < 120) {
        await new Promise(r => setTimeout(r, 5000));
        try {
            // Specific Veo query format: ?id=TASK_ID
            const finalUrl = `${qUrl}?id=${taskId}`;
            
            const check = await fetchThirdParty(finalUrl, 'GET', null, config, { timeout: 10000 });
            
            const status = (check.status || check.state || '').toString().toLowerCase();
            
            if (['completed', 'success', 'succeeded', 'ok'].includes(status)) {
                 if (check.video_url) return check.video_url;
                 if (check.detail?.video_url) return check.detail.video_url;
                 if (check.detail?.upsample_video_url) return check.detail.upsample_video_url;
                 if (check.url) return check.url;
                 if (check.data?.video_url) return check.data.video_url;
            } else if (['failed', 'failure', 'error'].includes(status)) {
                 throw new Error(`Veo3 failed: ${check.fail_reason || check.error || 'Unknown error'}`);
            }
        } catch (e: any) {
            if (attempts > 20 && e.isNonRetryable) throw e;
        }
        attempts++;
     }
     throw new Error("Veo3 generation timed out");
};

// 从 SSE/JSON 响应里提取视频 URL（兼容 OpenAI chat.completions 流式与非流式 + NDJSON + 无前缀 JSON 块）
const extractVideoUrlFromChatResponse = (text: string): string | null => {
    const URL_REGEX = /https?:\/\/\S+?\.(?:mp4|mov|webm|m4v)(?:\?\S*)?/i;
    const tryExtractFromChunk = (chunk: any): string | null => {
        if (!chunk || typeof chunk !== 'object') return null;
        // 非流式：choices[0].message.content
        const msgContent = chunk.choices?.[0]?.message?.content;
        if (typeof msgContent === 'string') {
            const m = msgContent.match(URL_REGEX);
            if (m) return m[0];
            if (msgContent.startsWith('http')) return msgContent.trim();
        }
        // 流式：choices[0].delta.content
        const deltaContent = chunk.choices?.[0]?.delta?.content;
        if (typeof deltaContent === 'string') {
            const m = deltaContent.match(URL_REGEX);
            if (m) return m[0];
            if (deltaContent.startsWith('http')) return deltaContent.trim();
        }
        return null;
    };

    // 路径 1：完整 JSON（非流式）
    try {
        const json = JSON.parse(text);
        const url = tryExtractFromChunk(json);
        if (url) return url;
    } catch {}

    // 路径 2：逐 chunk 解析。兼容三种格式：
    //   a) 标准 SSE：每行 "data: {...}"
    //   b) NDJSON：每行 "{...}"（无前缀）
    //   c) JSON 块 + 空行分隔：多行 JSON 用 \n\n 分隔
    // 统一策略：用正则提取所有 "{...}" 配对块，逐个 JSON.parse，最后取含视频 URL 的那个
    let foundUrl = '';
    // 提取所有顶层平衡的 {...} 块
    let depth = 0;
    let start = -1;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '{') {
            if (depth === 0) start = i;
            depth++;
        } else if (ch === '}') {
            depth--;
            if (depth === 0 && start !== -1) {
                const blob = text.slice(start, i + 1);
                start = -1;
                try {
                    const chunk = JSON.parse(blob);
                    const url = tryExtractFromChunk(chunk);
                    if (url) foundUrl = url;
                } catch { /* 不是完整 JSON 块，忽略 */ }
            }
        }
    }
    return foundUrl || null;
};

// 直接走 IPC，绕开 fetchThirdParty 的 JSON 强解析（chat 流式响应不是 JSON）
const rawPostText = async (url: string, headers: Record<string, string>, body: string, timeout: number): Promise<{ ok: boolean; status: number; statusText: string; text: string }> => {
    const isElectron = !!(window as any).electronAPI?.requestUrl;
    if (isElectron) {
        return await (window as any).electronAPI.requestUrl({ url, method: 'POST', headers, timeout, isFormData: false, body });
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
        const res = await fetch(url, { method: 'POST', headers, body, signal: ctrl.signal });
        const text = await res.text();
        return { ok: res.ok, status: res.status, statusText: res.statusText, text };
    } finally {
        clearTimeout(timer);
    }
};

export const generateGrokVideo = async (
    config: ModelConfig,
    prompt: string,
    aspectRatio: string,
    resolution: string,
    inputImages: string[]
): Promise<string> => {
    const endpoint = config.endpoint || '/v1/chat/completions';
    const isChatStyle = endpoint.includes('chat/completions');

    // === 协议 A：OpenAI Chat Completions（micuapi.ai 等代理常用，gateway 内部转 Grok 然后流式返回视频 URL）===
    if (isChatStyle) {
        const targetUrl = constructUrl(config.baseUrl, endpoint);
        // Grok 视频接口不支持多模态 content 数组，强制走纯文本聊天协议
        // 图片输入忽略（视频模型本来也只接受 1 张图，且这个 gateway 把它包装成 chat 接口后多模态会破坏字段路由）
        const safePrompt = prompt || '生成一段视频';
        // 按 gateway 抓包验证的精确格式：完整 priming（user / assistant / user / assistant 四条）
        const payload = {
            model: config.modelId,
            group: 'grok',
            messages: [
                { role: 'user', content: '你好' },
                { role: 'assistant', content: '你好！有什么我可以帮助你的吗？' },
                { role: 'user', content: safePrompt },
                { role: 'assistant', content: '好的，我来为你生成视频。' },
            ],
            stream: true,
            temperature: 0.7,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
        };

        if (inputImages.length > 0) {
            console.warn(`[Grok-Chat] ${inputImages.length} input image(s) ignored — Grok chat-style endpoint accepts text-only`);
        }

        console.log('[Grok-Chat] POST →', targetUrl);
        console.log('[Grok-Chat] Payload:', { model: payload.model, group: payload.group, msgCount: payload.messages.length, promptLen: safePrompt.length });

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream, application/json',
            'Authorization': `Bearer ${config.key}`,
        };
        const res = await rawPostText(targetUrl, headers, JSON.stringify(payload), 600000);
        console.log('[Grok-Chat] HTTP', res.status, res.statusText, 'text length:', res.text.length);
        if (!res.ok) {
            // 失败时把完整响应内容打到 console 方便诊断
            console.error('[Grok-Chat] Full failed response body:', res.text);
            throw new Error(`API Error ${res.status}: ${res.text.slice(0, 1500)}`);
        }
        // 成功响应也先 preview，方便排查解析问题
        console.log('[Grok-Chat] Response preview (first 800):', res.text.slice(0, 800));
        console.log('[Grok-Chat] Response preview (last 800):', res.text.slice(-800));
        const url = extractVideoUrlFromChatResponse(res.text);
        if (!url) {
            // 解析失败：把完整响应打到 console
            console.error('[Grok-Chat] FAILED to extract URL. Full response body:', res.text);
            throw new Error(`Grok 响应中没有找到视频 URL。请把 Console 里 [Grok-Chat] FAILED 那条日志的完整内容截图给我诊断。响应长度: ${res.text.length}`);
        }
        console.log('[Grok-Chat] ✓ Got video URL:', url);
        return url;
    }

    // === 协议 B：标准 video/create + 轮询（保留兼容原 Grok 直连 API）===
    const targetUrl = constructUrl(config.baseUrl, endpoint);

    // Grok requires "size": "720P" (uppercase P)
    const size = (resolution || '720p').toUpperCase();

    const payload: any = {
        model: config.modelId,
        prompt: prompt,
        aspect_ratio: aspectRatio,
        size: size,
    };

    if (inputImages.length > 0) {
        payload.images = inputImages;
    }

    console.log('[Grok] POST →', targetUrl, '(video/create style)');
    const res = await fetchThirdParty(targetUrl, 'POST', payload, config, { timeout: 120000 });
    console.log('[Grok] Response:', res);
     
     if (res.url || res.data?.url) {
         return res.url || res.data?.url;
     }

     const taskId = res.id || res.task_id || res.data?.id;
     if (!taskId) throw new Error("No Task ID returned from Grok");
     
     const queryEndpoint = config.queryEndpoint || '/v1/video/query';
     const qUrl = constructUrl(config.baseUrl, queryEndpoint);

     let attempts = 0;
     while (attempts < 120) {
        await new Promise(r => setTimeout(r, 5000));
        try {
            // Query param style ?id=...
            const finalUrl = `${qUrl}?id=${taskId}`;
            
            const check = await fetchThirdParty(finalUrl, 'GET', null, config, { timeout: 10000 });
            
            const status = (check.status || check.data?.status || '').toString().toLowerCase();
            
            if (['success', 'succeeded', 'completed', 'ok'].includes(status)) {
                 if (check.url) return check.url;
                 if (check.data?.url) return check.data.url;
                 if (check.data?.video_url) return check.data.video_url;
                 // Fallbacks
                 if (check.video_url) return check.video_url;
            } else if (['failed', 'failure', 'error'].includes(status)) {
                 throw new Error(`Grok failed: ${check.fail_reason || check.error || 'Unknown error'}`);
            }
        } catch (e: any) {
            if (attempts > 20 && e.isNonRetryable) throw e;
        }
        attempts++;
     }
     throw new Error("Grok generation timed out");
};

export const generateSoraVideo = async (
    config: ModelConfig,
    prompt: string,
    aspectRatio: string,
    resolution: string,
    duration: string,
    inputImages: string[]
): Promise<string> => {
     const targetUrl = constructUrl(config.baseUrl, config.endpoint);
     
     // Map Parameters
     const orientation = aspectRatio === '9:16' ? 'portrait' : 'landscape';
     const size = resolution === '1080p' ? 'large' : 'small'; // small is 720p
     const durationInt = parseInt(duration.replace('s', '')) || 10;

     const payload: any = {
         model: config.modelId,
         prompt: prompt,
         orientation: orientation,
         size: size,
         duration: durationInt,
         watermark: false,
         private: true,
         images: inputImages
     };

     console.log('[Sora] Creating video task...');
     console.log('[Sora] URL:', targetUrl);
     console.log('[Sora] Payload:', JSON.stringify(payload).substring(0, 500));

     const res = await fetchThirdParty(targetUrl, 'POST', payload, config, { timeout: 120000 });
     
     console.log('[Sora] Create Response:', JSON.stringify(res).substring(0, 500));
     
     if (res.url || res.data?.url) {
         console.log('[Sora] Direct URL returned:', res.url || res.data?.url);
         return res.url || res.data?.url;
     }

     const taskId = res.id || res.task_id || res.data?.id;
     if (!taskId) {
         console.error('[Sora] No Task ID in response:', res);
         throw new Error("No Task ID returned from Sora");
     }
     
     console.log('[Sora] Task ID:', taskId);
     
     const queryEndpoint = config.queryEndpoint || '/v1/video/query';
     const qUrl = constructUrl(config.baseUrl, queryEndpoint);

     let attempts = 0;
     while (attempts < 120) {
        await new Promise(r => setTimeout(r, 5000));
        try {
            // Assume Query param style ?id=... similar to Grok/Veo for this API proxy
            const finalUrl = `${qUrl}?id=${taskId}`;
            
            const check = await fetchThirdParty(finalUrl, 'GET', null, config, { timeout: 10000 });
            
            // Check status (flexible)
            const status = (check.status || check.data?.status || check.state || '').toString().toLowerCase();
            
            console.log(`[Sora] Poll #${attempts + 1}, Status: "${status}", Response:`, JSON.stringify(check).substring(0, 300));
            
            if (['success', 'succeeded', 'completed', 'ok'].includes(status)) {
                 const videoUrl = check.url || check.data?.url || check.data?.video_url || check.video_url;
                 console.log('[Sora] Video completed! URL:', videoUrl);
                 if (videoUrl) return videoUrl;
            } else if (['failed', 'failure', 'error'].includes(status)) {
                 console.error('[Sora] Generation failed:', check);
                 throw new Error(`Sora failed: ${check.fail_reason || check.error || 'Unknown error'}`);
            }
        } catch (e: any) {
            console.warn(`[Sora] Poll error #${attempts + 1}:`, e.message);
            if (attempts > 20 && e.isNonRetryable) throw e;
        }
        attempts++;
     }
     throw new Error("Sora generation timed out");
};
