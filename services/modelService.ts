import { loadProviders, Provider, ProviderModel, inferModelType } from './providerService';
import { registerCustomModel, saveModelConfig, getModelConfig, deleteModel } from './mode/config';
import type { ModelCategory, ModelDef, ModelConfig, StrategyType } from './mode/types';

export type ModelServiceCategory = ModelCategory;

export interface ModelServiceBinding {
    id: string;
    category: ModelServiceCategory;
    slotKey: string;
    providerId: string;
    modelId: string;
    name: string;
    enabled: boolean;
    registryKey?: string;
    endpoint?: string;
    queryEndpoint?: string;
    downloadEndpoint?: string;
}

export interface ModelServiceDraft {
    category: ModelServiceCategory;
    slotKey?: string;
    providerId: string;
    modelId: string;
    name?: string;
    endpoint?: string;
    queryEndpoint?: string;
    downloadEndpoint?: string;
}

export interface CanvasModelOption {
    value: string;
    label: string;
}

export interface ModelServiceSlot {
    key: string;
    category: ModelServiceCategory;
    name: string;
    aliases: string[];
}

export const MODEL_SERVICE_SLOTS: ModelServiceSlot[] = [
    { key: 'TEXT_GPT', category: 'TEXT', name: 'GPT 文本模型', aliases: ['gpt', 'openai', 'chatgpt'] },
    { key: 'TEXT_CLAUDE', category: 'TEXT', name: 'Claude 文本模型', aliases: ['claude', 'anthropic'] },
    { key: 'TEXT_GEMINI', category: 'TEXT', name: 'Gemini 文本模型', aliases: ['gemini', 'google'] },
    { key: 'TEXT_DEEPSEEK', category: 'TEXT', name: 'DeepSeek 文本模型', aliases: ['deepseek'] },
    { key: 'TEXT_QWEN', category: 'TEXT', name: 'Qwen 文本模型', aliases: ['qwen', '通义', '千问'] },

    { key: 'IMAGE_SEEDREAM_5', category: 'IMAGE', name: 'Seedream 5.0', aliases: ['seedream-5', 'seedream 5', 'seedream5', 'doubao-seedream-5', '豆包'] },
    { key: 'IMAGE_GPT_IMAGE_2', category: 'IMAGE', name: 'GPT Image 2', aliases: ['gpt-image-2', 'gpt image 2'] },
    { key: 'IMAGE_NANO_BANANA', category: 'IMAGE', name: 'Nano Banana', aliases: ['nano banana', 'nanobanana', 'nano-banana', 'banana', 'gemini-3-pro-image-preview', 'gemini-2.5-flash-image-preview'] },
    { key: 'IMAGE_MIDJOURNEY', category: 'IMAGE', name: 'Midjourney', aliases: ['midjourney', 'mj'] },
    { key: 'IMAGE_FLUX', category: 'IMAGE', name: 'Flux', aliases: ['flux'] },
    { key: 'IMAGE_ZIMAGE', category: 'IMAGE', name: 'Zimage', aliases: ['zimage', 'z-image'] },

    { key: 'AUDIO_TTS', category: 'AUDIO', name: 'TTS 语音模型', aliases: ['tts', 'speech', 'voice'] },
    { key: 'AUDIO_MUSIC', category: 'AUDIO', name: '音乐生成模型', aliases: ['music', 'song', 'audio'] },

    { key: 'VIDEO_SORA_2', category: 'VIDEO', name: 'Sora 2', aliases: ['sora-2', 'sora 2'] },
    { key: 'VIDEO_VEO_3_1', category: 'VIDEO', name: 'Veo 3.1', aliases: ['veo3.1', 'veo 3.1', 'veo'] },
    { key: 'VIDEO_KLING', category: 'VIDEO', name: 'Kling 视频模型', aliases: ['kling', '可灵'] },
    { key: 'VIDEO_WAN', category: 'VIDEO', name: 'Wan 视频模型', aliases: ['wan', '通义万相'] },
    { key: 'VIDEO_HAILUO', category: 'VIDEO', name: 'Hailuo 视频模型', aliases: ['hailuo', '海螺', 'minimax'] },
    { key: 'VIDEO_SEEDANCE', category: 'VIDEO', name: 'Seedance 视频模型', aliases: ['seedance', 'doubao-seedance', '即梦'] },
];

const DEFAULT_SLOT_KEY_BY_CATEGORY: Record<ModelServiceCategory, string> = {
    TEXT: 'TEXT_GPT',
    IMAGE: 'IMAGE_GPT_IMAGE_2',
    AUDIO: 'AUDIO_TTS',
    VIDEO: 'VIDEO_SORA_2',
};

export const MODEL_SERVICE_CATEGORIES: Array<{
    key: ModelServiceCategory;
    label: string;
    description: string;
}> = [
    { key: 'TEXT', label: '文本模型', description: '用于提示词、对话、理解等文本能力' },
    { key: 'IMAGE', label: '图像模型', description: '用于文生图、图生图等画布节点' },
    { key: 'AUDIO', label: '音频模型', description: '用于语音、音乐等能力预留' },
    { key: 'VIDEO', label: '视频模型', description: '用于文生视频、图生视频等画布节点' },
];

export const MODEL_SERVICE_BINDINGS_STORAGE_KEY = 'MODEL_SERVICE_BINDINGS_V1';
const ENUM_PREFIX = '枚举/';

const isClient = () => typeof window !== 'undefined' && typeof localStorage !== 'undefined';

const generateId = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `model_svc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const sanitizeRegistryPart = (value: string): string => {
    return value.trim().replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').slice(0, 80);
};

const getSlotsByCategory = (category: ModelServiceCategory): ModelServiceSlot[] => {
    return MODEL_SERVICE_SLOTS.filter(slot => slot.category === category);
};

export const getModelServiceSlots = (category?: ModelServiceCategory): ModelServiceSlot[] => {
    return category ? getSlotsByCategory(category) : MODEL_SERVICE_SLOTS;
};

const getSlotByKey = (slotKey: string | undefined, category: ModelServiceCategory): ModelServiceSlot => {
    return MODEL_SERVICE_SLOTS.find(slot => slot.key === slotKey && slot.category === category)
        || MODEL_SERVICE_SLOTS.find(slot => slot.key === DEFAULT_SLOT_KEY_BY_CATEGORY[category])
        || getSlotsByCategory(category)[0];
};

const inferSlotKey = (category: ModelServiceCategory, modelName: string, modelId: string): string => {
    const candidate = `${modelName} ${modelId}`.toLowerCase();
    const matched = getSlotsByCategory(category).find(slot =>
        slot.aliases.some(alias => candidate.includes(alias.toLowerCase()))
    );
    return matched?.key || DEFAULT_SLOT_KEY_BY_CATEGORY[category];
};

export const getModelServiceRegistryKey = (binding: Pick<ModelServiceBinding, 'category' | 'slotKey' | 'id'>): string => {
    const slot = getSlotByKey(binding.slotKey, binding.category);
    return `${ENUM_PREFIX}${binding.category}/${sanitizeRegistryPart(slot.name) || binding.id}`;
};

const stripDisplaySuffix = (name: string): string => {
    return name.replace(/\s*[|｜]\s*(当前热门)?(文本|图片|图像|音频|视频)(枚举|模型)\s*$/, '').trim();
};

export const getModelServiceDisplayName = (category: ModelServiceCategory, _name?: string, slotKey?: string): string => {
    return getSlotByKey(slotKey, category).name;
};

const normalizeBinding = (raw: any): ModelServiceBinding | null => {
    if (!raw || typeof raw !== 'object') return null;
    const category = raw.category as ModelServiceCategory;
    if (!['TEXT', 'IMAGE', 'AUDIO', 'VIDEO'].includes(category)) return null;
    if (typeof raw.providerId !== 'string' || typeof raw.modelId !== 'string') return null;
    const id = typeof raw.id === 'string' && raw.id ? raw.id : generateId();
    const rawName = typeof raw.name === 'string' && raw.name ? raw.name : raw.modelId;
    const cleanedName = stripDisplaySuffix(rawName);
    const legacyCategoryName = `${category === 'IMAGE' ? '图像' : category === 'TEXT' ? '文本' : category === 'AUDIO' ? '音频' : '视频'}模型`;
    const slotKey = typeof raw.slotKey === 'string'
        ? getSlotByKey(raw.slotKey, category).key
        : inferSlotKey(category, rawName, raw.modelId);
    const slotName = getSlotByKey(slotKey, category).name;
    const name = cleanedName && cleanedName !== slotName && cleanedName !== legacyCategoryName ? cleanedName : raw.modelId;
    return {
        id,
        category,
        slotKey,
        providerId: raw.providerId,
        modelId: raw.modelId,
        name,
        enabled: raw.enabled !== false,
        registryKey: typeof raw.registryKey === 'string' ? raw.registryKey : undefined,
        endpoint: typeof raw.endpoint === 'string' ? raw.endpoint : undefined,
        queryEndpoint: typeof raw.queryEndpoint === 'string' ? raw.queryEndpoint : undefined,
        downloadEndpoint: typeof raw.downloadEndpoint === 'string' ? raw.downloadEndpoint : undefined,
    };
};

export const loadModelServiceBindings = (): ModelServiceBinding[] => {
    if (!isClient()) return [];
    try {
        const raw = localStorage.getItem(MODEL_SERVICE_BINDINGS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return [];
        return parsed.map(normalizeBinding).filter(Boolean) as ModelServiceBinding[];
    } catch {
        return [];
    }
};

export const saveModelServiceBindings = (bindings: ModelServiceBinding[]): void => {
    if (!isClient()) return;
    localStorage.setItem(MODEL_SERVICE_BINDINGS_STORAGE_KEY, JSON.stringify(bindings));
    window.dispatchEvent(new Event('modelServiceUpdated'));
};

const getProviderModelName = (provider: Provider | undefined, modelId: string): string => {
    const model = provider?.models.find(m => m.id === modelId);
    return model?.name || model?.id || modelId;
};

const getDefaultEndpoint = (category: ModelServiceCategory): string => {
    if (category === 'TEXT') return '/v1/chat/completions';
    if (category === 'IMAGE') return '/v1/images/generations';
    if (category === 'VIDEO') return '/v1/videos';
    return '/v1/audio/speech';
};

const getDefaultStrategy = (category: ModelServiceCategory): StrategyType => {
    if (category === 'TEXT') return 'CHAT';
    if (category === 'IMAGE') return 'IMAGE_GEN';
    if (category === 'VIDEO') return 'VIDEO_GEN_STD';
    return 'AUDIO';
};

const canRegisterToCanvas = (category: ModelServiceCategory): boolean => {
    return category === 'TEXT' || category === 'IMAGE' || category === 'VIDEO';
};

export const syncModelServiceBindingToRegistry = (binding: ModelServiceBinding): ModelServiceBinding => {
    const registryKey = getModelServiceRegistryKey(binding);
    if (binding.registryKey && binding.registryKey !== registryKey) deleteModel(binding.registryKey);
    if (!binding.enabled || !canRegisterToCanvas(binding.category)) return { ...binding, registryKey };

    const def: ModelDef = {
        id: binding.modelId,
        name: getModelServiceDisplayName(binding.category, binding.name, binding.slotKey),
        type: getDefaultStrategy(binding.category),
        category: binding.category,
        defaultEndpoint: binding.endpoint || getDefaultEndpoint(binding.category),
        defaultQueryEndpoint: binding.queryEndpoint || undefined,
        defaultDownloadEndpoint: binding.downloadEndpoint || undefined,
    };

    registerCustomModel(registryKey, def);
    const current = getModelConfig(registryKey);
    const config: ModelConfig = {
        ...current,
        modelId: binding.modelId,
        providerId: binding.providerId,
        endpoint: binding.endpoint || def.defaultEndpoint,
        queryEndpoint: binding.queryEndpoint || def.defaultQueryEndpoint || '',
        downloadEndpoint: binding.downloadEndpoint || def.defaultDownloadEndpoint || '',
    };
    saveModelConfig(registryKey, config);
    return { ...binding, registryKey };
};

export const syncAllModelServiceBindingsToRegistry = (): ModelServiceBinding[] => {
    const bindings = loadModelServiceBindings();
    const latestBySlot = new Map<string, ModelServiceBinding>();
    bindings.forEach(binding => latestBySlot.set(`${binding.category}:${binding.slotKey}`, binding));
    const deduped = Array.from(latestBySlot.values());
    bindings
        .filter(binding => !deduped.some(item => item.id === binding.id))
        .forEach(binding => {
            const fixedRegistryKey = getModelServiceRegistryKey(binding);
            if (binding.registryKey && binding.registryKey !== fixedRegistryKey) deleteModel(binding.registryKey);
        });
    const synced = deduped.map(syncModelServiceBindingToRegistry);
    if (JSON.stringify(bindings) !== JSON.stringify(synced)) saveModelServiceBindings(synced);
    return synced;
};

export const upsertModelServiceBinding = (draft: ModelServiceDraft, existingId?: string): ModelServiceBinding => {
    const providers = loadProviders();
    const provider = providers.find(p => p.id === draft.providerId);
    const list = loadModelServiceBindings();
    const modelName = stripDisplaySuffix(draft.name?.trim() || getProviderModelName(provider, draft.modelId)) || draft.modelId;
    const slotKey = getSlotByKey(draft.slotKey || inferSlotKey(draft.category, modelName, draft.modelId), draft.category).key;
    const existing = existingId
        ? list.find(b => b.id === existingId)
        : list.find(b => b.category === draft.category && b.slotKey === slotKey);
    const registryKey = getModelServiceRegistryKey({ category: draft.category, slotKey, id: existing?.id || draft.modelId });
    if (existing?.registryKey && existing.registryKey !== registryKey) deleteModel(existing.registryKey);
    const base: ModelServiceBinding = {
        id: existing?.id || generateId(),
        category: draft.category,
        slotKey,
        providerId: draft.providerId,
        modelId: draft.modelId,
        name: modelName,
        enabled: existing?.enabled ?? true,
        registryKey,
        endpoint: draft.endpoint || getDefaultEndpoint(draft.category),
        queryEndpoint: draft.queryEndpoint || '',
        downloadEndpoint: draft.downloadEndpoint || '',
    };
    const synced = syncModelServiceBindingToRegistry(base);
    const next = [...list.filter(item => item.id !== existing?.id && !(item.category === draft.category && item.slotKey === slotKey)), synced];
    saveModelServiceBindings(next);
    return synced;
};

export const deleteModelServiceBinding = (id: string): ModelServiceBinding[] => {
    const current = loadModelServiceBindings();
    const target = current.find(item => item.id === id);
    if (target?.registryKey) deleteModel(target.registryKey);
    const next = current.filter(item => item.id !== id);
    saveModelServiceBindings(next);
    return next;
};

export const getPrimaryModelServiceBinding = (category: ModelServiceCategory): ModelServiceBinding | null => {
    return loadModelServiceBindings().find(item => item.enabled && item.category === category) || null;
};

export const getCanvasModelOptions = (category: ModelServiceCategory): CanvasModelOption[] => {
    return loadModelServiceBindings()
        .filter(item => item.enabled && item.category === category && item.registryKey && canRegisterToCanvas(item.category))
        .map(item => ({
            value: item.registryKey!,
            label: getModelServiceDisplayName(item.category, item.name, item.slotKey),
        }));
};

const PROVIDER_TYPE_BY_CATEGORY: Record<ModelServiceCategory, string> = {
    TEXT: 'text',
    IMAGE: 'image',
    AUDIO: 'audio',
    VIDEO: 'video',
};

export const getProviderModelOptions = (category?: ModelServiceCategory): Array<{
    provider: Provider;
    model: ProviderModel;
    value: string;
    label: string;
}> => {
    return loadProviders()
        .filter(provider => provider.enabled)
        .flatMap(provider => provider.models.map(model => ({
            provider,
            model,
            value: `${provider.id}::${model.id}`,
            label: `${model.name || model.id} | ${provider.name}`,
        })))
        .filter(item => {
            if (!category) return true;
            const expected = PROVIDER_TYPE_BY_CATEGORY[category];
            const actual = (item.model.type || inferModelType(item.model.id, item.model.name)).toLowerCase();
            return actual === expected;
        });
};
