import React, { useState, useEffect, useCallback } from 'react';
import { NodeData } from '../../types';
import { Icons } from '../Icons';
import { EditableTitle } from './Shared/NodeComponents';
import { getCanvasModelOptions, CanvasModelOption } from '../../services/modelService';

interface CreativeDescNodeProps {
  data: NodeData;
  updateData: (id: string, updates: Partial<NodeData>) => void;
  onGenerate: (id: string) => void;
  selected?: boolean;
  showControls?: boolean;
  isDark?: boolean;
}

export const CreativeDescNode: React.FC<CreativeDescNodeProps> = ({
    data, updateData, onGenerate, selected, isDark = true
}) => {
    const [textModels, setTextModels] = useState<CanvasModelOption[]>([]);
    const [showModelMenu, setShowModelMenu] = useState(false);

    const refreshModels = useCallback(() => {
        const models = getCanvasModelOptions('TEXT');
        setTextModels(models);
        if (models.length > 0 && (!data.model || !models.some(m => m.value === data.model))) {
            updateData(data.id, { model: models[0].value });
        } else if (models.length === 0 && data.model && data.model.startsWith('枚举/TEXT/')) {
            updateData(data.id, { model: '' });
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

    const currentModelLabel = textModels.find(m => m.value === data.model)?.label || (textModels.length === 0 ? '未绑定文本模型' : '选择模型');

    const cardBg = isDark ? 'bg-[#1e1e1e]' : 'bg-white';
    const cardBorder = selected
        ? 'border-blue-500 ring-1 ring-blue-500'
        : (isDark ? 'border-zinc-800' : 'border-gray-200');
    const subBorder = isDark ? 'border-zinc-800' : 'border-gray-200';
    const composerBg = isDark ? 'bg-[#1e1e1e]' : 'bg-white';
    const composerBorder = isDark ? 'border-zinc-800' : 'border-gray-200';
    const textAreaText = isDark ? 'text-zinc-200 placeholder-zinc-500' : 'text-gray-900 placeholder-gray-400';
    const chipBg = isDark ? 'bg-white/[0.04] hover:bg-white/10 border-zinc-800 text-zinc-300' : 'bg-slate-50 hover:bg-slate-100 border-gray-200 text-gray-700';
    const ghostText = isDark ? 'text-zinc-400' : 'text-gray-500';
    const muted = isDark ? 'text-zinc-500' : 'text-gray-400';

    const canSubmit = textModels.length > 0 && !data.isLoading && !!(data.prompt || '').trim();
    const onSubmit = () => { if (canSubmit) onGenerate(data.id); };

    const handleQuickFill = (template: string) => {
        updateData(data.id, { prompt: template });
    };

    return (
        <div className="w-full h-full flex flex-col gap-3 relative">
            {/* 标题：浮在节点上方 */}
            <div className="absolute bottom-full left-0 w-full mb-2 flex items-center gap-1.5">
                <Icons.FileText size={12} className={ghostText} />
                <EditableTitle title={data.title} onUpdate={(t) => updateData(data.id, { title: t })} isDark={isDark} />
            </div>

            {/* 上：结果 / 模板卡 */}
            <div className={`flex-1 min-h-0 border rounded-2xl shadow-lg overflow-hidden flex flex-col ${cardBg} ${cardBorder}`}>
                {data.isLoading ? (
                    <div className={`flex-1 flex flex-col items-center justify-center gap-2 ${ghostText} p-5`}>
                        <Icons.Loader2 size={20} className="animate-spin" />
                        <span className="text-[11px]">正在优化提示词...</span>
                    </div>
                ) : data.optimizedPrompt ? (
                    <div className="flex-1 flex flex-col p-4 min-h-0">
                        <div className={`text-[10px] uppercase tracking-wider font-semibold mb-2 ${muted} shrink-0`}>优化结果</div>
                        <div
                            className={`flex-1 overflow-y-auto text-[12px] leading-relaxed no-scrollbar ${isDark ? 'text-zinc-200' : 'text-gray-800'}`}
                            onWheel={(e) => e.stopPropagation()}
                        >
                            {data.optimizedPrompt}
                        </div>
                    </div>
                ) : (
                    <div
                        className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-4 flex flex-col gap-2"
                        onWheel={(e) => e.stopPropagation()}
                    >
                        <div className={`text-[11px] ${muted} shrink-0`}>尝试：</div>
                        <div className="flex flex-col gap-1.5">
                            {[
                                { icon: <Icons.Edit3 size={12} />, label: '自己编写内容', tpl: '' },
                                { icon: <Icons.Video size={12} />, label: '文生视频', tpl: '一个未来都市的夜景，霓虹灯下走过一只机械猫' },
                                { icon: <Icons.Image size={12} />, label: '图片反推提示词', tpl: '请根据画面提炼一段适合 AI 生图的精炼提示词' },
                                { icon: <Icons.Sparkles size={12} />, label: '文字生音乐', tpl: '一段轻松的电子合成器旋律，节奏 90 BPM' },
                            ].map(it => (
                                <button
                                    key={it.label}
                                    onClick={(e) => { e.stopPropagation(); handleQuickFill(it.tpl); }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12px] border transition-colors text-left ${chipBg}`}
                                >
                                    <span className={muted}>{it.icon}</span>
                                    <span className="truncate">{it.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* 下：输入 + 工具栏（仿 work-img 设计） */}
            <div className={`border rounded-2xl ${composerBg} ${composerBorder} flex flex-col shadow-lg`}>
                <textarea
                    className={`w-full bg-transparent border-0 outline-none resize-none px-4 pt-3 pb-2 text-[12px] leading-relaxed no-scrollbar ${textAreaText}`}
                    placeholder="写下你想讲的故事、场景或角色设定。例如：一个来自未来的机器人，在城市屋顶看星星。"
                    value={data.prompt || ''}
                    onChange={(e) => updateData(data.id, { prompt: e.target.value })}
                    onMouseDown={(e) => e.stopPropagation()}
                    onWheel={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            onSubmit();
                        }
                    }}
                    rows={2}
                />
                <div className={`flex items-center gap-2 px-3 pb-2 pt-1 border-t ${subBorder}`}>
                    {/* 模型选择（pill） */}
                    <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowModelMenu(v => !v); }}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] border ${chipBg} ${textModels.length === 0 ? 'opacity-70' : ''}`}
                            title={textModels.length === 0 ? '请先在「模型管理」绑定文本模型' : '切换文本模型'}
                        >
                            <Icons.Sparkles size={11} className="text-blue-400" />
                            <span className="max-w-[140px] truncate">{currentModelLabel}</span>
                            <Icons.ChevronRight size={10} className={`${muted} rotate-90`} />
                        </button>
                        {showModelMenu && textModels.length > 0 && (
                            <div
                                onClick={(e) => e.stopPropagation()}
                                className={`absolute bottom-full mb-1 left-0 z-[80] min-w-[180px] max-h-56 overflow-y-auto rounded-xl border ${composerBorder} ${cardBg} shadow-2xl py-1 no-scrollbar`}
                            >
                                {textModels.map(m => (
                                    <button
                                        key={m.value}
                                        onClick={() => { updateData(data.id, { model: m.value }); setShowModelMenu(false); }}
                                        className={`w-full text-left px-3 py-1.5 text-[11px] flex items-center gap-2 ${m.value === data.model ? (isDark ? 'bg-white/5 text-white' : 'bg-blue-50 text-blue-700') : `${ghostText} ${isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}`}
                                    >
                                        {m.value === data.model && <Icons.Check size={11} className="text-blue-500" />}
                                        <span className={m.value === data.model ? '' : 'pl-[15px]'}>{m.label}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex-1" />

                    {/* 提交按钮（向上箭头风格） */}
                    <button
                        onClick={(e) => { e.stopPropagation(); onSubmit(); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        disabled={!canSubmit}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${canSubmit ? 'bg-white text-black hover:bg-zinc-200' : (isDark ? 'bg-white/10 text-zinc-500' : 'bg-slate-200 text-gray-400')} disabled:cursor-not-allowed`}
                        title={textModels.length === 0 ? '请先绑定文本模型' : '生成（Ctrl/Cmd + Enter）'}
                    >
                        {data.isLoading
                            ? <Icons.Loader2 size={13} className="animate-spin" />
                            : <Icons.ArrowRightLeft size={13} className="-rotate-90" />}
                    </button>
                </div>
            </div>
        </div>
    );
};
