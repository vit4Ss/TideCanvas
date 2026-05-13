import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icons } from '../Icons';
import { StorageSection } from './StorageSection';
import { MODEL_REGISTRY, getModelConfig, saveModelConfig, ModelConfig, registerCustomModel, deleteModel, isCustomModel } from '../../services/geminiService';
import {
    Provider,
    ProviderType,
    ProviderModel,
    PROVIDER_TEMPLATES,
    loadProviders,
    upsertProvider,
    deleteProvider as deleteProviderInStore,
    createProviderFromTemplate,
    testProviderConnection,
    fetchProviderModels,
    addModelToProvider,
    addModelsToProvider,
    removeModelFromProvider,
} from '../../services/providerService';
import {
    MODEL_SERVICE_CATEGORIES,
    ModelServiceBinding,
    ModelServiceCategory,
    loadModelServiceBindings,
    upsertModelServiceBinding,
    deleteModelServiceBinding,
    syncAllModelServiceBindingsToRegistry,
    MODEL_SERVICE_BINDINGS_STORAGE_KEY,
    getModelServiceDisplayName,
    getModelServiceSlots,
} from '../../services/modelService';

type SettingsSection = 'endpoint' | 'models' | 'data' | 'storage' | 'about';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    isDark: boolean;
}

// 全局配置 Key
const GLOBAL_BASE_URL_KEY = 'GLOBAL_BASE_URL';
const GLOBAL_API_KEY_KEY = 'GLOBAL_API_KEY';

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, isDark }) => {
    // 全局配置
    const [globalBaseUrl, setGlobalBaseUrl] = useState('');
    const [globalApiKey, setGlobalApiKey] = useState('');
    
    // 模型配置
    const [configs, setConfigs] = useState<Record<string, ModelConfig>>({});
    const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all');
    
    // 测试连接状态
    const [testingModels, setTestingModels] = useState<Set<string>>(new Set());
    const [testResults, setTestResults] = useState<Record<string, 'success' | 'error' | null>>({});
    
    // 添加模型状态
    const [showAddModel, setShowAddModel] = useState(false);
    const [newModelName, setNewModelName] = useState('');
    const [newModelId, setNewModelId] = useState('');
    const [newModelType, setNewModelType] = useState<'IMAGE' | 'VIDEO'>('IMAGE');
    const [modelServiceBindings, setModelServiceBindings] = useState<ModelServiceBinding[]>([]);
    const [modelServiceSelections, setModelServiceSelections] = useState<Record<ModelServiceCategory, string>>({
        TEXT: '',
        IMAGE: '',
        AUDIO: '',
        VIDEO: '',
    });
    const [modelServiceSlotSelections, setModelServiceSlotSelections] = useState<Record<ModelServiceCategory, string>>({
        TEXT: 'TEXT_GPT',
        IMAGE: 'IMAGE_GPT_IMAGE_2',
        AUDIO: 'AUDIO_TTS',
        VIDEO: 'VIDEO_SORA_2',
    });
    const [activeModelCategory, setActiveModelCategory] = useState<ModelServiceCategory>('IMAGE');

    const configInputRef = useRef<HTMLInputElement>(null);

    // 加载配置
    useEffect(() => {
        if (isOpen) {
            // 加载全局配置
            setGlobalBaseUrl(localStorage.getItem(GLOBAL_BASE_URL_KEY) || '');
            setGlobalApiKey(localStorage.getItem(GLOBAL_API_KEY_KEY) || '');
            
            // 加载模型配置
            const newConfigs: Record<string, ModelConfig> = {};
            Object.keys(MODEL_REGISTRY).forEach(key => {
                newConfigs[key] = getModelConfig(key);
            });
            setConfigs(newConfigs);
            setModelServiceBindings(syncAllModelServiceBindingsToRegistry());
        }
    }, [isOpen]);

    // 保存全局配置
    const saveGlobalConfig = () => {
        localStorage.setItem(GLOBAL_BASE_URL_KEY, globalBaseUrl);
        localStorage.setItem(GLOBAL_API_KEY_KEY, globalApiKey);
        
        // 更新所有模型的 baseUrl（除了特定模型）
        const excludeModels = ['Jimeng45', 'Jimeng41', 'Jimeng31'];
        Object.keys(MODEL_REGISTRY).forEach(key => {
            if (!excludeModels.some(ex => key.includes(ex))) {
                const config = configs[key] || {};
                if (!config.baseUrl && globalBaseUrl) {
                    updateConfig(key, 'baseUrl', globalBaseUrl);
                }
            }
        });
        
        // 触发全局配置更新事件，通知所有节点重新检查配置
        window.dispatchEvent(new CustomEvent('modelConfigUpdated', { detail: { modelName: '*' } }));
    };

    // 更新模型配置
    const updateConfig = (modelKey: string, field: keyof ModelConfig, value: string) => {
        setConfigs(prev => {
            const newConfig = { ...prev[modelKey], [field]: value };
            // 立即保存到 localStorage
            saveModelConfig(modelKey, newConfig);
            return { ...prev, [modelKey]: newConfig };
        });
    };

    // 切换展开状态
    const toggleExpand = (key: string) => {
        setExpandedModels(prev => {
            const newSet = new Set(prev);
            if (newSet.has(key)) {
                newSet.delete(key);
            } else {
                newSet.add(key);
            }
            return newSet;
        });
    };

    // 测试连接 - 带超时处理
    const testConnection = async (modelKey: string) => {
        setTestingModels(prev => new Set(prev).add(modelKey));
        setTestResults(prev => ({ ...prev, [modelKey]: null }));
        
        // 创建超时控制器
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
        
        try {
            const config = configs[modelKey];
            const baseUrl = (config?.baseUrl || globalBaseUrl || '').replace(/\/$/, '');
            const apiKey = config?.key || globalApiKey;
            
            if (!baseUrl || !apiKey) {
                throw new Error('缺少 Base URL 或 API Key');
            }
            
            // 根据 endpoint 确定测试 URL
            const endpoint = config?.endpoint || '';
            let testUrl = `${baseUrl}/v1/models`;
            
            // 如果是 Gemini/Google 风格的 API，使用不同的测试方式
            if (endpoint.includes('v1beta') || endpoint.includes('generateContent')) {
                testUrl = `${baseUrl}/v1beta/models`;
            }
            
            const response = await fetch(testUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'x-goog-api-key': apiKey, // Google API 格式
                    'Content-Type': 'application/json',
                },
                signal: controller.signal,
            });
            
            clearTimeout(timeoutId);
            
            // 200-299 状态码都算成功，401/403 说明连接通但认证问题
            if (response.ok || response.status === 401 || response.status === 403) {
                setTestResults(prev => ({ ...prev, [modelKey]: 'success' }));
            } else {
                setTestResults(prev => ({ ...prev, [modelKey]: 'error' }));
            }
        } catch (e: any) {
            clearTimeout(timeoutId);
            
            // 检查是否是超时
            if (e.name === 'AbortError') {
                console.warn(`测试 ${modelKey} 超时`);
            }
            
            // 检查是否是 Mixed Content 导致的失败 (虽然 catch 无法直接区分，但可以推测)
            const config = configs[modelKey];
            const originalBaseUrl = (config?.baseUrl || globalBaseUrl || '');
            
            if (e.message === 'Failed to fetch' || e.name === 'TypeError') {
                // 如果我们刚才进行了自动升级（原地址是 HTTP，但在 HTTPS 页面下测试）
                if (typeof window !== 'undefined' && window.location.protocol === 'https:' && originalBaseUrl.startsWith('http://')) {
                      console.warn('HTTPS upgrade failed for HTTP endpoint');
                      alert(`连接失败：\n1. 当前网站是 HTTPS 安全协议，浏览器禁止直接访问 HTTP 接口。\n2. 系统尝试自动升级为 HTTPS 连接，但对方服务器不支持 HTTPS 或握手失败。\n\n解决方案：\n👉 请更换支持 HTTPS 的 API 服务商（推荐）\n👉 或下载代码在本地 (localhost) 运行`);
                } else if (isMixedContent(originalBaseUrl)) {
                     console.warn('Mixed Content detected during connection test');
                     alert('连接失败：浏览器禁止在 HTTPS 网站中访问 HTTP 接口。请使用 HTTPS API 地址。');
                } else {
                     // 可能是 CORS
                     console.warn('CORS or Network error');
                     // 不弹窗，只显示红色错误图标
                }
            }

            // CORS 错误或网络错误
            setTestResults(prev => ({ ...prev, [modelKey]: 'error' }));
        } finally {
            setTestingModels(prev => {
                const newSet = new Set(prev);
                newSet.delete(modelKey);
                return newSet;
            });
        }
    };

    // 添加自定义模型
    const handleAddModel = () => {
        if (!newModelName || !newModelId) return;
        
        registerCustomModel(newModelName, {
            id: newModelId,
            name: newModelName,
            type: newModelType === 'IMAGE' ? 'IMAGE_GEN' : 'VIDEO_GEN_FORM',
            category: newModelType,
            defaultEndpoint: newModelType === 'IMAGE' ? '/v1/images/generations' : '/v1/videos'
        });
        
        setConfigs(prev => ({
            ...prev,
            [newModelName]: getModelConfig(newModelName)
        }));
        
        setShowAddModel(false);
        setNewModelName('');
        setNewModelId('');
        setExpandedModels(prev => new Set(prev).add(newModelName));
    };
    
    // 删除模型
    const handleDeleteModel = (key: string) => {
        const modelName = MODEL_REGISTRY[key]?.name || key;
        if (confirm(`确定要删除模型 "${modelName}" 吗？删除后将不再显示在模型选择列表中。`)) {
            deleteModel(key);
            setConfigs(prev => {
                const newConfigs = { ...prev };
                delete newConfigs[key];
                return newConfigs;
            });
            setExpandedModels(prev => {
                const newSet = new Set(prev);
                newSet.delete(key);
                return newSet;
            });
        }
    };

    // 导出配置
    const handleExport = () => {
        const exportData = {
            version: 2,
            timestamp: new Date().toISOString(),
            globalBaseUrl,
            globalApiKey,
            modelServiceBindings,
            configs: Object.fromEntries(
                Object.entries(configs).filter(([_, v]) => {
                    const config = v as ModelConfig;
                    return config.key || config.baseUrl || config.modelId;
                })
            )
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `flowgen-config-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // 导入配置
    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target?.result as string);
                if (data.globalBaseUrl) setGlobalBaseUrl(data.globalBaseUrl);
                if (data.globalApiKey) setGlobalApiKey(data.globalApiKey);
                if (Array.isArray(data.modelServiceBindings)) {
                    localStorage.setItem(MODEL_SERVICE_BINDINGS_STORAGE_KEY, JSON.stringify(data.modelServiceBindings));
                    setModelServiceBindings(syncAllModelServiceBindingsToRegistry());
                }
                if (data.configs) {
                    Object.entries(data.configs).forEach(([key, config]) => {
                        saveModelConfig(key, config as ModelConfig);
                    });
                    // 重新加载
                    const newConfigs: Record<string, ModelConfig> = {};
                    Object.keys(MODEL_REGISTRY).forEach(key => {
                        newConfigs[key] = getModelConfig(key);
                    });
                    setConfigs(newConfigs);
                }
                alert('配置导入成功');
            } catch (err) {
                alert('导入失败：文件格式无效');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    // 过滤模型列表
    const filteredModels = useMemo(() => {
        return Object.keys(MODEL_REGISTRY).filter(key => {
            const def = MODEL_REGISTRY[key];
            
            const matchesSearch = !searchTerm || 
                def.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                def.id.toLowerCase().includes(searchTerm.toLowerCase());
            
            const matchesType = filterType === 'all' || 
                (filterType === 'image' && def.category === 'IMAGE') ||
                (filterType === 'video' && def.category === 'VIDEO');
            
            return matchesSearch && matchesType;
        });
    }, [searchTerm, filterType, configs]);

    // 判断模型是否已配置
    const isConfigured = (key: string) => {
        const config = configs[key];
        return (config?.key || globalApiKey) && (config?.baseUrl || globalBaseUrl);
    };

    // 检查是否是混合内容（Mixed Content）风险
    const isMixedContent = (url: string) => {
        if (typeof window === 'undefined') return false;
        return window.location.protocol === 'https:' && url.toLowerCase().startsWith('http://');
    };

    // 当前选中的分区
    const [activeSection, setActiveSection] = useState<SettingsSection>('endpoint');

    // 打开时默认跳到全局接口
    useEffect(() => {
        if (isOpen) setActiveSection('endpoint');
    }, [isOpen]);

    // ============ Provider state ============
    const [providers, setProviders] = useState<Provider[]>([]);
    const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
    const [showAddProvider, setShowAddProvider] = useState(false);
    const [providerTesting, setProviderTesting] = useState<Set<string>>(new Set());
    const [providerTestResults, setProviderTestResults] = useState<Record<string, { ok: boolean; error?: string } | null>>({});

    // 获取模型选择弹窗状态
    const [fetchModelsState, setFetchModelsState] = useState<{
        providerId: string;
        loading: boolean;
        error?: string;
        models: ProviderModel[];
        selected: Set<string>;
        search: string;
    } | null>(null);

    useEffect(() => {
        if (isOpen) {
            const list = loadProviders();
            setProviders(list);
            setSelectedProviderId(prev => {
                if (prev && list.some(p => p.id === prev)) return prev;
                return list[0]?.id || null;
            });
        }
    }, [isOpen]);

    const updateProvider = (id: string, patch: Partial<Provider>) => {
        setProviders(prev => {
            const next = prev.map(p => p.id === id ? { ...p, ...patch } : p);
            const target = next.find(p => p.id === id);
            if (target) upsertProvider(target);
            return next;
        });
    };

    const handleAddProviderFromTemplate = (type: Exclude<ProviderType, 'global'>, customName?: string) => {
        const created = createProviderFromTemplate(type, customName);
        setProviders(loadProviders());
        setSelectedProviderId(created.id);
        setShowAddProvider(false);
    };

    const handleDeleteProvider = (id: string) => {
        const target = providers.find(p => p.id === id);
        if (!target || target.isBuiltin) return;
        if (!confirm(`确定要删除服务商 「${target.name}」 吗？`)) return;
        const next = deleteProviderInStore(id);
        setProviders(next);
        if (selectedProviderId === id) {
            setSelectedProviderId(next[0]?.id || null);
        }
    };

    const handleProviderTest = async (provider: Provider) => {
        setProviderTesting(prev => new Set(prev).add(provider.id));
        setProviderTestResults(prev => ({ ...prev, [provider.id]: null }));
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
            const result = await testProviderConnection(provider, controller.signal);
            setProviderTestResults(prev => ({ ...prev, [provider.id]: result }));
        } finally {
            clearTimeout(timeout);
            setProviderTesting(prev => {
                const next = new Set(prev);
                next.delete(provider.id);
                return next;
            });
        }
    };

    const handleRemoveModel = (providerId: string, modelId: string) => {
        removeModelFromProvider(providerId, modelId);
        setProviders(loadProviders());
    };

    const handleOpenFetchModels = async (provider: Provider) => {
        setFetchModelsState({
            providerId: provider.id,
            loading: true,
            models: [],
            selected: new Set(),
            search: '',
        });
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        let result: { ok: boolean; models?: ProviderModel[]; error?: string };
        try {
            result = await fetchProviderModels(provider, controller.signal);
        } catch (e: any) {
            result = { ok: false, models: [], error: e.message || '获取模型失败' };
        } finally {
            clearTimeout(timeout);
        }
        setFetchModelsState(prev => prev ? {
            ...prev,
            loading: false,
            error: result.ok ? undefined : (result.error || '获取模型失败'),
            models: result.models || [],
            // 默认勾选未被添加过的项
            selected: new Set((result.models || []).filter(m => !provider.models.some(pm => pm.id === m.id)).map(m => m.id)),
        } : null);
    };

    const handleConfirmFetchedModels = () => {
        if (!fetchModelsState) return;
        const { providerId, models, selected } = fetchModelsState;
        const toAdd = models.filter(m => selected.has(m.id));
        addModelsToProvider(providerId, toAdd);
        setProviders(loadProviders());
        setFetchModelsState(null);
    };

    const providerModelOptions = useMemo(() => {
        return providers
            .filter(provider => provider.enabled)
            .flatMap(provider => provider.models.map(model => ({
                provider,
                model,
                value: `${provider.id}::${model.id}`,
                label: `${model.name || model.id} | ${provider.name}`,
            })));
    }, [providers]);

    const getCategoryModelOptions = (category: ModelServiceCategory) => {
        return providerModelOptions.filter(item => {
            const type = (item.model.type || '').toLowerCase();
            const id = item.model.id.toLowerCase();
            if (category === 'IMAGE') return !type || type.includes('image') || id.includes('image') || id.includes('flux') || id.includes('seedream') || id.includes('gpt-image');
            if (category === 'VIDEO') return !type || type.includes('video') || id.includes('video') || id.includes('veo') || id.includes('sora') || id.includes('kling') || id.includes('wan') || id.includes('seedance');
            if (category === 'TEXT') return !type || type.includes('chat') || type.includes('text') || id.includes('gpt') || id.includes('claude') || id.includes('gemini') || id.includes('deepseek') || id.includes('qwen');
            if (category === 'AUDIO') return type.includes('audio') || id.includes('audio') || id.includes('tts') || id.includes('speech');
            return true;
        });
    };

    const handleAddModelServiceBinding = (category: ModelServiceCategory) => {
        const value = modelServiceSelections[category];
        if (!value) return;
        const [providerId, ...modelParts] = value.split('::');
        const modelId = modelParts.join('::');
        const provider = providers.find(p => p.id === providerId);
        const model = provider?.models.find(m => m.id === modelId);
        if (!provider || !model) return;
        const binding = upsertModelServiceBinding({
            category,
            slotKey: modelServiceSlotSelections[category],
            providerId,
            modelId,
            name: model.name || model.id,
        });
        const syncedBindings = syncAllModelServiceBindingsToRegistry();
        setModelServiceBindings(syncedBindings);
        const syncedBinding = syncedBindings.find(item => item.id === binding.id) || binding;
        if (syncedBinding.registryKey) {
            setConfigs(prev => ({ ...prev, [syncedBinding.registryKey!]: getModelConfig(syncedBinding.registryKey!) }));
            setExpandedModels(prev => new Set(prev).add(syncedBinding.registryKey!));
        }
        setModelServiceSelections(prev => ({ ...prev, [category]: '' }));
    };

    const handleRemoveModelServiceBinding = (id: string) => {
        setModelServiceBindings(deleteModelServiceBinding(id));
    };

    // 样式令牌
    const surface = isDark ? 'bg-[#101013]' : 'bg-white';
    const surfaceSoft = isDark ? 'bg-[#16161a]' : 'bg-slate-50';
    const surfaceCard = isDark ? 'bg-[#16161a]' : 'bg-white';
    const borderColor = isDark ? 'border-white/10' : 'border-gray-200';
    const borderSoft = isDark ? 'border-white/5' : 'border-gray-100';
    const textMain = isDark ? 'text-white' : 'text-gray-900';
    const textSub = isDark ? 'text-gray-400' : 'text-gray-500';
    const textMuted = isDark ? 'text-gray-600' : 'text-gray-400';
    const inputBg = isDark ? 'bg-[#0e0e10]' : 'bg-slate-50';
    const inputBase = `rounded-xl text-sm border ${borderColor} ${inputBg} ${textMain} outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/60 transition-all`;
    const ghostButton = isDark
        ? 'bg-white/5 hover:bg-white/10 text-gray-200 border border-white/10'
        : 'bg-white hover:bg-slate-50 text-gray-700 border border-gray-200';

    if (!isOpen) return null;

    const navItems: { key: SettingsSection; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; description: string }[] = [
        { key: 'endpoint', label: '服务商', icon: Icons.Globe, description: '多服务商管理 + 多 Key' },
        { key: 'models', label: '模型管理', icon: Icons.Cpu, description: '各模型接口单独配置' },
        { key: 'storage', label: '存储与缓存', icon: Icons.FolderOpen, description: '下载目录、本地存储、缓存' },
        { key: 'data', label: '数据', icon: Icons.Database, description: '配置的导入与导出' },
        { key: 'about', label: '关于', icon: Icons.Info, description: '版本与帮助' },
    ];

    const renderEndpoint = () => {
        const selected = providers.find(p => p.id === selectedProviderId) || null;
        return (
            <div className="flex flex-col h-full">
                <div className="shrink-0 mb-5">
                    <SectionHeader title="服务商" subtitle="为不同供应商配置接口地址与 Key，模型可选择走哪个服务商。" isDark={isDark} />
                </div>

                <div className={`flex-1 min-h-0 grid grid-cols-[190px_1fr] gap-5`}>
                    {/* Provider list */}
                    <div className={`rounded-2xl border ${borderColor} ${surfaceCard} overflow-hidden flex flex-col`}>
                        <div className="flex-1 overflow-y-auto p-2">
                            <div className="space-y-1">
                                {providers.map(p => {
                                    const active = p.id === selectedProviderId;
                                    const ready = !!p.baseUrl && !!p.apiKey;
                                    return (
                                        <button
                                            key={p.id}
                                            onClick={() => setSelectedProviderId(p.id)}
                                            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-left transition-all border ${
                                                active
                                                    ? (isDark ? 'bg-blue-500/15 text-blue-200 border-blue-400/20' : 'bg-blue-50 text-blue-700 border-blue-200')
                                                    : `border-transparent ${textSub} ${isDark ? 'hover:bg-white/5 hover:text-white' : 'hover:bg-white hover:text-gray-900'}`
                                            }`}
                                        >
                                            <span className={`w-2 h-2 rounded-full ${
                                                !p.enabled ? (isDark ? 'bg-zinc-700' : 'bg-gray-300')
                                                : ready ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]'
                                                : (isDark ? 'bg-amber-400/70' : 'bg-amber-400')
                                            }`} />
                                            <span className={`flex-1 truncate text-sm font-medium ${!p.enabled ? 'opacity-60' : ''}`}>{p.name}</span>
                                            {p.isBuiltin && (
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded-md ${isDark ? 'bg-white/5 text-gray-400' : 'bg-slate-100 text-gray-500'}`}>内置</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div className={`p-2 border-t ${borderSoft}`}>
                            <button
                                onClick={() => setShowAddProvider(true)}
                                className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all ${ghostButton} hover:border-blue-500/50`}
                            >
                                <Icons.Plus size={14} /> 添加服务商
                            </button>
                        </div>
                    </div>

                    {/* Provider detail */}
                    <div className={`rounded-2xl border ${borderColor} ${surfaceCard} overflow-hidden flex flex-col`}>
                        {selected ? (
                            <ProviderDetail
                                provider={selected}
                                isDark={isDark}
                                inputBase={inputBase}
                                ghostButton={ghostButton}
                                textMain={textMain}
                                textSub={textSub}
                                textMuted={textMuted}
                                borderColor={borderColor}
                                borderSoft={borderSoft}
                                surfaceSoft={surfaceSoft}
                                onPatch={(patch) => updateProvider(selected.id, patch)}
                                onDelete={() => handleDeleteProvider(selected.id)}
                                onTest={() => handleProviderTest(selected)}
                                testing={providerTesting.has(selected.id)}
                                testResult={providerTestResults[selected.id]}
                                onRemoveModel={(modelId) => handleRemoveModel(selected.id, modelId)}
                                onFetchModels={() => handleOpenFetchModels(selected)}
                            />
                        ) : (
                            <div className={`h-full flex items-center justify-center ${textMuted} text-sm`}>请选择一个服务商</div>
                        )}
                    </div>
                </div>

                {/* Fetch models picker */}
                {fetchModelsState && (() => {
                    const targetProvider = providers.find(p => p.id === fetchModelsState.providerId);
                    if (!targetProvider) return null;
                    const filtered = fetchModelsState.search
                        ? fetchModelsState.models.filter(m => m.id.toLowerCase().includes(fetchModelsState.search.toLowerCase()) || (m.name || '').toLowerCase().includes(fetchModelsState.search.toLowerCase()))
                        : fetchModelsState.models;
                    const selectedCount = fetchModelsState.selected.size;
                    const allFilteredSelected = filtered.length > 0 && filtered.every(m => fetchModelsState.selected.has(m.id));
                    return (
                        <div className="fixed inset-0 z-[270] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setFetchModelsState(null)}>
                            <div
                                className={`w-full max-w-xl rounded-2xl ${surfaceCard} border ${borderColor} shadow-2xl flex flex-col max-h-[80vh]`}
                                onClick={e => e.stopPropagation()}
                            >
                                <div className={`px-6 py-4 border-b ${borderSoft} flex items-center justify-between shrink-0`}>
                                    <div>
                                        <div className={`text-base font-bold ${textMain}`}>从「{targetProvider.name}」拉取模型</div>
                                        <div className={`text-xs mt-0.5 ${textSub}`}>选择要添加到该服务商的模型</div>
                                    </div>
                                    <button
                                        onClick={() => setFetchModelsState(null)}
                                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isDark ? 'hover:bg-white/10 text-gray-300' : 'hover:bg-slate-100 text-gray-500'}`}
                                    >
                                        <Icons.X size={16} />
                                    </button>
                                </div>

                                <div className="flex-1 overflow-hidden flex flex-col px-6 py-4 min-h-0">
                                    {fetchModelsState.loading ? (
                                        <div className={`flex-1 flex items-center justify-center gap-2 ${textSub}`}>
                                            <Icons.Loader2 size={16} className="animate-spin" />
                                            <span className="text-sm">正在拉取...</span>
                                        </div>
                                    ) : fetchModelsState.error ? (
                                        <div className={`flex-1 flex flex-col items-center justify-center gap-2 px-2 ${textSub}`}>
                                            <Icons.AlertCircle size={28} className="text-red-500" />
                                            <span className="text-sm text-center whitespace-pre-wrap break-words max-h-40 overflow-y-auto">{fetchModelsState.error}</span>
                                            <button
                                                onClick={() => handleOpenFetchModels(targetProvider)}
                                                className={`mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold ${ghostButton}`}
                                            >重试</button>
                                        </div>
                                    ) : fetchModelsState.models.length === 0 ? (
                                        <div className={`flex-1 flex items-center justify-center text-sm text-center ${textSub}`}>未拉取到模型，请检查服务商接口或重新获取模型。</div>
                                    ) : (
                                        <>
                                            <div className="flex items-center gap-2 mb-3 shrink-0">
                                                <div className="flex-1 relative">
                                                    <Icons.Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 ${textMuted}`} />
                                                    <input
                                                        value={fetchModelsState.search}
                                                        onChange={e => setFetchModelsState(prev => prev ? { ...prev, search: e.target.value } : null)}
                                                        placeholder="搜索..."
                                                        className={`w-full pl-9 pr-3 py-2 ${inputBase}`}
                                                    />
                                                </div>
                                                <button
                                                    onClick={() => setFetchModelsState(prev => {
                                                        if (!prev) return null;
                                                        const next = new Set(prev.selected);
                                                        if (allFilteredSelected) filtered.forEach(m => next.delete(m.id));
                                                        else filtered.forEach(m => next.add(m.id));
                                                        return { ...prev, selected: next };
                                                    })}
                                                    className={`px-3 py-2 rounded-xl text-xs font-semibold ${ghostButton}`}
                                                >
                                                    {allFilteredSelected ? '全不选' : '全选'}
                                                </button>
                                            </div>

                                            <div className="flex-1 overflow-y-auto pr-1 space-y-1.5">
                                                {filtered.map(m => {
                                                    const checked = fetchModelsState.selected.has(m.id);
                                                    const exists = targetProvider.models.some(pm => pm.id === m.id);
                                                    return (
                                                        <label
                                                            key={m.id}
                                                            className={`flex items-center gap-3 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${borderColor} ${
                                                                checked
                                                                    ? (isDark ? 'bg-blue-500/10 border-blue-400/30' : 'bg-blue-50 border-blue-200')
                                                                    : surfaceSoft
                                                            }`}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={checked}
                                                                onChange={() => setFetchModelsState(prev => {
                                                                    if (!prev) return null;
                                                                    const next = new Set(prev.selected);
                                                                    if (next.has(m.id)) next.delete(m.id);
                                                                    else next.add(m.id);
                                                                    return { ...prev, selected: next };
                                                                })}
                                                                className="w-4 h-4 accent-blue-500"
                                                            />
                                                            <div className="flex-1 min-w-0">
                                                                <div className={`text-xs font-mono truncate ${textMain}`}>{m.id}</div>
                                                                {m.name && m.name !== m.id && (
                                                                    <div className={`text-[10px] truncate ${textMuted}`}>{m.name}</div>
                                                                )}
                                                            </div>
                                                            {exists && (
                                                                <span className={`text-[9px] px-1.5 py-0.5 rounded-md ${isDark ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-50 text-emerald-600'}`}>已添加</span>
                                                            )}
                                                        </label>
                                                    );
                                                })}
                                                {filtered.length === 0 && (
                                                    <div className={`text-center py-6 text-xs ${textMuted}`}>没有匹配的模型</div>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>

                                <div className={`px-6 py-3 border-t ${borderSoft} flex items-center justify-between shrink-0`}>
                                    <span className={`text-xs ${textSub}`}>已选 {selectedCount} 个</span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setFetchModelsState(null)}
                                            className={`px-4 py-2 rounded-xl text-xs font-medium ${ghostButton}`}
                                        >取消</button>
                                        <button
                                            onClick={handleConfirmFetchedModels}
                                            disabled={selectedCount === 0 || fetchModelsState.loading}
                                            className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-500 text-white hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >添加 {selectedCount} 个</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* Add provider modal */}
                {showAddProvider && (
                    <div className="fixed inset-0 z-[265] flex items-center justify-center bg-black/50" onClick={() => setShowAddProvider(false)}>
                        <div
                            className={`w-full max-w-lg p-6 rounded-2xl ${surfaceCard} border ${borderColor} shadow-2xl`}
                            onClick={e => e.stopPropagation()}
                        >
                            <h3 className={`text-lg font-bold mb-1 ${textMain}`}>添加服务商</h3>
                            <p className={`text-xs mb-5 ${textSub}`}>选择一个预设模板快速创建，或选「自定义」手动填写。</p>
                            <div className="grid grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto">
                                {(Object.keys(PROVIDER_TEMPLATES) as Array<Exclude<ProviderType, 'global'>>).map(type => {
                                    const tpl = PROVIDER_TEMPLATES[type];
                                    return (
                                        <button
                                            key={type}
                                            onClick={() => handleAddProviderFromTemplate(type)}
                                            className={`p-3 rounded-xl border ${borderColor} text-left transition-all hover:-translate-y-0.5 ${surfaceSoft} hover:border-blue-500/50`}
                                        >
                                            <div className={`text-sm font-semibold ${textMain}`}>{tpl.name}</div>
                                            {tpl.description && (
                                                <div className={`text-[11px] mt-1 ${textSub} line-clamp-2`}>{tpl.description}</div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="flex justify-end mt-5">
                                <button
                                    onClick={() => setShowAddProvider(false)}
                                    className={`px-4 py-2 rounded-xl text-sm font-medium ${ghostButton}`}
                                >取消</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderModels = () => {
        const categoryIconMap: Record<ModelServiceCategory, React.ComponentType<{ size?: number; className?: string }>> = {
            TEXT: Icons.FileText,
            IMAGE: Icons.Image,
            AUDIO: Icons.Wand2,
            VIDEO: Icons.Video,
        };

        const categoryToneMap: Record<ModelServiceCategory, string> = {
            TEXT: isDark ? 'bg-blue-500/10 text-blue-300' : 'bg-blue-50 text-blue-600',
            IMAGE: isDark ? 'bg-emerald-500/10 text-emerald-300' : 'bg-emerald-50 text-emerald-600',
            AUDIO: isDark ? 'bg-amber-500/10 text-amber-300' : 'bg-amber-50 text-amber-600',
            VIDEO: isDark ? 'bg-purple-500/10 text-purple-300' : 'bg-purple-50 text-purple-600',
        };

        return (
            <div className="space-y-5">
                <SectionHeader title="模型管理" subtitle="把服务商获取到的模型绑定成文本、图像、音频、视频枚举；图像/视频会同步到画布模型下拉。" isDark={isDark} />

                <div className={`rounded-2xl border ${borderColor} ${surfaceCard} overflow-hidden`}>
                    <div className={`px-5 py-4 border-b ${borderSoft}`}>
                        <div className={`text-base font-bold ${textMain}`}>模型服务</div>
                        <div className={`text-xs mt-1 ${textSub}`}>先在「服务商」中获取模型，再在这里按能力类型绑定。</div>
                    </div>

                    <div className={`px-5 pt-4 pb-2 border-b ${borderSoft}`}>
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {MODEL_SERVICE_CATEGORIES.map(cat => {
                                const TabIcon = categoryIconMap[cat.key];
                                const isActive = activeModelCategory === cat.key;
                                const count = modelServiceBindings.filter(item => item.category === cat.key).length;
                                return (
                                    <button
                                        key={cat.key}
                                        onClick={() => setActiveModelCategory(cat.key)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                                            isActive
                                                ? `${categoryToneMap[cat.key]} border-transparent`
                                                : `${borderColor} ${textSub} ${isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`
                                        }`}
                                    >
                                        <TabIcon size={13} />
                                        <span>{cat.label}</span>
                                        {count > 0 && (
                                            <span className={`min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full text-[10px] ${isActive ? (isDark ? 'bg-white/20' : 'bg-white') : (isDark ? 'bg-white/10' : 'bg-slate-100')}`}>
                                                {count}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="divide-y divide-gray-200/10">
                        {MODEL_SERVICE_CATEGORIES.filter(category => category.key === activeModelCategory).map(category => {
                            const Icon = categoryIconMap[category.key];
                            const options = getCategoryModelOptions(category.key);
                            const bindings = modelServiceBindings.filter(item => item.category === category.key);
                            const selected = modelServiceSelections[category.key];
                            const slots = getModelServiceSlots(category.key);
                            const selectedSlot = modelServiceSlotSelections[category.key];

                            return (
                                <div key={category.key} className="px-5 py-4 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <span className={`w-8 h-8 rounded-xl flex items-center justify-center ${categoryToneMap[category.key]}`}>
                                            <Icon size={15} />
                                        </span>
                                        <div className="flex-1">
                                            <div className={`text-sm font-bold ${textMain}`}>{category.label}</div>
                                            <div className={`text-[11px] ${textMuted}`}>{category.description}</div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <select
                                            value={selectedSlot}
                                            onChange={e => setModelServiceSlotSelections(prev => ({ ...prev, [category.key]: e.target.value }))}
                                            className={`w-44 px-4 py-2.5 ${inputBase}`}
                                        >
                                            {slots.map(slot => (
                                                <option key={slot.key} value={slot.key}>
                                                    {slot.name}
                                                </option>
                                            ))}
                                        </select>
                                        <select
                                            value={selected}
                                            onChange={e => setModelServiceSelections(prev => ({ ...prev, [category.key]: e.target.value }))}
                                            className={`flex-1 px-4 py-2.5 ${inputBase}`}
                                        >
                                            <option value="">未选择模型</option>
                                            {options.map(item => (
                                                <option key={item.value} value={item.value}>
                                                    {item.label}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            onClick={() => handleAddModelServiceBinding(category.key)}
                                            disabled={!selected}
                                            className={`w-10 h-10 rounded-xl flex items-center justify-center ${ghostButton} hover:border-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed`}
                                            title="添加到枚举"
                                        >
                                            <Icons.Plus size={16} />
                                        </button>
                                    </div>

                                    {options.length === 0 && (
                                        <div className={`text-xs ${textMuted}`}>
                                            暂无可选模型。请先到「服务商」中获取模型。
                                        </div>
                                    )}

                                    {bindings.length > 0 && (
                                        <div className="space-y-2">
                                            {bindings.map(binding => {
                                                const provider = providers.find(p => p.id === binding.providerId);
                                                const connected = binding.category === 'TEXT' || binding.category === 'IMAGE' || binding.category === 'VIDEO';
                                                return (
                                                    <div
                                                        key={binding.id}
                                                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${borderColor} ${surfaceSoft}`}
                                                    >
                                                        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                                                        <div className="min-w-0 w-44">
                                                            <div className={`text-sm font-semibold truncate ${textMain}`}>{binding.name}</div>
                                                            <div className={`text-[11px] truncate ${textMuted}`}>
                                                                {provider?.name || '未知服务商'} · {binding.modelId}
                                                            </div>
                                                        </div>
                                                        <div className={`hidden sm:flex flex-col min-w-[112px] px-2.5 py-1.5 rounded-lg border ${borderColor} ${isDark ? 'bg-white/5' : 'bg-blue-50'}`}>
                                                            <span className={`text-[10px] ${textMuted}`}>模型映射</span>
                                                            <span className={`text-xs font-semibold whitespace-nowrap ${isDark ? 'text-blue-300' : 'text-blue-600'}`}>{getModelServiceDisplayName(binding.category, binding.name, binding.slotKey)}</span>
                                                        </div>
                                                        <span className={`text-[10px] px-2 py-1 rounded-lg ${connected ? (isDark ? 'bg-emerald-500/10 text-emerald-300' : 'bg-emerald-50 text-emerald-600') : (isDark ? 'bg-amber-500/10 text-amber-300' : 'bg-amber-50 text-amber-600')}`}>
                                                            {connected ? '已接入' : '预留'}
                                                        </span>
                                                        {binding.registryKey && (
                                                            <button
                                                                onClick={() => toggleExpand(binding.registryKey!)}
                                                                className={`px-2 py-1 rounded-lg text-xs ${textSub} ${isDark ? 'hover:bg-white/5 hover:text-white' : 'hover:bg-white hover:text-gray-900'}`}
                                                            >
                                                                配置
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleRemoveModelServiceBinding(binding.id)}
                                                            className={`p-1.5 rounded-lg ${textMuted} ${isDark ? 'hover:bg-red-500/10 hover:text-red-400' : 'hover:bg-red-50 hover:text-red-500'}`}
                                                            title="移除枚举"
                                                        >
                                                            <Icons.Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {modelServiceBindings.filter(item => item.registryKey && expandedModels.has(item.registryKey)).map(binding => {
                    const key = binding.registryKey!;
                    const def = MODEL_REGISTRY[key];
                    const config = configs[key] || getModelConfig(key);
                    if (!def) return null;
                    const provider = config.providerId ? providers.find(p => p.id === config.providerId) : null;
                    return (
                        <div key={key} className={`rounded-2xl border ${borderColor} ${surfaceCard} p-5 space-y-4`}>
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className={`text-sm font-bold ${textMain}`}>{def.name}</div>
                                    <div className={`text-xs ${textMuted}`}>{key}</div>
                                </div>
                                <button
                                    onClick={() => toggleExpand(key)}
                                    className={`p-2 rounded-lg ${textMuted} ${isDark ? 'hover:bg-white/5 hover:text-white' : 'hover:bg-slate-100 hover:text-gray-900'}`}
                                >
                                    <Icons.X size={14} />
                                </button>
                            </div>
                            <div className="flex items-center gap-4">
                                <label className={`w-24 text-xs font-medium uppercase ${textSub} shrink-0 text-right`}>服务商</label>
                                <select
                                    value={config.providerId || ''}
                                    onChange={e => updateConfig(key, 'providerId', e.target.value)}
                                    className={`flex-1 px-4 py-2.5 ${inputBase}`}
                                >
                                    <option value="">默认（使用全局或下方填写）</option>
                                    {providers.map(p => (
                                        <option key={p.id} value={p.id} disabled={!p.enabled}>
                                            {p.name}{!p.enabled ? '（已停用）' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            {(['modelId', 'key', 'baseUrl', 'endpoint'] as const).map(field => (
                                <div key={field} className="flex items-center gap-4">
                                    <label className={`w-24 text-xs font-medium uppercase ${textSub} shrink-0 text-right`}>
                                        {field === 'modelId' ? 'Model ID' : field === 'key' ? 'API Key' : field === 'baseUrl' ? 'Base URL' : 'Endpoint'}
                                    </label>
                                    <input
                                        type={field === 'key' ? 'password' : 'text'}
                                        value={(config as any)[field] || ''}
                                        onChange={e => updateConfig(key, field, e.target.value)}
                                        className={`flex-1 px-4 py-2.5 ${inputBase}`}
                                        placeholder={
                                            field === 'modelId' ? def.id
                                            : field === 'key' ? (provider?.apiKey ? `使用 ${provider.name} 的 Key` : (globalApiKey ? '使用全局 KEY' : 'sk-...'))
                                            : field === 'baseUrl' ? (provider?.baseUrl || globalBaseUrl || 'https://api.example.com')
                                            : (def.defaultEndpoint || '/v1/chat/completions')
                                        }
                                    />
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderData = () => (
        <div className="space-y-5">
            <SectionHeader title="数据" subtitle="导入或导出全局接口与模型配置，方便在不同设备间同步。" isDark={isDark} />

            <div className={`rounded-2xl border ${borderColor} ${surfaceCard} p-5 space-y-4`}>
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? 'bg-blue-500/15 text-blue-300' : 'bg-blue-50 text-blue-600'}`}>
                        <Icons.Database size={18} />
                    </div>
                    <div className="flex-1">
                        <div className={`text-sm font-semibold ${textMain}`}>配置文件</div>
                        <div className={`text-xs ${textSub}`}>已配置 {Object.keys(configs).filter(k => isConfigured(k)).length} / {Object.keys(MODEL_REGISTRY).length} 个模型</div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => configInputRef.current?.click()}
                        className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 ${ghostButton}`}
                    >
                        <Icons.Upload size={14} /> 导入配置
                    </button>
                    <button
                        onClick={handleExport}
                        className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 ${ghostButton}`}
                    >
                        <Icons.Download size={14} /> 导出配置
                    </button>
                    <input type="file" ref={configInputRef} hidden accept=".json" onChange={handleImport} />
                </div>
            </div>
        </div>
    );

    const renderAbout = () => (
        <div className="space-y-5">
            <SectionHeader title="关于" subtitle="了解项目信息与获取帮助。" isDark={isDark} />

            <div className={`rounded-2xl border ${borderColor} ${surfaceCard} p-5 space-y-4`}>
                <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isDark ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-50 text-emerald-600'}`}>
                        <Icons.Sparkles size={22} />
                    </div>
                    <div className="flex-1">
                        <div className={`text-base font-bold ${textMain}`}>TideCanvas</div>
                        <div className={`text-xs ${textSub}`}>开启你的 AI 创意之旅</div>
                    </div>
                </div>
                <div className={`text-xs leading-6 ${textSub}`}>
                    不同 API 中转商的接口参数可能不同，本项目依靠你填写的 Base URL / Endpoint 交互。
                    如遇不兼容，可参考 README 或使用 AI 编辑器调整代码。
                </div>
            </div>
        </div>
    );

    const renderActiveSection = () => {
        switch (activeSection) {
            case 'endpoint': return renderEndpoint();
            case 'models': return renderModels();
            case 'storage': return <StorageSection isDark={isDark} active={activeSection === 'storage'} />;
            case 'data': return renderData();
            case 'about': return renderAbout();
            default: return null;
        }
    };

    const modal = (
        <div
            className={`fixed inset-0 z-[250] flex items-center justify-center p-4 ${isDark ? 'bg-black/65' : 'bg-slate-900/40'} backdrop-blur-md`}
            onClick={onClose}
        >
            <div
                className={`w-[min(1080px,94vw)] h-[min(720px,90vh)] rounded-3xl overflow-hidden shadow-2xl border ${borderColor} ${surface} flex flex-col`}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className={`px-6 py-4 border-b ${borderSoft} flex items-center justify-between shrink-0 ${surface}`}>
                    <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-2xl flex items-center justify-center ${isDark ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-50 text-blue-600'}`}>
                            <Icons.Settings size={18} />
                        </div>
                        <div>
                            <div className={`text-base font-bold ${textMain}`}>设置中心</div>
                            <div className={`text-xs ${textSub}`}>接口、模型与数据集中管理</div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${isDark ? 'hover:bg-white/10 text-gray-300' : 'hover:bg-slate-100 text-gray-500'}`}
                        aria-label="关闭"
                    >
                        <Icons.X size={18} />
                    </button>
                </div>

                {/* Body: side nav + content */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Side nav */}
                    <aside className={`w-48 shrink-0 border-r ${borderSoft} ${isDark ? 'bg-[#0c0c0e]' : 'bg-slate-50/60'} p-3 overflow-y-auto`}>
                        <nav className="space-y-1">
                            {navItems.map(item => {
                                const Icon = item.icon;
                                const active = activeSection === item.key;
                                return (
                                    <button
                                        key={item.key}
                                        onClick={() => setActiveSection(item.key)}
                                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                                            active
                                                ? (isDark ? 'bg-blue-500/15 text-blue-200 border border-blue-400/20' : 'bg-blue-50 text-blue-700 border border-blue-100')
                                                : (isDark ? `${textSub} hover:bg-white/5 hover:text-white border border-transparent` : `${textSub} hover:bg-white hover:text-gray-900 border border-transparent`)
                                        }`}
                                    >
                                        <Icon size={16} className={active ? '' : textMuted} />
                                        <span className="font-medium">{item.label}</span>
                                    </button>
                                );
                            })}
                        </nav>
                    </aside>

                    {/* Content */}
                    <main className={`flex-1 min-h-0 flex flex-col ${isDark ? 'bg-[#0e0e10]' : 'bg-white'}`}>
                        {activeSection === 'endpoint' ? (
                            <div className="flex-1 min-h-0 px-6 py-5">
                                {renderActiveSection()}
                            </div>
                        ) : (
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                <div className="px-8 py-7 max-w-3xl">
                                    {renderActiveSection()}
                                </div>
                            </div>
                        )}
                    </main>
                </div>
            </div>

            {showAddModel && (
                <div
                    className="fixed inset-0 z-[260] flex items-center justify-center bg-black/50"
                    onClick={() => setShowAddModel(false)}
                >
                    <div
                        className={`w-full max-w-md p-6 rounded-2xl ${surfaceCard} border ${borderColor} shadow-2xl`}
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 className={`text-lg font-bold mb-6 ${textMain}`}>添加自定义模型</h3>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className={`text-[11px] font-semibold tracking-wider uppercase ${textSub}`}>模型名称</label>
                                <input
                                    type="text"
                                    value={newModelName}
                                    onChange={e => setNewModelName(e.target.value)}
                                    className={`w-full px-4 py-3 ${inputBase}`}
                                    placeholder="My Custom Model"
                                    autoFocus
                                />
                            </div>
                            <div className="space-y-2">
                                <label className={`text-[11px] font-semibold tracking-wider uppercase ${textSub}`}>模型 ID</label>
                                <input
                                    type="text"
                                    value={newModelId}
                                    onChange={e => setNewModelId(e.target.value)}
                                    className={`w-full px-4 py-3 ${inputBase}`}
                                    placeholder="custom-model-v1"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className={`text-[11px] font-semibold tracking-wider uppercase ${textSub}`}>模型类型</label>
                                <div className="flex gap-2">
                                    {(['IMAGE', 'VIDEO'] as const).map(type => (
                                        <button
                                            key={type}
                                            onClick={() => setNewModelType(type)}
                                            className={`flex-1 py-3 rounded-xl text-sm font-medium border transition-all ${
                                                newModelType === type
                                                    ? 'border-blue-500 bg-blue-500/10 text-blue-500'
                                                    : `${borderColor} ${textSub}`
                                            }`}
                                        >
                                            {type === 'IMAGE' ? '图像生成' : '视频生成'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setShowAddModel(false)}
                                className={`flex-1 py-3 rounded-xl text-sm font-medium ${ghostButton}`}
                            >
                                取消
                            </button>
                            <button
                                onClick={handleAddModel}
                                disabled={!newModelName || !newModelId}
                                className={`flex-1 py-3 rounded-xl text-sm font-semibold bg-blue-500 text-white hover:bg-blue-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                添加
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    return createPortal(modal, document.body);
};

const SectionHeader: React.FC<{ title: string; subtitle?: string; isDark: boolean }> = ({ title, subtitle, isDark }) => (
    <div>
        <div className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{title}</div>
        {subtitle && <div className={`mt-1 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{subtitle}</div>}
    </div>
);

interface ProviderDetailProps {
    provider: Provider;
    isDark: boolean;
    inputBase: string;
    ghostButton: string;
    textMain: string;
    textSub: string;
    textMuted: string;
    borderColor: string;
    borderSoft: string;
    surfaceSoft: string;
    onPatch: (patch: Partial<Provider>) => void;
    onDelete: () => void;
    onTest: () => void;
    testing: boolean;
    testResult?: { ok: boolean; error?: string } | null;
    onRemoveModel: (modelId: string) => void;
    onFetchModels: () => void;
}

const ProviderDetail: React.FC<ProviderDetailProps> = ({
    provider, isDark, inputBase, ghostButton,
    textMain, textSub, textMuted, borderColor, borderSoft, surfaceSoft,
    onPatch, onDelete, onTest, testing, testResult,
    onRemoveModel, onFetchModels,
}) => {
    const [showKey, setShowKey] = useState(false);
    const canFetch = !!provider.baseUrl && !!provider.apiKey;

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className={`px-5 py-4 border-b ${borderSoft} flex items-center gap-3 shrink-0`}>
                <div className="flex-1 min-w-0">
                    <input
                        value={provider.name}
                        onChange={e => onPatch({ name: e.target.value })}
                        className={`w-full bg-transparent text-base font-bold outline-none ${textMain}`}
                    />
                    <div className={`text-[11px] mt-0.5 ${textMuted}`}>
                        {provider.isBuiltin ? '内置服务商 · 模型默认回退到这里' : `类型：${provider.type}`}
                    </div>
                </div>
                <ToggleSwitch
                    checked={provider.enabled}
                    onChange={(v) => onPatch({ enabled: v })}
                    isDark={isDark}
                    label={provider.enabled ? '已启用' : '已停用'}
                />
                {!provider.isBuiltin && (
                    <button
                        onClick={onDelete}
                        className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-red-500/10 text-zinc-500 hover:text-red-400' : 'hover:bg-red-50 text-gray-400 hover:text-red-500'}`}
                        title="删除服务商"
                    >
                        <Icons.Trash2 size={14} />
                    </button>
                )}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* Base URL */}
                <div className="space-y-2">
                    <label className={`text-[11px] font-semibold tracking-wider uppercase ${textSub}`}>API 地址</label>
                    <input
                        type="text"
                        value={provider.baseUrl}
                        onChange={e => onPatch({ baseUrl: e.target.value })}
                        className={`w-full px-4 py-3 ${inputBase}`}
                        placeholder="https://api.example.com"
                    />
                    <p className={`text-xs ${textMuted}`}>只填根域名即可，调用时会自动拼接路径。</p>
                </div>

                {/* API Key */}
                <div className="space-y-2">
                    <label className={`text-[11px] font-semibold tracking-wider uppercase ${textSub}`}>API Key</label>
                    <div className="relative">
                        <input
                            type={showKey ? 'text' : 'password'}
                            value={provider.apiKey}
                            onChange={e => onPatch({ apiKey: e.target.value })}
                            className={`w-full px-4 py-3 pr-10 ${inputBase}`}
                            placeholder="sk-..."
                        />
                        <button
                            onClick={() => setShowKey(v => !v)}
                            className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md ${textMuted} ${isDark ? 'hover:bg-white/5 hover:text-gray-200' : 'hover:bg-slate-200 hover:text-gray-700'}`}
                            title={showKey ? '隐藏' : '显示'}
                        >
                            {showKey ? <Icons.EyeOff size={14} /> : <Icons.Eye size={14} />}
                        </button>
                    </div>
                </div>

                {/* Test connection */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={onTest}
                        disabled={testing || !canFetch}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                            testResult?.ok ? 'bg-emerald-500 text-white hover:bg-emerald-400'
                            : testResult && !testResult.ok ? 'bg-red-500 text-white hover:bg-red-400'
                            : 'bg-blue-500 text-white hover:bg-blue-400'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                        {testing ? <Icons.Loader2 size={13} className="animate-spin" />
                            : testResult?.ok ? <Icons.Check size={13} />
                            : testResult && !testResult.ok ? <Icons.AlertCircle size={13} />
                            : <Icons.Link size={13} />}
                        {testing ? '测试中...' : testResult?.ok ? '连接成功' : testResult && !testResult.ok ? '连接失败' : '测试连接 (Check)'}
                    </button>
                    {testResult && !testResult.ok && testResult.error && (
                        <span className="text-xs text-red-500 truncate">{testResult.error}</span>
                    )}
                </div>

                {/* Fetch models */}
                <div className={`pt-4 border-t ${borderSoft}`}>
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                            <label className={`text-[11px] font-semibold tracking-wider uppercase ${textSub}`}>模型</label>
                            <span className={`text-[10px] mt-0.5 ${textMuted}`}>共 {provider.models.length} 个，去「模型管理」中按分类绑定</span>
                        </div>
                        <button
                            onClick={onFetchModels}
                            disabled={!canFetch}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${ghostButton} hover:border-blue-500/50 disabled:opacity-50`}
                            title={!canFetch ? '请先填写 Base URL 与 API Key' : '从服务商接口拉取模型列表'}
                        >
                            <Icons.Download size={12} /> 获取模型
                        </button>
                    </div>
                </div>

                {/* Notes */}
                {provider.notes && (
                    <div className={`text-xs leading-5 ${textMuted}`}>
                        {provider.notes}
                    </div>
                )}
            </div>
        </div>
    );
};

const ToggleSwitch: React.FC<{ checked: boolean; onChange: (v: boolean) => void; isDark: boolean; label?: string }> = ({ checked, onChange, isDark, label }) => (
    <button
        onClick={() => onChange(!checked)}
        className={`flex items-center gap-2 px-2 py-1 rounded-lg transition-colors ${isDark ? 'hover:bg-white/5' : 'hover:bg-slate-100'}`}
    >
        <span
            className={`relative w-8 h-[18px] rounded-full transition-colors ${
                checked
                    ? 'bg-emerald-500'
                    : (isDark ? 'bg-zinc-700' : 'bg-gray-300')
            }`}
        >
            <span className={`absolute top-0.5 left-0.5 w-[14px] h-[14px] rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[14px]' : ''}`} />
        </span>
        {label && (
            <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{label}</span>
        )}
    </button>
);
