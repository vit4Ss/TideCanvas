// V-PAI 网关支持的 5 个 Seedance modelId（用于路由层强制匹配，避免落到 GenericVideoHandler）
export const VPAI_SEEDANCE_MODEL_IDS = new Set<string>([
    'doubao-seedance-1-5-pro-251215',
    'doubao-seedance-1-0-pro-250528',
    'doubao-seedance-1-0-pro-fast-251015',
    'doubao-seedance-1-0-lite-t2v-250428',
    'doubao-seedance-1-0-lite-i2v-250428',
]);

export const isVPaiSeedanceModelId = (modelId: string | undefined): boolean => {
    if (!modelId) return false;
    return VPAI_SEEDANCE_MODEL_IDS.has(modelId);
};

// === V-PAI 视频生成 ===
// 网关：https://api.gpt.ge
// 鉴权：Authorization: Bearer <token>（标准 OpenAI 风格，复用 fetchThirdParty）
// 创建任务：POST /task/volces/seedance
//   payload: { model, content: [{type:'text'|'image_url', ...}], generate_audio?, draft? }
// 查询任务：GET /task/{task_id} → { id, status, content: { video_url } }

import type { ModelConfig } from "../types";
import { fetchThirdParty, constructUrl } from "../network";

type SeedanceContentItem =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string }; role?: 'first_frame' | 'last_frame' };

// 火山 Seedance 的分辨率 / 比例 / 时长走 prompt 末尾 CLI 风格 flag
// 例：xxx --ratio 16:9 --rs 720p --dur 5
// 已存在的 flag 不重复追加，让用户手写优先
const appendSeedanceFlags = (
    prompt: string,
    aspectRatio?: string,
    resolution?: string,
    duration?: string,
): string => {
    const flags: string[] = [];
    if (aspectRatio && !/--ratio\s/.test(prompt)) flags.push(`--ratio ${aspectRatio}`);
    if (resolution && !/--rs\s/.test(prompt))    flags.push(`--rs ${resolution}`);
    if (duration && !/--dur\s/.test(prompt)) {
        const sec = parseInt(String(duration).replace(/s$/i, ''), 10);
        if (sec > 0) flags.push(`--dur ${sec}`);
    }
    if (flags.length === 0) return prompt;
    return `${prompt.trim()}  ${flags.join('  ')}`.trim();
};

export const generateVPaiSeedanceVideo = async (
    config: ModelConfig,
    prompt: string,
    inputImages: string[],
    isStartEndMode: boolean,
    aspectRatio?: string,
    resolution?: string,
    duration?: string,
): Promise<string> => {
    if (!config.modelId) throw new Error('未配置 modelId（V-PAI Seedance）');

    // V-PAI 走火山引擎接口，image_url.url 必须是公网可访问的 HTTPS 链接，不接受 base64 dataURL
    const base64Imgs = inputImages.filter(s => typeof s === 'string' && s.startsWith('data:'));
    if (base64Imgs.length > 0) {
        throw new Error('V-PAI Seedance 不支持 base64 图片（接口仅接受公网 HTTPS URL）。请先把图片上传到对象存储，或换用支持 base64 的服务商（如青栀 Veo）。');
    }

    // 强制使用 V-PAI 路径，忽略 config.endpoint 里可能残留的脏值（如 /v1/videos）
    const createUrl = constructUrl(config.baseUrl, '/task/volces/seedance');
    if (config.endpoint && config.endpoint !== '/task/volces/seedance') {
        console.warn(`[V-PAI Seedance] 忽略 config.endpoint="${config.endpoint}"，强制使用 /task/volces/seedance`);
    }

    const finalPrompt = appendSeedanceFlags(prompt || ' ', aspectRatio, resolution, duration);
    const content: SeedanceContentItem[] = [{ type: 'text', text: finalPrompt }];

    if (inputImages.length > 0) {
        if (isStartEndMode && inputImages.length >= 2) {
            content.push({ type: 'image_url', image_url: { url: inputImages[0] }, role: 'first_frame' });
            content.push({ type: 'image_url', image_url: { url: inputImages[inputImages.length - 1] }, role: 'last_frame' });
        } else {
            inputImages.forEach(url => {
                content.push({ type: 'image_url', image_url: { url } });
            });
        }
    }

    const payload: any = {
        model: config.modelId,
        content,
    };

    // 1.5 pro 支持 generate_audio / draft，其他模型忽略即可。这里不主动传，走 API 默认。
    const maskedKey = config.key && config.key.length > 8
        ? `${config.key.slice(0, 4)}...${config.key.slice(-4)} (len=${config.key.length})`
        : '***';
    console.groupCollapsed('[V-PAI Seedance] ▶ CREATE TASK');
    console.log('URL    :', createUrl);
    console.log('Method : POST');
    console.log('Headers:', {
        Authorization: `Bearer ${maskedKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
    });
    console.log('Body   :', JSON.stringify(payload, null, 2));
    console.log('Body (compact):', JSON.stringify(payload));
    console.log('-- summary --');
    console.log('  model   :', payload.model);
    console.log('  imgs    :', inputImages.length, '(startEnd =', isStartEndMode, ')');
    console.log('  prompt  :', finalPrompt);
    console.groupEnd();

    const createRes = await fetchThirdParty(createUrl, 'POST', payload, config, { timeout: 120000 });
    console.groupCollapsed('[V-PAI Seedance] ◀ CREATE RESPONSE');
    console.log('Body:', JSON.stringify(createRes, null, 2));
    console.groupEnd();

    const taskId =
        createRes?.id ||
        createRes?.task_id ||
        createRes?.data?.id ||
        createRes?.data?.task_id;
    if (!taskId) throw new Error(`V-PAI Seedance 创建任务未返回 task id。完整响应：${JSON.stringify(createRes).slice(0, 400)}`);
    console.log('[V-PAI Seedance] taskId:', taskId);

    // 同样强制 /task 查询基址
    const queryUrl = `${constructUrl(config.baseUrl, '/task')}/${encodeURIComponent(taskId)}`;
    console.log('[V-PAI Seedance] poll URL =', queryUrl);

    // 视频生成耗时较长：120 次 × 5s = 10 分钟
    for (let attempts = 1; attempts <= 120; attempts++) {
        await new Promise(r => setTimeout(r, 5000));
        try {
            const q = await fetchThirdParty(queryUrl, 'GET', null, config, { timeout: 15000 });
            const status = (q?.status || '').toString().toLowerCase();
            const progress = q?.progress ?? q?.data?.progress;
            console.groupCollapsed(`[V-PAI Seedance] ◀ POLL #${attempts}  status=${status}${progress !== undefined ? `  progress=${progress}` : ''}`);
            console.log('GET    :', queryUrl);
            console.log('Body   :', JSON.stringify(q, null, 2));
            console.groupEnd();

            if (['succeeded', 'success', 'completed', 'ok'].includes(status)) {
                const videoUrl =
                    q?.content?.video_url ||
                    q?.data?.content?.video_url ||
                    q?.video_url ||
                    q?.url;
                if (videoUrl) {
                    console.log('[V-PAI Seedance] ✓ video_url =', videoUrl);
                    return videoUrl;
                }
                throw new Error('V-PAI Seedance 返回成功状态但未携带 video_url');
            }
            if (['failed', 'failure', 'error', 'cancelled', 'canceled'].includes(status)) {
                const reason = q?.error || q?.fail_reason || q?.message || '未知错误';
                throw new Error(`V-PAI Seedance 生成失败：${reason}`);
            }
            // queued / running / processing 等中间态 → 继续轮询
        } catch (e: any) {
            if (e?.message?.startsWith('V-PAI Seedance 生成失败')) throw e;
            if (e?.message?.startsWith('V-PAI Seedance 返回成功状态')) throw e;
            console.warn('[V-PAI Seedance] poll error:', e?.message);
            if (attempts > 20 && e?.isNonRetryable) throw e;
        }
    }
    throw new Error('V-PAI Seedance 生成超时（10 分钟）');
};
