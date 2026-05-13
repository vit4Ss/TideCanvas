import React, { useState, useEffect, useCallback } from 'react';
import { Icons } from '../Icons';
import { storageService, StorageStats, AppSettings } from '../../services/storageService';

interface StorageSectionProps {
    isDark: boolean;
    active: boolean;
}

type TabType = 'storage' | 'cache' | 'settings';

export const StorageSection: React.FC<StorageSectionProps> = ({ isDark, active }) => {
    const [activeTab, setActiveTab] = useState<TabType>('storage');

    const [storageDir, setStorageDir] = useState<string | null>(null);
    const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
    const [cacheStats, setCacheStats] = useState<{ count: number; totalSize: number; byType: Record<string, number> } | null>(null);
    const [settings, setSettings] = useState<AppSettings | null>(null);

    const [isClearing, setIsClearing] = useState(false);
    const [clearingType, setClearingType] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        const [dir, stats, cache, appSettings] = await Promise.all([
            storageService.getDownloadDirectoryName(),
            storageService.getStorageStats(),
            storageService.getCacheStats(),
            Promise.resolve(storageService.getSettings()),
        ]);
        setStorageDir(dir);
        setStorageStats(stats);
        setCacheStats(cache);
        setSettings(appSettings);
    }, []);

    useEffect(() => {
        if (active) loadData();
    }, [active, loadData]);

    const handleSetDirectory = async () => {
        const name = await storageService.setDownloadDirectory();
        if (name) setStorageDir(name);
    };

    const handleResetDirectory = async () => {
        await storageService.clearDownloadDirectory();
        setStorageDir(null);
    };

    const handleClearCache = async (type?: string) => {
        setIsClearing(true);
        setClearingType(type || 'all');
        try {
            if (type) await storageService.clearCache(type as any);
            else await storageService.clearAllData();
            await loadData();
        } finally {
            setIsClearing(false);
            setClearingType(null);
        }
    };

    const handleUpdateSetting = async (key: keyof AppSettings, value: any) => {
        if (!settings) return;
        setSettings({ ...settings, [key]: value });
        await storageService.saveSettings({ [key]: value });
    };

    const handleResetAllSettings = async () => {
        if (typeof window !== 'undefined' && window.confirm('确定要重置所有设置吗？这将恢复到默认配置。')) {
            await storageService.resetAllSettings();
            await loadData();
        }
    };

    const formatBytes = (bytes: number) => storageService.formatBytes(bytes);
    const formatPercent = (used: number, total: number) => (total > 0 ? ((used / total) * 100).toFixed(1) : '0');

    const borderColor = isDark ? 'border-white/10' : 'border-gray-200';
    const surfaceCard = isDark ? 'bg-[#16161a]' : 'bg-white';
    const surfaceSoft = isDark ? 'bg-[#0e0e10]' : 'bg-slate-50';
    const textMain = isDark ? 'text-white' : 'text-gray-900';
    const textSub = isDark ? 'text-gray-400' : 'text-gray-500';
    const textMuted = isDark ? 'text-gray-600' : 'text-gray-400';

    const buttonBase = 'inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 h-9 px-4 py-2';
    const buttonPrimary = isDark ? 'bg-blue-500 hover:bg-blue-400 text-white' : 'bg-blue-500 hover:bg-blue-400 text-white';
    const buttonOutline = isDark
        ? 'border border-white/15 bg-transparent hover:bg-white/5 text-gray-200'
        : 'border border-gray-200 bg-transparent hover:bg-slate-50 text-gray-700';
    const buttonDestructive = 'bg-red-500 text-white hover:bg-red-500/90';

    const tabListState = isDark ? 'bg-white/5 border border-white/10' : 'bg-slate-100 border border-gray-200';
    const tabTriggerState = (isActive: boolean) =>
        isActive
            ? isDark
                ? 'bg-[#1c1c20] text-white shadow-sm'
                : 'bg-white text-gray-900 shadow-sm'
            : isDark
                ? 'text-gray-400 hover:text-white'
                : 'text-gray-500 hover:text-gray-900';

    const renderStorageTab = () => (
        <div className="space-y-4">
            <div className={`p-4 rounded-2xl border ${borderColor} ${surfaceCard}`}>
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${isDark ? 'bg-white/5' : 'bg-slate-100'}`}>
                            <Icons.FolderOpen size={16} className={isDark ? 'text-gray-300' : 'text-gray-600'} />
                        </div>
                        <div>
                            <h3 className={`text-sm font-medium ${textMain}`}>下载目录</h3>
                            <p className={`text-xs mt-0.5 ${textMuted}`}>生成的图片和视频将保存到此位置</p>
                        </div>
                    </div>
                </div>

                <div className={`p-2.5 rounded-lg border ${borderColor} ${surfaceSoft} mb-4`}>
                    <div className="flex items-center gap-2">
                        <Icons.Folder size={14} className={textMuted} />
                        <span className={`text-xs font-mono truncate ${storageDir ? textMain : textMuted}`}>
                            {storageDir || '使用浏览器默认下载位置'}
                        </span>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button onClick={handleSetDirectory} className={`${buttonBase} ${buttonPrimary} flex-1`}>
                        {storageDir ? '更改目录' : '选择下载目录'}
                    </button>
                    {storageDir && (
                        <button onClick={handleResetDirectory} className={`${buttonBase} ${buttonOutline}`}>
                            重置
                        </button>
                    )}
                </div>

                {!storageService.isFileSystemAccessSupported() && (
                    <div className={`mt-3 p-2.5 rounded-lg text-xs border ${isDark ? 'bg-amber-500/10 border-amber-500/20 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                        <div className="flex items-center gap-2">
                            <Icons.AlertCircle size={14} />
                            <span>您的浏览器不支持文件系统访问 API，文件将使用默认下载方式</span>
                        </div>
                    </div>
                )}
            </div>

            <div className={`p-4 rounded-2xl border ${borderColor} ${surfaceCard}`}>
                <div className="flex items-center gap-3 mb-4">
                    <div className={`p-2 rounded-lg ${isDark ? 'bg-white/5' : 'bg-slate-100'}`}>
                        <Icons.Database size={16} className={isDark ? 'text-gray-300' : 'text-gray-600'} />
                    </div>
                    <div>
                        <h3 className={`text-sm font-medium ${textMain}`}>存储使用情况</h3>
                        <p className={`text-xs mt-0.5 ${textMuted}`}>应用占用的本地存储空间</p>
                    </div>
                </div>

                {storageStats && (
                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between text-xs mb-2">
                                <span className={textMain}>{formatBytes(storageStats.totalUsage)}</span>
                                <span className={textMuted}>{formatBytes(storageStats.indexedDBQuota)} 配额</span>
                            </div>
                            <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-white/5' : 'bg-slate-200'}`}>
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${isDark ? 'bg-blue-400' : 'bg-blue-500'}`}
                                    style={{ width: `${Math.min(100, parseFloat(formatPercent(storageStats.totalUsage, storageStats.indexedDBQuota)))}%` }}
                                />
                            </div>
                            <p className={`text-[10px] mt-1.5 ${textMuted} text-right`}>
                                已使用 {formatPercent(storageStats.totalUsage, storageStats.indexedDBQuota)}%
                            </p>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            <div className={`p-3 rounded-lg border ${borderColor} ${surfaceSoft}`}>
                                <p className={`text-[10px] uppercase tracking-wider ${textMuted}`}>IndexedDB</p>
                                <p className={`text-sm font-medium mt-1 ${textMain}`}>{formatBytes(storageStats.indexedDBUsage)}</p>
                            </div>
                            <div className={`p-3 rounded-lg border ${borderColor} ${surfaceSoft}`}>
                                <p className={`text-[10px] uppercase tracking-wider ${textMuted}`}>Cache API</p>
                                <p className={`text-sm font-medium mt-1 ${textMain}`}>{formatBytes(storageStats.cacheAPIUsage)}</p>
                            </div>
                            <div className={`p-3 rounded-lg border ${borderColor} ${surfaceSoft}`}>
                                <p className={`text-[10px] uppercase tracking-wider ${textMuted}`}>LocalStorage</p>
                                <p className={`text-sm font-medium mt-1 ${textMain}`}>{formatBytes(storageStats.localStorageUsage)}</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    const renderCacheTab = () => (
        <div className="space-y-4">
            <div className={`p-4 rounded-2xl border ${borderColor} ${surfaceCard}`}>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${isDark ? 'bg-white/5' : 'bg-slate-100'}`}>
                            <Icons.Layers size={16} className={isDark ? 'text-gray-300' : 'text-gray-600'} />
                        </div>
                        <div>
                            <h3 className={`text-sm font-medium ${textMain}`}>缓存管理</h3>
                            <p className={`text-xs mt-0.5 ${textMuted}`}>管理应用缓存以释放空间</p>
                        </div>
                    </div>
                    {cacheStats && (
                        <div className="text-right">
                            <p className={`text-lg font-semibold ${textMain}`}>{formatBytes(cacheStats.totalSize)}</p>
                            <p className={`text-[10px] ${textMuted}`}>{cacheStats.count} 个缓存条目</p>
                        </div>
                    )}
                </div>

                {cacheStats && (
                    <div className="space-y-2 mb-4">
                        {(Object.entries(cacheStats.byType) as Array<[string, number]>).map(([type, size]) => (
                            <div
                                key={type}
                                className={`flex items-center justify-between p-3 rounded-lg border ${borderColor} ${surfaceSoft}`}
                            >
                                <div className="flex items-center gap-2">
                                    {type === 'image' && <Icons.Image size={14} className={textSub} />}
                                    {type === 'video' && <Icons.Video size={14} className={textSub} />}
                                    {type === 'workflow' && <Icons.Folder size={14} className={textSub} />}
                                    {type === 'other' && <Icons.Database size={14} className={textSub} />}
                                    <span className={`text-xs font-medium ${textMain}`}>
                                        {type === 'image' ? '图片缓存' :
                                            type === 'video' ? '视频缓存' :
                                                type === 'workflow' ? '工作流缓存' : '其他缓存'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className={`text-xs font-mono ${textSub}`}>{formatBytes(size)}</span>
                                    <button
                                        onClick={() => handleClearCache(type)}
                                        disabled={isClearing}
                                        className={`p-1.5 rounded-md transition-colors ${isDark ? 'hover:bg-red-500/10 text-gray-400 hover:text-red-400' : 'hover:bg-red-50 text-gray-500 hover:text-red-600'} disabled:opacity-50`}
                                        title={`清除${type}缓存`}
                                    >
                                        {isClearing && clearingType === type ? (
                                            <Icons.Loader2 size={12} className="animate-spin" />
                                        ) : (
                                            <Icons.Trash2 size={12} />
                                        )}
                                    </button>
                                </div>
                            </div>
                        ))}

                        {Object.keys(cacheStats.byType).length === 0 && (
                            <div className={`text-center py-8 ${textMuted}`}>
                                <Icons.Check size={24} className="mx-auto mb-2 opacity-50" />
                                <p className="text-xs">缓存为空</p>
                            </div>
                        )}
                    </div>
                )}

                <button
                    onClick={() => handleClearCache()}
                    disabled={isClearing || (cacheStats?.count === 0)}
                    className={`${buttonBase} ${buttonDestructive} w-full`}
                >
                    {isClearing && clearingType === 'all' ? (
                        <Icons.Loader2 size={14} className="animate-spin mr-2" />
                    ) : (
                        <Icons.Trash2 size={14} className="mr-2" />
                    )}
                    清除所有缓存
                </button>
            </div>

            {settings && (
                <div className={`p-4 rounded-2xl border ${borderColor} ${surfaceCard}`}>
                    <h3 className={`text-sm font-medium mb-4 ${textMain}`}>缓存设置</h3>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className={`text-xs font-medium ${textMain}`}>启用缓存</p>
                                <p className={`text-[10px] ${textMuted}`}>缓存生成的内容以加快加载速度</p>
                            </div>
                            <button
                                onClick={() => handleUpdateSetting('cacheEnabled', !settings.cacheEnabled)}
                                className={`relative w-9 h-5 rounded-full transition-colors ${settings.cacheEnabled ? 'bg-emerald-500' : (isDark ? 'bg-white/10' : 'bg-gray-300')}`}
                            >
                                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${settings.cacheEnabled ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                            </button>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <p className={`text-xs font-medium ${textMain}`}>最大缓存大小</p>
                                <span className={`text-xs font-mono ${textSub}`}>{formatBytes(settings.maxCacheSize)}</span>
                            </div>
                            <input
                                type="range"
                                min={100 * 1024 * 1024}
                                max={2000 * 1024 * 1024}
                                step={100 * 1024 * 1024}
                                value={settings.maxCacheSize}
                                onChange={e => handleUpdateSetting('maxCacheSize', parseInt(e.target.value))}
                                className={`w-full h-1.5 rounded-full appearance-none cursor-pointer ${isDark ? 'bg-white/10 accent-blue-400' : 'bg-slate-200 accent-blue-500'}`}
                            />
                            <div className={`flex justify-between text-[10px] mt-1 ${textMuted}`}>
                                <span>100 MB</span>
                                <span>2 GB</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    const renderSettingsTab = () => (
        <div className="space-y-4">
            {settings && (
                <>
                    <div className={`p-4 rounded-2xl border ${borderColor} ${surfaceCard}`}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className={`p-2 rounded-lg ${isDark ? 'bg-white/5' : 'bg-slate-100'}`}>
                                <Icons.Save size={16} className={isDark ? 'text-gray-300' : 'text-gray-600'} />
                            </div>
                            <div>
                                <h3 className={`text-sm font-medium ${textMain}`}>自动保存</h3>
                                <p className={`text-xs mt-0.5 ${textMuted}`}>工作流自动保存设置</p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <div>
                                <p className={`text-xs font-medium ${textMain}`}>自动保存工作流</p>
                                <p className={`text-[10px] ${textMuted}`}>每隔一段时间自动保存当前工作流</p>
                            </div>
                            <button
                                onClick={() => handleUpdateSetting('autoSaveWorkflow', !settings.autoSaveWorkflow)}
                                className={`relative w-9 h-5 rounded-full transition-colors ${settings.autoSaveWorkflow ? 'bg-emerald-500' : (isDark ? 'bg-white/10' : 'bg-gray-300')}`}
                            >
                                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${settings.autoSaveWorkflow ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                            </button>
                        </div>
                    </div>

                    <div className={`p-4 rounded-2xl border ${borderColor} ${surfaceCard}`}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className={`p-2 rounded-lg ${isDark ? 'bg-white/5' : 'bg-slate-100'}`}>
                                <Icons.Image size={16} className={isDark ? 'text-gray-300' : 'text-gray-600'} />
                            </div>
                            <div>
                                <h3 className={`text-sm font-medium ${textMain}`}>输出质量</h3>
                                <p className={`text-xs mt-0.5 ${textMuted}`}>保存图片时的压缩质量</p>
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <p className={`text-xs font-medium ${textMain}`}>图片质量</p>
                                <span className={`text-xs font-mono ${textSub}`}>{Math.round(settings.imageQuality * 100)}%</span>
                            </div>
                            <input
                                type="range"
                                min={0.5}
                                max={1}
                                step={0.05}
                                value={settings.imageQuality}
                                onChange={e => handleUpdateSetting('imageQuality', parseFloat(e.target.value))}
                                className={`w-full h-1.5 rounded-full appearance-none cursor-pointer ${isDark ? 'bg-white/10 accent-blue-400' : 'bg-slate-200 accent-blue-500'}`}
                            />
                            <div className={`flex justify-between text-[10px] mt-1 ${textMuted}`}>
                                <span>50%（小文件）</span>
                                <span>100%（最高质量）</span>
                            </div>
                        </div>
                    </div>

                    <div className={`p-4 rounded-2xl border ${isDark ? 'border-red-500/20 bg-red-500/5' : 'border-red-200 bg-red-50'}`}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className={`p-2 rounded-lg ${isDark ? 'bg-red-500/10' : 'bg-red-100'}`}>
                                <Icons.AlertCircle size={16} className="text-red-500" />
                            </div>
                            <div>
                                <h3 className={`text-sm font-medium ${isDark ? 'text-red-300' : 'text-red-700'}`}>危险区域</h3>
                                <p className={`text-xs mt-0.5 ${isDark ? 'text-red-300/70' : 'text-red-600/80'}`}>重置所有设置到默认值</p>
                            </div>
                        </div>

                        <button
                            onClick={handleResetAllSettings}
                            className={`${buttonBase} w-full border ${isDark ? 'border-red-500/30 text-red-300 hover:bg-red-500/10' : 'border-red-200 text-red-600 hover:bg-red-100'}`}
                        >
                            重置所有设置
                        </button>
                    </div>
                </>
            )}
        </div>
    );

    return (
        <div className="space-y-5">
            <div>
                <div className={`text-xl font-bold ${textMain}`}>存储与缓存</div>
                <div className={`mt-1 text-sm ${textSub}`}>管理本地存储、缓存与应用偏好设置。</div>
            </div>

            <div className={`inline-flex rounded-xl p-1 ${tabListState}`}>
                {[
                    { id: 'storage' as TabType, label: '存储' },
                    { id: 'cache' as TabType, label: '缓存' },
                    { id: 'settings' as TabType, label: '偏好' },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${tabTriggerState(activeTab === tab.id)}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'storage' && renderStorageTab()}
            {activeTab === 'cache' && renderCacheTab()}
            {activeTab === 'settings' && renderSettingsTab()}
        </div>
    );
};

export default StorageSection;
