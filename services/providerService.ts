// 服务商（Provider）管理：多供应商架构
// 灵感参照 Cherry Studio。每个 Provider 有自己的 Base URL、API Key 与模型列表。

export type ProviderType =
    | 'global'
    | 'openai'
    | 'anthropic'
    | 'gemini'
    | 'siliconflow'
    | 'deepseek'
    | 'volcano'
    | 'doubao'
    | 'qwen'
    | 'zhipu'
    | 'qingzhi'
    | 'vpai'
    | 'custom';

export type ProviderModelType = 'text' | 'image' | 'audio' | 'video';

export interface ProviderModel {
    id: string;          // 模型唯一标识，如 "gpt-4" / "models/gemini-pro"
    name?: string;       // 可选显示名
    type?: ProviderModelType;  // 主能力类别：text / image / audio / video，抓取时已固化
    enabled?: boolean;   // 默认 true
    custom?: boolean;    // true 为手动添加，false 为接口拉取
}

export const inferModelType = (modelId: string, modelName?: string): ProviderModelType => {
    const haystack = `${modelId} ${modelName || ''}`.toLowerCase();
    if (/(image|images|dall[\s-]?e|sd-|sdxl|flux|midjourney|\bmj\b|imagen|seedream|cogview|qwen[\s-]?image|gpt[\s-]?image|nano[\s-]?banana|stable[\s-]?diffusion|kolors|hunyuan[\s-]?image|chatgpt[\s-]?image|fluxpro|recraft|ideogram)/.test(haystack)) {
        return 'image';
    }
    if (/(video|sora|seedance|kling|wan-|wanx|vidu|runway|hailuo|veo|mochi|pika|hunyuan[\s-]?video)/.test(haystack)) {
        return 'video';
    }
    if (/(tts|audio|speech|voice|whisper|suno|udio|elevenlabs)/.test(haystack)) {
        return 'audio';
    }
    return 'text';
};

export interface Provider {
    id: string;
    name: string;
    type: ProviderType;
    baseUrl: string;
    apiKey: string;
    enabled: boolean;
    isBuiltin?: boolean;
    notes?: string;
    models: ProviderModel[];
}

const STORAGE_KEY = 'PROVIDERS_V1';
const GLOBAL_BASE_URL_KEY = 'GLOBAL_BASE_URL';
const GLOBAL_API_KEY_KEY = 'GLOBAL_API_KEY';

export const PROVIDER_TEMPLATES: Record<Exclude<ProviderType, 'global'>, { name: string; baseUrl: string; description?: string }> = {
    openai:      { name: 'OpenAI',         baseUrl: 'https://api.openai.com',           description: 'GPT 系列官方接口' },
    anthropic:   { name: 'Anthropic',      baseUrl: 'https://api.anthropic.com',        description: 'Claude 系列官方接口' },
    gemini:      { name: 'Google Gemini',  baseUrl: 'https://generativelanguage.googleapis.com', description: 'Gemini 系列官方接口' },
    siliconflow: { name: 'SiliconFlow',    baseUrl: 'https://api.siliconflow.cn',       description: '硅基流动 — 国内多模型聚合' },
    deepseek:    { name: 'DeepSeek',       baseUrl: 'https://api.deepseek.com',         description: '深度求索官方接口' },
    volcano:     { name: '火山引擎',         baseUrl: 'https://ark.cn-beijing.volces.com', description: '字节跳动 / 豆包模型' },
    doubao:      { name: '豆包',            baseUrl: 'https://ark.cn-beijing.volces.com', description: '字节豆包对话 / 视觉' },
    qwen:        { name: '通义千问',         baseUrl: 'https://dashscope.aliyuncs.com',   description: '阿里云通义系列' },
    zhipu:       { name: '智谱 GLM',        baseUrl: 'https://open.bigmodel.cn',         description: '清华系智谱 AI' },
    qingzhi:     { name: '青栀 AI',         baseUrl: '',                                 description: 'Veo 视频生成中转网关。请填入实际网关 baseUrl，鉴权用裸 key 不加 Bearer。' },
    vpai:        { name: 'V-PAI',           baseUrl: 'https://api.gpt.ge',               description: 'V-PAI 视频任务网关，目前接入豆包 Seedance 系列。鉴权用标准 Bearer。' },
    custom:      { name: '自定义',           baseUrl: '',                                 description: '中转 / 私有部署' },
};

const isClient = () => typeof window !== 'undefined' && typeof localStorage !== 'undefined';

const generateId = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `prov_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const buildGlobalProviderFromLegacy = (): Provider => ({
    id: 'global',
    name: '全局',
    type: 'global',
    baseUrl: (isClient() && localStorage.getItem(GLOBAL_BASE_URL_KEY)) || '',
    apiKey: (isClient() && (localStorage.getItem(GLOBAL_API_KEY_KEY) || '').split(/[,\n]/).map(k => k.trim()).filter(Boolean)[0]) || '',
    enabled: true,
    isBuiltin: true,
    notes: '所有未单独绑定服务商的模型默认使用此处的配置。',
    models: [],
});

const VALID_PROVIDER_MODEL_TYPES: ProviderModelType[] = ['text', 'image', 'audio', 'video'];

const normalizeModelType = (value: any, modelId: string, modelName?: string): ProviderModelType => {
    if (typeof value === 'string') {
        const lower = value.toLowerCase();
        if ((VALID_PROVIDER_MODEL_TYPES as string[]).includes(lower)) return lower as ProviderModelType;
    }
    return inferModelType(modelId, modelName);
};

// 迁移旧格式（apiKeys: string[]）到新格式（apiKey: string）
const migrateProvider = (raw: any): Provider => {
    const p = { ...raw } as any;
    if (Array.isArray(p.apiKeys)) {
        p.apiKey = p.apiKey || p.apiKeys[0] || '';
        delete p.apiKeys;
    }
    if (typeof p.apiKey !== 'string') p.apiKey = '';
    if (!Array.isArray(p.models)) p.models = [];
    p.models = p.models.map((m: any) => {
        if (!m || typeof m !== 'object' || typeof m.id !== 'string') return m;
        return { ...m, type: normalizeModelType(m.type, m.id, m.name) };
    });
    return p as Provider;
};

// 把全局 provider 写回 GLOBAL_* localStorage，保证现有 getModelConfig 兼容
const syncGlobalToLegacyKeys = (providers: Provider[]) => {
    if (!isClient()) return;
    const global = providers.find(p => p.id === 'global');
    if (!global) return;
    localStorage.setItem(GLOBAL_BASE_URL_KEY, global.baseUrl || '');
    localStorage.setItem(GLOBAL_API_KEY_KEY, global.apiKey || '');
};

export const loadProviders = (): Provider[] => {
    if (!isClient()) return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
        const initial = [buildGlobalProviderFromLegacy()];
        saveProviders(initial);
        return initial;
    }
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            const initial = [buildGlobalProviderFromLegacy()];
            saveProviders(initial);
            return initial;
        }
        const migrated = parsed.map(migrateProvider);
        // 保证全局 provider 一定存在
        if (!migrated.some(p => p.id === 'global')) {
            migrated.unshift(buildGlobalProviderFromLegacy());
        }
        saveProviders(migrated);
        return migrated;
    } catch {
        const initial = [buildGlobalProviderFromLegacy()];
        saveProviders(initial);
        return initial;
    }
};

export const saveProviders = (providers: Provider[]): void => {
    if (!isClient()) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(providers));
    syncGlobalToLegacyKeys(providers);
    // 通知应用其他组件配置已更新
    window.dispatchEvent(new CustomEvent('providersUpdated'));
};

export const getProvider = (id: string): Provider | undefined => {
    return loadProviders().find(p => p.id === id);
};

export const upsertProvider = (provider: Provider): Provider[] => {
    const list = loadProviders();
    const idx = list.findIndex(p => p.id === provider.id);
    if (idx >= 0) list[idx] = provider;
    else list.push(provider);
    saveProviders(list);
    return list;
};

export const deleteProvider = (id: string): Provider[] => {
    const list = loadProviders();
    const filtered = list.filter(p => p.id !== id || p.isBuiltin);
    saveProviders(filtered);
    return filtered;
};

export const createProviderFromTemplate = (type: Exclude<ProviderType, 'global'>, customName?: string): Provider => {
    const tpl = PROVIDER_TEMPLATES[type];
    const provider: Provider = {
        id: generateId(),
        name: customName || tpl.name,
        type,
        baseUrl: tpl.baseUrl,
        apiKey: '',
        enabled: true,
        notes: tpl.description,
        models: [],
    };
    upsertProvider(provider);
    return provider;
};

// 从 provider 获取实际可用的 baseUrl 和 key
export const resolveProviderEndpoint = (id: string): { baseUrl: string; key: string } | null => {
    const p = getProvider(id);
    if (!p || !p.enabled) return null;
    return {
        baseUrl: p.baseUrl || '',
        key: p.apiKey || '',
    };
};

// =========== Models ===========

export const addModelToProvider = (providerId: string, model: ProviderModel): Provider | null => {
    const list = loadProviders();
    const target = list.find(p => p.id === providerId);
    if (!target) return null;
    if (target.models.some(m => m.id === model.id)) return target;
    target.models = [...target.models, { enabled: true, ...model }];
    saveProviders(list);
    return target;
};

export const addModelsToProvider = (providerId: string, models: ProviderModel[]): Provider | null => {
    const list = loadProviders();
    const target = list.find(p => p.id === providerId);
    if (!target) return null;
    const existing = new Set(target.models.map(m => m.id));
    const incoming = models.filter(m => !existing.has(m.id)).map(m => ({ enabled: true, ...m }));
    if (incoming.length === 0) return target;
    target.models = [...target.models, ...incoming];
    saveProviders(list);
    return target;
};

export const removeModelFromProvider = (providerId: string, modelId: string): Provider | null => {
    const list = loadProviders();
    const target = list.find(p => p.id === providerId);
    if (!target) return null;
    target.models = target.models.filter(m => m.id !== modelId);
    saveProviders(list);
    return target;
};

type ModelFetchAuthMode = 'bearer' | 'gemini' | 'anthropic';

interface ModelFetchCandidate {
    url: string;
    auth: ModelFetchAuthMode;
}

const trimUrl = (url: string): string => url.trim().replace(/\/+$/, '');

const joinUrl = (baseUrl: string, path: string): string => {
    return `${trimUrl(baseUrl)}/${path.replace(/^\/+/, '')}`;
};

const getUrlPathname = (url: string): string => {
    try {
        return new URL(url).pathname.replace(/\/+$/, '');
    } catch {
        return '';
    }
};

const normalizeModelBaseUrl = (baseUrl: string): string => {
    let base = trimUrl(baseUrl);
    base = base.replace(/\/models\/[^/]+(?::generateContent|:streamGenerateContent)?$/i, '');
    base = base.replace(/\/(chat\/completions|responses|completions|embeddings|images\/generations|videos\/generations|audio\/transcriptions|models)$/i, '');
    return trimUrl(base);
};

const isVersionedModelRoot = (baseUrl: string): boolean => {
    return /\/(v\d+(?:beta)?|api\/v\d+|api\/paas\/v\d+|compatible-mode\/v\d+)$/i.test(getUrlPathname(baseUrl));
};

const addUnique = <T,>(list: T[], value: T, key: (item: T) => string) => {
    if (!list.some(item => key(item) === key(value))) list.push(value);
};

const buildModelUrls = (provider: Provider, baseUrl: string): string[] => {
    const urls: string[] = [];
    const addPath = (path: string) => addUnique(urls, joinUrl(baseUrl, path), item => item);

    if (isVersionedModelRoot(baseUrl)) {
        addPath('models');
        return urls;
    }

    if (provider.type === 'gemini') {
        addPath('v1beta/models');
        addPath('v1/models');
        addPath('models');
        return urls;
    }

    if (provider.type === 'qwen') {
        addPath('compatible-mode/v1/models');
        addPath('v1/models');
        addPath('models');
        return urls;
    }

    if (provider.type === 'zhipu') {
        addPath('api/paas/v4/models');
        addPath('v1/models');
        addPath('models');
        return urls;
    }

    if (provider.type === 'volcano' || provider.type === 'doubao') {
        addPath('api/v3/models');
        addPath('v1/models');
        addPath('models');
        return urls;
    }

    if (provider.type === 'deepseek') {
        addPath('models');
        addPath('v1/models');
        return urls;
    }

    addPath('v1/models');
    addPath('models');
    addPath('api/v3/models');
    return urls;
};

const isGeminiLike = (provider: Provider, url: string): boolean => {
    return provider.type === 'gemini' || url.includes('generativelanguage.googleapis.com');
};

const buildModelFetchCandidates = (provider: Provider, baseUrl: string): ModelFetchCandidate[] => {
    const candidates: ModelFetchCandidate[] = [];
    for (const url of buildModelUrls(provider, baseUrl)) {
        if (isGeminiLike(provider, url)) {
            addUnique(candidates, { url, auth: 'gemini' }, item => `${item.auth}:${item.url}`);
            addUnique(candidates, { url, auth: 'bearer' }, item => `${item.auth}:${item.url}`);
        } else if (provider.type === 'anthropic') {
            addUnique(candidates, { url, auth: 'anthropic' }, item => `${item.auth}:${item.url}`);
            addUnique(candidates, { url, auth: 'bearer' }, item => `${item.auth}:${item.url}`);
        } else {
            addUnique(candidates, { url, auth: 'bearer' }, item => `${item.auth}:${item.url}`);
        }
    }
    return candidates;
};

const appendQueryParam = (url: string, key: string, value: string): string => {
    try {
        const parsed = new URL(url);
        if (!parsed.searchParams.has(key)) parsed.searchParams.set(key, value);
        return parsed.toString();
    } catch {
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    }
};

const buildModelFetchHeaders = (provider: Provider, auth: ModelFetchAuthMode): Record<string, string> => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (auth === 'gemini') {
        headers['x-goog-api-key'] = provider.apiKey;
    } else if (auth === 'anthropic') {
        headers['x-api-key'] = provider.apiKey;
        headers['anthropic-version'] = '2023-06-01';
    } else {
        headers.Authorization = `Bearer ${provider.apiKey}`;
    }
    return headers;
};

const wrapModelFetchUrl = (targetUrl: string): string => {
    if (typeof window === 'undefined') return targetUrl;
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isDev) return targetUrl;
    if (targetUrl.startsWith('/') || targetUrl.includes('localhost') || targetUrl.includes('127.0.0.1')) return targetUrl;
    return `/cors-proxy?url=${encodeURIComponent(targetUrl)}`;
};

const extractErrorMessage = (text: string): string => {
    if (!text) return '';
    try {
        const data = JSON.parse(text);
        if (typeof data?.error === 'string') return data.error;
        if (typeof data?.error?.message === 'string') return data.error.message;
        if (typeof data?.message === 'string') return data.message;
        if (typeof data?.detail === 'string') return data.detail;
        if (typeof data?.fail_reason === 'string') return data.fail_reason;
    } catch {}
    return text.slice(0, 180);
};

const fetchModelJson = async (candidate: ModelFetchCandidate, provider: Provider, signal?: AbortSignal): Promise<any> => {
    let url = candidate.auth === 'gemini' ? appendQueryParam(candidate.url, 'key', provider.apiKey) : candidate.url;
    const headers = buildModelFetchHeaders(provider, candidate.auth);
    const electronAPI = typeof window !== 'undefined' ? (window as any).electronAPI : null;
    if (signal?.aborted) throw Object.assign(new Error('请求超时'), { name: 'AbortError' });

    const response = electronAPI?.requestUrl
        ? await electronAPI.requestUrl({ url, method: 'GET', headers, timeout: 15000 })
        : await fetch(wrapModelFetchUrl(url), { method: 'GET', headers, signal, credentials: 'omit' });

    const text = typeof response.text === 'function' ? await response.text() : (response.text || '');
    if (!response.ok) {
        const message = extractErrorMessage(text);
        throw new Error(`HTTP ${response.status}${message ? `：${message}` : ''}`);
    }
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        throw new Error('返回内容不是有效 JSON');
    }
};

const firstString = (...values: any[]): string => {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
};

const findModelArray = (data: any): any[] | null => {
    if (Array.isArray(data)) return data;
    const containers = [data, data?.data, data?.result, data?.results, data?.response];
    for (const container of containers) {
        if (Array.isArray(container)) return container;
        if (!container || typeof container !== 'object') continue;
        for (const key of ['data', 'models', 'items', 'list', 'modelList', 'model_list']) {
            if (Array.isArray(container[key])) return container[key];
        }
    }
    return null;
};

const normalizeProviderModel = (item: any, provider: Provider): ProviderModel | null => {
    if (typeof item === 'string') {
        const id = provider.type === 'gemini' ? item.replace(/^models\//, '') : item;
        return id ? { id, name: id, type: inferModelType(id), custom: false } : null;
    }
    if (!item || typeof item !== 'object') return null;
    const rawId = firstString(item.id, item.name, item.model, item.modelId, item.model_id, item.uid);
    if (!rawId) return null;
    const id = provider.type === 'gemini' ? rawId.replace(/^models\//, '') : rawId;
    const name = firstString(item.displayName, item.display_name, item.label, item.name, item.id, id);
    return {
        id,
        name,
        type: inferModelType(id, name),
        custom: false,
    };
};

const parseProviderModels = (data: any, provider: Provider): ProviderModel[] => {
    const items = findModelArray(data);
    if (!items) return [];
    const models = items.map(item => normalizeProviderModel(item, provider)).filter(Boolean) as ProviderModel[];
    // 去重
    const seen = new Set<string>();
    return models.filter(m => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
    });
};

const summarizeCandidate = (candidate: ModelFetchCandidate): string => {
    try {
        const parsed = new URL(candidate.url);
        return `${parsed.pathname || '/'} [${candidate.auth}]`;
    } catch {
        return `${candidate.url} [${candidate.auth}]`;
    }
};

// V-PAI 的静态模型清单（task 网关不开放 /v1/models 接口）
const VPAI_STATIC_MODELS: ProviderModel[] = [
    { id: 'doubao-seedance-1-5-pro-251215',      name: '1.5 全能视频模型',        type: 'video', enabled: true },
    { id: 'doubao-seedance-1-0-pro-250528',      name: '1.0 全能视频模型',        type: 'video', enabled: true },
    { id: 'doubao-seedance-1-0-pro-fast-251015', name: '1.0 全能视频模型 · 快速', type: 'video', enabled: true },
    { id: 'doubao-seedance-1-0-lite-t2v-250428', name: '文生视频模型',           type: 'video', enabled: true },
    { id: 'doubao-seedance-1-0-lite-i2v-250428', name: '首尾帧视频模型',         type: 'video', enabled: true },
];

// 从服务商的 /v1/models 或 /v1beta/models 拉取可用模型列表
// 青栀 AI 的静态模型清单（网关只代理 Veo，没有 /v1/models 接口）
const QINGZHI_STATIC_MODELS: ProviderModel[] = [
    { id: 'veo2',                  name: 'Veo 2 · Fast 默认',         type: 'video', enabled: true },
    { id: 'veo2-fast',             name: 'Veo 2 · Fast',              type: 'video', enabled: true },
    { id: 'veo2-fast-frames',      name: 'Veo 2 · Fast 首尾帧',       type: 'video', enabled: true },
    { id: 'veo2-fast-components',  name: 'Veo 2 · Fast 多图素材合成', type: 'video', enabled: true },
    { id: 'veo2-pro',              name: 'Veo 2 · Pro 高质量',        type: 'video', enabled: true },
    { id: 'veo3',                  name: 'Veo 3 · Fast 带音频',       type: 'video', enabled: true },
    { id: 'veo3-fast',             name: 'Veo 3 · Fast 带音频',       type: 'video', enabled: true },
    { id: 'veo3-pro',              name: 'Veo 3 · Pro 超高质量带音频', type: 'video', enabled: true },
    { id: 'veo3-pro-frames',       name: 'Veo 3 · Pro 首帧 带音频',   type: 'video', enabled: true },
    { id: 'veo3.1',                name: 'Veo 3.1 · Fast 自适应首帧', type: 'video', enabled: true },
    { id: 'veo3.1-pro',            name: 'Veo 3.1 · Pro 自适应首帧',  type: 'video', enabled: true },
];

export const fetchProviderModels = async (provider: Provider, signal?: AbortSignal): Promise<{ ok: boolean; models?: ProviderModel[]; error?: string }> => {
    // 青栀 AI 网关不开放 /v1/models —— 直接返回我们维护的静态清单（11 个 Veo 变体）
    if (provider.type === 'qingzhi') {
        return { ok: true, models: QINGZHI_STATIC_MODELS };
    }
    // V-PAI task 网关也不开放 /v1/models —— 返回 Seedance 静态清单
    if (provider.type === 'vpai') {
        return { ok: true, models: VPAI_STATIC_MODELS };
    }

    const baseUrl = normalizeModelBaseUrl(provider.baseUrl || '');
    const apiKey = provider.apiKey.trim();
    if (!baseUrl) return { ok: false, error: '未填写 Base URL' };
    if (!apiKey) return { ok: false, error: '未填写 API Key' };

    const normalizedProvider = { ...provider, apiKey };
    const candidates = buildModelFetchCandidates(normalizedProvider, baseUrl);
    const errors: string[] = [];

    for (const candidate of candidates) {
        try {
            const data = await fetchModelJson(candidate, normalizedProvider, signal);
            const models = parseProviderModels(data, normalizedProvider);
            if (models.length > 0) return { ok: true, models };
            errors.push(`${summarizeCandidate(candidate)}：未识别到模型列表`);
        } catch (e: any) {
            if (e.name === 'AbortError') return { ok: false, error: '请求超时' };
            errors.push(`${summarizeCandidate(candidate)}：${e.message || '网络错误'}`);
        }
    }

    const detail = errors.slice(0, 4).join('；');
    const suffix = errors.length > 4 ? `；另有 ${errors.length - 4} 个地址失败` : '';
    return {
        ok: false,
        models: [],
        error: `获取模型失败。${detail}${suffix}。如果该服务商不开放模型列表接口，请检查服务商配置或更换支持模型列表的接口。`,
    };
};

// 测试服务商连通性
export const testProviderConnection = async (provider: Provider, signal?: AbortSignal): Promise<{ ok: boolean; status?: number; error?: string }> => {
    // 青栀 AI 网关不暴露通用端点，只能验证有没有填关键字段
    if (provider.type === 'qingzhi') {
        if (!provider.baseUrl?.trim()) return { ok: false, error: '请填写 Base URL（青栀网关地址）' };
        if (!provider.apiKey?.trim()) return { ok: false, error: '请填写 API Key' };
        return { ok: true };
    }
    // V-PAI 同上，task 网关无通用 ping 端点
    if (provider.type === 'vpai') {
        if (!provider.baseUrl?.trim()) return { ok: false, error: '请填写 Base URL（V-PAI 网关地址）' };
        if (!provider.apiKey?.trim()) return { ok: false, error: '请填写 API Key' };
        return { ok: true };
    }
    const result = await fetchProviderModels(provider, signal);
    if (result.ok) return { ok: true };
    return { ok: false, error: result.error };
};
