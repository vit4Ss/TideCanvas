import React, { useState, useEffect, useCallback, useRef } from 'react';
import { NodeData } from '../../types';
import { Icons } from '../Icons';
import { EditableTitle } from './Shared/NodeComponents';
import { getCanvasModelOptions, CanvasModelOption } from '../../services/modelService';

interface StoryboardRef {
  kind: 'text' | 'image';
  title: string;
  content: string;
  imageSrc?: string;
}
interface StoryboardNodeProps {
  data: NodeData;
  updateData: (id: string, updates: Partial<NodeData>) => void;
  onGenerate: (id: string) => void;
  storyboardUpstream?: StoryboardRef[];
  selected?: boolean;
  showControls?: boolean;
  isDark?: boolean;
}

export const StoryboardNode: React.FC<StoryboardNodeProps> = ({
    data, updateData, onGenerate, storyboardUpstream, selected, isDark = true
}) => {
    const refs = storyboardUpstream || [];
    const [textModels, setTextModels] = useState<CanvasModelOption[]>([]);
    const [showModelMenu, setShowModelMenu] = useState(false);
    const [copied, setCopied] = useState(false);
    const [progress, setProgress] = useState(0);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const refreshModels = useCallback(() => {
        const models = getCanvasModelOptions('TEXT');
        setTextModels(models);
        if (models.length > 0 && (!data.model || !models.some(m => m.value === data.model))) {
            updateData(data.id, { model: models[0].value });
        }
    }, [data.id, data.model, updateData]);

    useEffect(() => {
        refreshModels();
        window.addEventListener('modelRegistryUpdated', refreshModels);
        window.addEventListener('modelServiceUpdated', refreshModels);
        return () => {
            window.removeEventListener('modelRegistryUpdated', refreshModels);
            window.removeEventListener('modelServiceUpdated', refreshModels);
        };
    }, [refreshModels]);

    useEffect(() => {
        if (!showModelMenu) return;
        const onDoc = () => setShowModelMenu(false);
        window.addEventListener('click', onDoc);
        return () => window.removeEventListener('click', onDoc);
    }, [showModelMenu]);

    useEffect(() => {
        let interval: any;
        if (data.isLoading) {
            setProgress(0);
            interval = setInterval(() => {
                setProgress(prev => (prev >= 95 ? 95 : prev + Math.max(0.5, (95 - prev) / 18)));
            }, 220);
        } else {
            setProgress(0);
        }
        return () => clearInterval(interval);
    }, [data.isLoading]);

    const currentModel = textModels.find(m => m.value === data.model);
    const currentModelLabel = currentModel?.label || (textModels.length === 0 ? '未绑定文本模型' : '选择模型');

    const glassBg = isDark ? 'bg-[#1c1c1c]/85 backdrop-blur-xl' : 'bg-white/85 backdrop-blur-xl';
    const cardBorder = selected
        ? (isDark ? 'border-blue-400/50 ring-2 ring-blue-500/20' : 'border-blue-400/70 ring-2 ring-blue-100')
        : (isDark ? 'border-white/[0.06]' : 'border-zinc-200/70');
    const subBorder = isDark ? 'border-white/[0.05]' : 'border-zinc-100';
    const composerBorder = isDark ? 'border-white/[0.06]' : 'border-zinc-200/70';
    const textAreaText = isDark ? 'text-zinc-100 placeholder-zinc-600' : 'text-gray-900 placeholder-gray-400';
    const chipBg = isDark ? 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.06] text-zinc-300' : 'bg-zinc-50/80 hover:bg-white border-zinc-200/70 text-gray-700';
    const ghostText = isDark ? 'text-zinc-400' : 'text-gray-500';
    const muted = isDark ? 'text-zinc-500' : 'text-gray-400';
    const ghostIconBtn = isDark ? 'text-zinc-400 hover:text-white hover:bg-white/[0.08]' : 'text-gray-500 hover:text-gray-900 hover:bg-zinc-100/70';

    const promptText = data.prompt || '';
    const charCount = promptText.length;
    // canSubmit：自己输入有 或 有任何素材引用
    const canSubmit = textModels.length > 0 && !data.isLoading && (!!promptText.trim() || refs.length > 0);
    const onSubmit = () => { if (canSubmit) onGenerate(data.id); };

    const handleCopy = async () => {
        const text = data.optimizedPrompt || '';
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {}
    };

    const handleClearResult = () => updateData(data.id, { optimizedPrompt: '' });

    const handleClearPrompt = () => {
        updateData(data.id, { prompt: '' });
        setTimeout(() => textareaRef.current?.focus(), 0);
    };

    return (
        <div className="w-full h-full flex flex-col gap-4 relative">
            {/* 标题 */}
            <div className="absolute bottom-full left-0 w-full mb-4 flex items-center gap-2">
                <div className={`flex items-center justify-center w-7 h-7 rounded-lg ${isDark ? 'bg-amber-500/15 text-amber-400 border border-amber-400/20' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                    <Icons.BookOpen size={14} />
                </div>
                <EditableTitle title={data.title} onUpdate={(t) => updateData(data.id, { title: t })} isDark={isDark} />
            </div>

            {/* 上：结果 / 空态 */}
            <div className={`flex-1 min-h-0 border rounded-3xl glass-card overflow-hidden flex flex-col transition-all duration-300 ease-organic ${glassBg} ${cardBorder}`}>
                {data.isLoading ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-7 p-9">
                        <div className="relative w-24 h-24">
                            <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
                                <circle cx="32" cy="32" r="28" fill="none" stroke={isDark ? '#3f3f46' : '#e5e7eb'} strokeWidth="4" />
                                <circle
                                    cx="32" cy="32" r="28" fill="none"
                                    stroke="#f59e0b" strokeWidth="4"
                                    strokeLinecap="round"
                                    strokeDasharray={`${progress * 1.76} 176`}
                                    className="transition-all duration-300"
                                />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className={`font-bold text-[20px] tabular-nums ${isDark ? 'text-zinc-100' : 'text-gray-800'}`}>{Math.floor(progress)}%</span>
                            </div>
                        </div>
                        <div className="flex flex-col items-center gap-2">
                            <span className={`text-[20px] font-medium ${isDark ? 'text-zinc-200' : 'text-gray-700'}`}>正在生成分镜脚本</span>
                            <span className={`text-[16px] ${muted}`}>{currentModelLabel} 正在构思镜头...</span>
                        </div>
                    </div>
                ) : data.optimizedPrompt ? (
                    <div className="flex-1 flex flex-col min-h-0 animate-in fade-in duration-200">
                        <div className={`flex items-center justify-between px-6 py-4 border-b ${subBorder} shrink-0`}>
                            <div className="flex items-center gap-3">
                                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[14px] font-bold uppercase tracking-wider ${isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-600'}`}>
                                    <Icons.Check size={15} />
                                    分镜就绪
                                </div>
                                <span className={`text-[15px] ${muted}`}>{data.optimizedPrompt.length} 字</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleCopy(); }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    title="复制"
                                    className={`inline-flex h-10 w-10 items-center justify-center rounded-lg transition-all ${ghostIconBtn}`}
                                >
                                    {copied
                                        ? <Icons.Check size={20} className={isDark ? 'text-emerald-400' : 'text-emerald-600'} />
                                        : <Icons.Copy size={20} />}
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); if (canSubmit) onGenerate(data.id); }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    disabled={!canSubmit}
                                    title="重新生成"
                                    className={`inline-flex h-10 w-10 items-center justify-center rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed ${ghostIconBtn}`}
                                >
                                    <Icons.RefreshCw size={20} />
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleClearResult(); }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    title="清空"
                                    className={`inline-flex h-10 w-10 items-center justify-center rounded-lg transition-all ${ghostIconBtn}`}
                                >
                                    <Icons.X size={20} />
                                </button>
                            </div>
                        </div>
                        <div
                            className={`flex-1 overflow-y-auto px-7 py-6 text-[15px] leading-relaxed whitespace-pre-wrap no-scrollbar ${isDark ? 'text-zinc-200' : 'text-gray-800'}`}
                            onWheel={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            {data.optimizedPrompt}
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-6 flex flex-col gap-4 animate-in fade-in duration-200" onWheel={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2.5 px-1 shrink-0">
                            <Icons.BookOpen size={20} className={isDark ? 'text-amber-400' : 'text-amber-500'} />
                            <span className={`text-[18px] font-medium ${ghostText}`}>分镜脚本生成</span>
                        </div>
                        <ul className={`text-[14px] leading-relaxed space-y-2 pl-1 ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>
                            <li>· 风格：Q版、搞笑、动画感</li>
                            <li>· 角色：《无畏契约》角色</li>
                            <li>· 镜头：景别 + 动作 + 表情 + 运镜 + 时长</li>
                            <li>· 输出：电影感分镜，适合 AI 图生视频</li>
                        </ul>
                        <div className={`mt-2 text-[13px] leading-relaxed ${muted}`}>
                            连接任意节点作为素材引用（文本节点、图片节点、视频节点都行，多个就并排展示），在输入框写下你的故事，点击发送即可生成。也可以不写故事，让 AI 根据素材自动设计。
                        </div>
                    </div>
                )}
            </div>

            {/* 下：故事输入 */}
            <div className={`shrink-0 border rounded-3xl glass-card ${glassBg} ${composerBorder} flex flex-col transition-all duration-300 ease-organic focus-within:ring-2 ${isDark ? 'focus-within:ring-amber-500/25 focus-within:border-amber-400/40' : 'focus-within:ring-amber-100 focus-within:border-amber-300/70'}`}>
                {refs.length > 0 && (
                    <div className={`flex flex-col gap-1.5 px-3 py-2 border-b ${subBorder}`}>
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${muted}`}>素材引用 · {refs.length}</span>
                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar min-h-[44px]">
                            {refs.map((r, i) => (
                                <div
                                    key={i}
                                    title={`${r.title}\n${r.content.slice(0, 220)}${r.content.length > 220 ? '…' : ''}`}
                                    className={`relative w-[44px] h-[44px] shrink-0 border rounded-lg overflow-hidden shadow-sm cursor-default ${isDark ? 'border-zinc-700 bg-black/40' : 'border-gray-300 bg-gray-100'}`}
                                >
                                    {r.kind === 'image' && r.imageSrc ? (
                                        <img src={r.imageSrc} className="absolute inset-0 w-full h-full object-cover" loading="lazy" decoding="async" />
                                    ) : (
                                        <div className={`absolute inset-0 flex flex-col items-center justify-center gap-0.5 px-1 ${isDark ? 'bg-zinc-800/70' : 'bg-zinc-100'}`}>
                                            <Icons.FileText size={14} className={isDark ? 'text-zinc-400' : 'text-zinc-500'} />
                                            <span className={`text-[8px] leading-tight truncate max-w-full ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>{r.title}</span>
                                        </div>
                                    )}
                                    {/* numeric badge */}
                                    <div className="absolute top-0 right-0 bg-black/60 backdrop-blur-sm text-white text-[9px] font-bold px-1.5 rounded-bl z-10">{i + 1}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                <div className="relative">
                    <textarea
                        ref={textareaRef}
                        className={`w-full bg-transparent border-0 outline-none resize-none px-6 pt-4 pb-3 text-[15px] leading-relaxed no-scrollbar ${textAreaText}`}
                        placeholder={refs.length > 0
                            ? '写下你的故事…（也可直接发送，让 AI 根据上方素材自动设计）'
                            : '写下你的故事…例：晨星基地，Jett 不小心把咖啡打翻在 Phoenix 的电脑上'}
                        value={promptText}
                        onChange={(e) => updateData(data.id, { prompt: e.target.value })}
                        onMouseDown={(e) => e.stopPropagation()}
                        onWheel={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                e.preventDefault();
                                onSubmit();
                            }
                        }}
                        rows={4}
                        style={{ maxHeight: 200 }}
                    />
                    {promptText && (
                        <button
                            onClick={(e) => { e.stopPropagation(); handleClearPrompt(); }}
                            onMouseDown={(e) => e.stopPropagation()}
                            title="清空"
                            className={`absolute top-2 right-3 inline-flex h-7 w-7 items-center justify-center rounded transition-all ${ghostIconBtn}`}
                        >
                            <Icons.X size={14} />
                        </button>
                    )}
                </div>
                <div className={`flex items-center gap-2 px-3 pb-2 pt-1.5 border-t ${subBorder}`}>
                    <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowModelMenu(v => !v); }}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] border transition-all ${chipBg} ${textModels.length === 0 ? 'opacity-70' : ''}`}
                            title={textModels.length === 0 ? '请先在「模型管理」绑定文本模型' : '切换文本模型'}
                        >
                            <Icons.Sparkles size={13} className="text-amber-400" />
                            <span className="max-w-[200px] truncate">{currentModelLabel}</span>
                            <Icons.ChevronRight size={11} className={`${muted} rotate-90`} />
                        </button>
                        {showModelMenu && textModels.length > 0 && (
                            <div
                                onClick={(e) => e.stopPropagation()}
                                className={`absolute bottom-full mb-1.5 left-0 z-[80] min-w-[220px] max-h-64 overflow-y-auto rounded-xl border ${composerBorder} ${glassBg} shadow-2xl py-1 no-scrollbar animate-in fade-in slide-in-from-bottom-1 duration-150`}
                            >
                                {textModels.map(m => (
                                    <button
                                        key={m.value}
                                        onClick={() => { updateData(data.id, { model: m.value }); setShowModelMenu(false); }}
                                        className={`w-full text-left px-3 py-1.5 text-[12px] flex items-center gap-2 ${m.value === data.model ? (isDark ? 'bg-white/5 text-white' : 'bg-amber-50 text-amber-700') : `${ghostText} ${isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}`}
                                    >
                                        {m.value === data.model && <Icons.Check size={12} className={isDark ? 'text-amber-400' : 'text-amber-500'} />}
                                        <span className={m.value === data.model ? '' : 'pl-[16px]'}>{m.label}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex-1" />

                    {charCount > 0 && (
                        <span className={`text-[11px] tabular-nums ${muted}`}>{charCount}</span>
                    )}
                    <span className={`hidden sm:inline-flex items-center gap-0.5 text-[10px] ${muted}`}>
                        <kbd className={`px-1.5 py-0.5 rounded border text-[10px] ${isDark ? 'border-zinc-700 bg-white/5' : 'border-gray-200 bg-white'}`}>⌘</kbd>
                        <kbd className={`px-1.5 py-0.5 rounded border text-[10px] ${isDark ? 'border-zinc-700 bg-white/5' : 'border-gray-200 bg-white'}`}>↵</kbd>
                    </span>

                    <button
                        onClick={(e) => { e.stopPropagation(); onSubmit(); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        disabled={!canSubmit}
                        className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 ease-organic active:scale-[0.92] ${
                            canSubmit
                                ? 'bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-[0_4px_16px_-2px_rgba(245,158,11,0.45),inset_0_1px_0_rgba(255,255,255,0.25)] hover:shadow-[0_6px_24px_-2px_rgba(245,158,11,0.55),inset_0_1px_0_rgba(255,255,255,0.3)] hover:-translate-y-px'
                                : (isDark ? 'bg-white/[0.06] text-zinc-600' : 'bg-zinc-100 text-zinc-400')
                        } disabled:cursor-not-allowed`}
                        title={textModels.length === 0 ? '请先绑定文本模型' : '生成分镜（Ctrl/Cmd + Enter）'}
                    >
                        {data.isLoading
                            ? <Icons.Loader2 size={14} className="animate-spin" />
                            : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 19V5" />
                                    <path d="M5 12l7-7 7 7" />
                                </svg>
                            )}
                    </button>
                </div>
            </div>
        </div>
    );
};
