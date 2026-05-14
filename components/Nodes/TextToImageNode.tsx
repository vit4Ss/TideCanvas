
import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { NodeData, NodeType } from '../../types';
import { Icons } from '../Icons';
import { getModelConfig } from '../../services/geminiService';
import { getCanvasModelOptions, CanvasModelOption } from '../../services/modelService';
import { IMAGE_HANDLERS } from '../../services/mode/image/configurations';
import { LocalEditableTitle, LocalCustomDropdown, LocalInputThumbnails, LocalMediaStack } from './Shared/LocalNodeComponents';

const COMMON_RATIOS = ['自适应', '1:1', '9:16', '16:9', '3:4', '4:3', '3:2', '2:3', '4:5', '5:4', '21:9'];
const COMMON_RESOLUTIONS = ['1k', '2k', '4k'];

interface TextToImageNodeProps {
  data: NodeData;
  updateData: (id: string, updates: Partial<NodeData>) => void;
  onGenerate: (id: string) => void;
  onPanorama?: (id: string) => void;
  onNineGrid?: (id: string, template: { key: string; label: string; prompt: string }) => void;
  selected?: boolean;
  showControls?: boolean;
  inputs?: string[];
  onMaximize?: (id: string) => void;
  onDownload?: (id: string) => void;
  onUpload?: (nodeId: string) => void;
  isDark?: boolean;
  isSelecting?: boolean;
  canvasScale?: number;
}

const AspectRatioIcon = ({ ratio, isSelected, isDark, disabled }: { ratio: string; isSelected: boolean; isDark: boolean; disabled?: boolean }) => {
    if (ratio === '自适应') {
        return (
            <div className={`w-3 h-3 rounded-[2px] border ${
                disabled ? (isDark ? 'border-zinc-700' : 'border-gray-300') : (isSelected ? 'border-current' : isDark ? 'border-zinc-300' : 'border-gray-700')
            }`} />
        );
    }

    const [wStr, hStr] = ratio.split(':');
    const w = Number(wStr);
    const h = Number(hStr);
    const aspect = !Number.isNaN(w) && !Number.isNaN(h) && h !== 0 ? w / h : 1;
    const maxW = 18;
    const maxH = 14;
    const width = aspect >= 1 ? maxW : Math.max(7, maxH * aspect);
    const height = aspect >= 1 ? Math.max(7, maxW / aspect) : maxH;

    return (
        <div
            className={`rounded-[2px] border ${
                disabled ? (isDark ? 'border-zinc-700' : 'border-gray-300') : (isSelected ? 'border-current' : isDark ? 'border-zinc-300' : 'border-gray-700')
            }`}
            style={{ width, height }}
        />
    );
};

const ImageSizeDropdown = ({
    ratio,
    resolution,
    supportedRatios,
    supportedResolutions,
    onRatioChange,
    onResolutionChange,
    isOpen,
    onToggle,
    onClose,
    isDark,
}: {
    ratio: string;
    resolution: string;
    supportedRatios: string[];
    supportedResolutions: string[];
    onRatioChange: (ratio: string) => void;
    onResolutionChange: (resolution: string) => void;
    isOpen: boolean;
    onToggle: () => void;
    onClose: () => void;
    isDark: boolean;
}) => {
    const ref = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) onClose();
        };
        if (isOpen) document.addEventListener('mousedown', handleClickOutside, true);
        return () => document.removeEventListener('mousedown', handleClickOutside, true);
    }, [isOpen, onClose]);

    const displayResolution = resolution.toUpperCase();
    const triggerBg = isDark
        ? (isOpen ? 'bg-zinc-800 shadow-md shadow-black/20' : 'bg-transparent hover:bg-zinc-800 hover:shadow-md hover:shadow-black/20')
        : (isOpen ? 'bg-white shadow-md shadow-gray-200/70' : 'bg-transparent hover:bg-white hover:shadow-md hover:shadow-gray-200/70');
    const panelClass = isDark
        ? 'bg-[#1a1a1a] border-zinc-700 shadow-black/40'
        : 'bg-white border-gray-200 shadow-gray-300/50';
    const textMain = isDark ? 'text-zinc-100' : 'text-gray-900';
    const textSub = isDark ? 'text-zinc-400' : 'text-gray-500';
    const itemBase = isDark ? 'border-zinc-700 bg-zinc-900/60 hover:bg-zinc-800' : 'border-gray-200 bg-white hover:bg-gray-50';
    const itemSelected = isDark ? 'border-white text-white bg-zinc-900 shadow-lg shadow-black/20 scale-[1.015]' : 'border-gray-900 text-gray-900 bg-white shadow-md shadow-gray-200/80 scale-[1.015]';

    return (
        <div className="relative flex items-center" ref={ref}>
            <button
                type="button"
                className={`flex h-9 items-center gap-2 rounded-xl border border-transparent px-3.5 transition-all ${triggerBg}`}
                onClick={(e) => { e.stopPropagation(); onToggle(); }}
            >
                <Icons.Crop size={15} className={isOpen ? (isDark ? 'text-blue-400' : 'text-blue-600') : (isDark ? 'text-zinc-400' : 'text-gray-500')} />
                <span className={`text-xs font-medium tabular-nums ${isDark ? 'text-zinc-200' : 'text-gray-700'}`}>
                    {ratio} · {displayResolution}
                </span>
                <Icons.ChevronRight size={12} className={`transition-all duration-200 ${isOpen ? 'rotate-[-90deg] text-blue-400' : `rotate-90 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}`} />
            </button>

            {isOpen && (
                <div
                    className={`absolute top-full left-1/2 z-[120] mt-2 w-[342px] -translate-x-1/2 rounded-2xl border p-3 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150 ${panelClass}`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onWheel={(e) => e.stopPropagation()}
                >
                    <div className={`px-0.5 pb-2 text-sm font-medium ${textMain}`}>分辨率</div>
                    <div className="grid grid-cols-3 gap-2">
                        {COMMON_RESOLUTIONS.map((res) => {
                            const disabled = !supportedResolutions.includes(res);
                            const selected = resolution === res;
                            return (
                                <button
                                    key={res}
                                    type="button"
                                    disabled={disabled}
                                    className={`h-8 rounded-lg border text-sm transform-gpu transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out active:scale-[0.98] ${
                                        disabled
                                            ? (isDark ? 'border-zinc-800 text-zinc-700 cursor-not-allowed' : 'border-gray-100 text-gray-300 cursor-not-allowed')
                                            : selected
                                                ? itemSelected
                                                : `${itemBase} ${textSub}`
                                    }`}
                                    onClick={() => { onResolutionChange(res); }}
                                >
                                    {res.toUpperCase()}
                                </button>
                            );
                        })}
                    </div>

                    <div className={`px-0.5 pb-2 pt-3 text-sm font-medium ${textMain}`}>比例</div>
                    <div className="grid grid-cols-5 gap-2">
                        {COMMON_RATIOS.map((item) => {
                            const disabled = !supportedRatios.includes(item);
                            const selected = ratio === item;
                            return (
                                <button
                                    key={item}
                                    type="button"
                                    disabled={disabled}
                                    className={`flex h-16 transform-gpu flex-col items-center justify-center gap-1.5 rounded-lg border text-xs transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out active:scale-[0.98] ${
                                        disabled
                                            ? (isDark ? 'border-zinc-800 text-zinc-700 cursor-not-allowed' : 'border-gray-100 text-gray-300 cursor-not-allowed')
                                            : selected
                                                ? itemSelected
                                                : `${itemBase} ${textSub}`
                                    }`}
                                    onClick={() => { onRatioChange(item); }}
                                >
                                    <AspectRatioIcon ratio={item} isSelected={selected} isDark={isDark} disabled={disabled} />
                                    <span>{item}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export const TextToImageNode: React.FC<TextToImageNodeProps> = ({
    data, updateData, onGenerate, onPanorama, onNineGrid, selected, showControls, inputs = [], onMaximize, onDownload, onUpload, isDark = true, isSelecting, canvasScale = 1
}) => {
    const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
    const [deferredInputs, setDeferredInputs] = useState(false);
    const [isConfigured, setIsConfigured] = useState(true);
    const [imageModels, setImageModels] = useState<CanvasModelOption[]>([]);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isTitleEditing, setIsTitleEditing] = useState(false);
    const [titleDraft, setTitleDraft] = useState(data.title);
    const [progress, setProgress] = useState(0);
    const [nineGridMenuOpen, setNineGridMenuOpen] = useState(false);

    // 九宫格模板：选中后填入 prompt 并触发生成
    const NINE_GRID_TEMPLATES: { key: string; label: string; prompt: string }[] = [
        {
            key: 'face',
            label: '角色脸部三视图',
            prompt: '一张 3x3 九宫格的角色脸部三视图参考表，九个面板分别展示角色脸部的：正面、3/4 左侧、左侧面、3/4 右侧、右侧面、仰视、俯视、微笑表情、严肃表情。同一角色，统一光线，五官特征一致，纯白背景，character face reference sheet, model sheet style',
        },
        {
            key: 'product',
            label: '产品三视图',
            prompt: '一张 3x3 九宫格的产品三视图参考表，九个面板分别展示产品的：正面、背面、左侧面、右侧面、顶视图、底视图、3/4 透视、细节特写、爆炸图。统一光线和材质，纯白背景，product reference sheet, industrial design layout',
        },
        {
            key: 'character',
            label: '角色三视图',
            prompt: '一张 3x3 九宫格的角色全身三视图参考表，九个面板分别展示角色：正面、3/4 左侧、左侧面、背面、右侧面、3/4 右侧、T-pose、行走姿态、动作姿态。同一角色，服装和比例一致，中性背景，character turnaround sheet, model sheet, full body reference',
        },
    ];

    const applyNineGridTemplate = (tpl: { key: string; label: string; prompt: string }) => {
        setNineGridMenuOpen(false);
        if (onNineGrid) {
            // 新建一个节点来承载三视图，避免覆盖当前节点的成果
            onNineGrid(data.id, tpl);
        } else {
            // 兜底：直接在当前节点替换 prompt 并触发生成
            updateData(data.id, { prompt: tpl.prompt, aspectRatio: '1:1' });
            setTimeout(() => onGenerate(data.id), 50);
        }
    };

    useEffect(() => {
        if (!nineGridMenuOpen) return;
        const close = () => setNineGridMenuOpen(false);
        window.addEventListener('click', close);
        return () => window.removeEventListener('click', close);
    }, [nineGridMenuOpen]);

    // 仿视频节点：生成时渐进式动画到 95%，结束时清零
    useEffect(() => {
        let interval: any;
        if (data.isLoading) {
            setProgress(0);
            interval = setInterval(() => {
                setProgress(prev => (prev >= 95 ? 95 : prev + Math.max(0.5, (95 - prev) / 20)));
            }, 200);
        } else {
            setProgress(0);
        }
        return () => clearInterval(interval);
    }, [data.isLoading]);

    const isSelectedAndStable = selected && !isSelecting;
    const requiresInputImage = data.type === NodeType.IMAGE_TO_IMAGE;
    const hasInputImage = inputs.length > 0;

    // Auto-close expanded modal when node loses selection/controls
    useEffect(() => {
        if (!isSelectedAndStable || !showControls) setIsExpanded(false);
    }, [isSelectedAndStable, showControls]);

    // Escape closes expanded modal
    useEffect(() => {
        if (!isExpanded) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setIsExpanded(false); } };
        window.addEventListener('keydown', handler, true);
        return () => window.removeEventListener('keydown', handler, true);
    }, [isExpanded]);

    const checkConfig = useCallback(() => {
         if (!data.model) {
             setIsConfigured(false);
             return;
         }
         const cfg = getModelConfig(data.model);
         setIsConfigured(!!cfg.key);
    }, [data.model]);

    const updateModels = useCallback(() => {
        const models = getCanvasModelOptions('IMAGE');
        setImageModels(models);
        if (models.length > 0 && !models.some(item => item.value === data.model)) {
            updateData(data.id, { model: models[0].value });
        } else if (models.length === 0 && data.model) {
            updateData(data.id, { model: '' });
        }
    }, [data.id, data.model, updateData]);

    useEffect(() => { 
        checkConfig(); 
        updateModels();
        window.addEventListener('modelConfigUpdated', checkConfig); 
        window.addEventListener('modelRegistryUpdated', updateModels);
        window.addEventListener('modelServiceUpdated', updateModels);
        return () => {
            window.removeEventListener('modelConfigUpdated', checkConfig);
            window.removeEventListener('modelRegistryUpdated', updateModels);
            window.removeEventListener('modelServiceUpdated', updateModels);
        };
    }, [checkConfig, updateModels]);

    useEffect(() => { if (isSelectedAndStable && showControls) { const t = setTimeout(() => setDeferredInputs(true), 100); return () => clearTimeout(t); } else setDeferredInputs(false); }, [isSelectedAndStable, showControls]);
    useEffect(() => { if (!isTitleEditing) setTitleDraft(data.title); }, [data.title, isTitleEditing]);

    const commitTitle = () => {
        const nextTitle = titleDraft.trim().slice(0, 24);
        if (nextTitle && nextTitle !== data.title) updateData(data.id, { title: nextTitle });
        setTitleDraft(nextTitle || data.title);
        setIsTitleEditing(false);
    };

    const cancelTitleEdit = () => {
        setTitleDraft(data.title);
        setIsTitleEditing(false);
    };

    // Get Rules for current model
    const currentModel = data.model || 'BananaPro';
    const handler = IMAGE_HANDLERS[currentModel] || IMAGE_HANDLERS['BananaPro']; // Fallback rules
    const rules = handler.rules;
    const supportedResolutions = COMMON_RESOLUTIONS;
    const supportedRatios = COMMON_RATIOS;
    const canOptimize = !!rules.hasPromptExtend;

    const handleRatioChange = (ratio: string) => {
        const currentShort = Math.min(data.width, data.height);
        const baseSize = Math.max(currentShort, 400); // Preserve current scale, min 400px

        const sizeRatio = ratio === '自适应' ? '1:1' : ratio;
        const [wStr, hStr] = sizeRatio.split(':');
        const wR = parseFloat(wStr);
        const hR = parseFloat(hStr);
        const r = wR / hR;

        let newW, newH;
        if (r >= 1) {
            // Landscape or Square: Height is limiting factor
            newH = baseSize;
            newW = baseSize * r;
        } else {
            // Portrait: Width is limiting factor
            newW = baseSize;
            newH = baseSize / r;
        }
        updateData(data.id, { aspectRatio: ratio, width: Math.round(newW), height: Math.round(newH) });
    };

    const hasResult = !!data.imageSrc && !data.isLoading;
    
    // Auto-correct
    useEffect(() => { 
        if (data.aspectRatio && !supportedRatios.includes(data.aspectRatio)) updateData(data.id, { aspectRatio: '1:1' }); 
        if (data.resolution && !supportedResolutions.includes(data.resolution)) updateData(data.id, { resolution: supportedResolutions[0] });
    }, [data.model, data.aspectRatio, data.resolution, data.id, updateData, supportedRatios, supportedResolutions]);

    const containerBg = isDark ? 'bg-[#1a1a1a]' : 'bg-white';
    const containerBorder = selected
        ? (isDark ? 'border-zinc-500 ring-1 ring-zinc-600/40' : 'border-gray-300 ring-1 ring-gray-200/60')
        : (isDark ? 'border-zinc-700/50' : 'border-gray-200');
    const controlPanelBg = isDark ? 'bg-[#1a1a1a]/95 backdrop-blur-xl border-zinc-700/50' : 'bg-white/95 backdrop-blur-xl border-gray-200 shadow-xl';
    const titleColor = isDark ? 'text-zinc-200' : 'text-gray-700';
    const subtleText = isDark ? 'text-zinc-500' : 'text-gray-400';
    const chipBtn = isDark ? 'bg-zinc-800/80 hover:bg-zinc-700 border-zinc-700 text-zinc-200' : 'bg-white hover:bg-gray-50 border-gray-200 text-gray-700 shadow-sm';
    const ghostIconBtn = isDark ? 'text-zinc-400 hover:text-white hover:bg-white/10 hover:shadow-md hover:shadow-black/20' : 'text-gray-500 hover:text-gray-900 hover:bg-white hover:shadow-md hover:shadow-gray-200/70';
    const sendBtnEnabled = isDark ? 'bg-zinc-100 text-zinc-900 hover:bg-white' : 'bg-zinc-900 text-white hover:bg-zinc-800';
    const sendBtnDisabled = isDark ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed' : 'bg-gray-200 text-gray-400 cursor-not-allowed';
    const controlPanelScale = 1 / Math.max(canvasScale, 0.1);
    const titleScale = 1 / Math.max(canvasScale, 0.1);
    const highestRes = supportedResolutions[supportedResolutions.length - 1];

    const ActionChip = ({ icon: Icon, label, onClick }: { icon: any; label: string; onClick?: () => void }) => (
        <button
            type="button"
            onClick={onClick}
            className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-all ${chipBtn}`}
        >
            <Icon size={14} />
            <span>{label}</span>
        </button>
    );

    const IconBtn = ({ icon: Icon, title, onClick, size = 16, active }: { icon: any; title?: string; onClick?: () => void; size?: number; active?: boolean }) => (
        <button
            type="button"
            title={title}
            onClick={onClick}
            className={`shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
                active ? (isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-600') : ghostIconBtn
            }`}
        >
            <Icon size={size} />
        </button>
    );

    const ResultToolbarChip = ({ icon: Icon, label, badge, hasChevron, onClick }: { icon?: any; label: string; badge?: string; hasChevron?: boolean; onClick?: () => void }) => (
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClick?.(); }}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-all ${ghostIconBtn}`}
        >
            {Icon && <Icon size={14} />}
            <span className="whitespace-nowrap">{label}</span>
            {badge && (
                <span className="inline-flex h-4 items-center rounded px-1 text-[9px] font-bold uppercase bg-blue-100 text-blue-600">
                    {badge}
                </span>
            )}
            {hasChevron && <Icons.ChevronRight size={11} className={`rotate-90 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`} />}
        </button>
    );

    return (
      <>
        {/* Above-Node: Result toolbar (top-center, when image exists) */}
        {isSelectedAndStable && hasResult && (
            <div
                className={`absolute left-1/2 z-[60] flex items-center gap-0.5 rounded-2xl border px-1.5 py-1 shadow-xl pointer-events-auto whitespace-nowrap ${chipBtn}`}
                style={{ top: -88 * titleScale, transform: `translateX(-50%) scale(${titleScale})`, transformOrigin: 'bottom center' }}
                onMouseDown={(e) => e.stopPropagation()}
            >
                <ResultToolbarChip icon={Icons.LayoutGrid} label="全景" badge="NEW" onClick={() => onPanorama?.(data.id)} />
                <ResultToolbarChip icon={Icons.RefreshCw} label="多角度" hasChevron />
                <ResultToolbarChip icon={Icons.Sparkles} label="打光" />
                <div className="relative">
                    <ResultToolbarChip
                        icon={Icons.Frame}
                        label="九宫格"
                        hasChevron
                        onClick={() => setNineGridMenuOpen(v => !v)}
                    />
                    {nineGridMenuOpen && (
                        <div
                            className={`absolute top-full left-0 mt-1 z-[80] min-w-[180px] rounded-xl border shadow-2xl py-1 ${isDark ? 'bg-[#1e1e1e] border-zinc-800' : 'bg-white border-gray-200'}`}
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            {NINE_GRID_TEMPLATES.map(tpl => (
                                <button
                                    key={tpl.key}
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); applyNineGridTemplate(tpl); }}
                                    className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 ${isDark ? 'text-zinc-200 hover:bg-white/5' : 'text-gray-700 hover:bg-slate-50'}`}
                                >
                                    <Icons.Frame size={12} className={isDark ? 'text-zinc-500' : 'text-gray-400'} />
                                    <span>{tpl.label}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); updateData(data.id, { resolution: highestRes }); }}
                    className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-all ${ghostIconBtn}`}
                >
                    <span className={`inline-flex h-3.5 items-center rounded-sm border px-0.5 text-[9px] font-bold ${isDark ? 'border-zinc-400 text-zinc-300' : 'border-gray-500 text-gray-600'}`}>HD</span>
                    <span className="whitespace-nowrap">高清</span>
                    <Icons.ChevronRight size={11} className={`rotate-90 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`} />
                </button>
                <ResultToolbarChip icon={Icons.Scissors} label="宫格切分" hasChevron />

                <div className={`mx-1 h-5 w-px ${isDark ? 'bg-white/10' : 'bg-gray-200'}`} />

                <button
                    type="button"
                    title="编辑"
                    onClick={(e) => e.stopPropagation()}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all ${ghostIconBtn}`}
                >
                    <Icons.Edit3 size={15} />
                </button>
                <button
                    type="button"
                    title="连接"
                    onClick={(e) => e.stopPropagation()}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all ${ghostIconBtn}`}
                >
                    <Icons.Link size={15} />
                </button>
                <button
                    type="button"
                    title="下载"
                    onClick={(e) => { e.stopPropagation(); onDownload?.(data.id); }}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all ${ghostIconBtn}`}
                >
                    <Icons.Download size={15} />
                </button>
                <button
                    type="button"
                    title="最大化"
                    onClick={(e) => { e.stopPropagation(); onMaximize?.(data.id); }}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all ${ghostIconBtn}`}
                >
                    <Icons.Maximize2 size={15} />
                </button>
            </div>
        )}

        {/* Above-Node: Title (top-left) */}
        {isSelectedAndStable && (
            <div
                className={`absolute left-0 z-[60] pointer-events-auto flex h-7 items-center gap-1.5 rounded-lg px-2 transition-all ${
                    isTitleEditing
                        ? (isDark ? 'bg-zinc-900/90 border border-zinc-700 shadow-xl' : 'bg-white border border-gray-200 shadow-lg')
                        : (isDark ? 'hover:bg-zinc-900/70' : 'hover:bg-white/80')
                }`}
                style={{ top: -30 * titleScale, transform: `scale(${titleScale})`, transformOrigin: 'bottom left' }}
                onMouseDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => { e.stopPropagation(); setTitleDraft(data.title); setIsTitleEditing(true); }}
                title={isTitleEditing ? undefined : '双击修改名称'}
            >
                <Icons.Image size={14} className={isDark ? 'text-zinc-400' : 'text-gray-500'} />
                {isTitleEditing ? (
                    <input
                        value={titleDraft}
                        onChange={(e) => setTitleDraft(e.target.value)}
                        onBlur={commitTitle}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') commitTitle();
                            if (e.key === 'Escape') cancelTitleEdit();
                        }}
                        className={`h-6 w-[160px] bg-transparent text-sm font-medium outline-none ${titleColor}`}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <span className={`max-w-[220px] truncate text-sm font-medium ${titleColor}`}>{data.title}</span>
                )}
            </div>
        )}

        {/* Above-Node: Upload pill (top-center, only when no result) */}
        {isSelectedAndStable && !hasResult && (
            <button
                type="button"
                className={`absolute left-1/2 z-[60] flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-all pointer-events-auto ${chipBtn}`}
                style={{ top: -48 * titleScale, transform: `translateX(-50%) scale(${titleScale})`, transformOrigin: 'bottom center' }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onUpload?.(data.id); }}
            >
                <Icons.Upload size={14} />
                <span>上传</span>
            </button>
        )}

        {/* Above-Node: Maximize (top-right, only when no result) */}
        {isSelectedAndStable && !hasResult && (
            <button
                type="button"
                title="最大化"
                className={`absolute right-0 z-[60] inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all pointer-events-auto ${ghostIconBtn}`}
                style={{ top: -36 * titleScale, transform: `scale(${titleScale})`, transformOrigin: 'bottom right' }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onMaximize?.(data.id); }}
            >
                <Icons.Maximize2 size={15} />
            </button>
        )}

        <div className={`w-full h-full relative rounded-2xl border ${containerBorder} ${containerBg} ${data.isStackOpen ? 'overflow-visible' : 'overflow-hidden'} shadow-xl group transition-[width,height,border-radius,box-shadow,border-color,background-color] transition-node-resize`}>
             {hasResult ? (
                 <>
                     <LocalMediaStack data={data} updateData={updateData} currentSrc={data.imageSrc} onMaximize={onMaximize} isDark={isDark} selected={selected} />

                     {/* Persistent share/download chip (top-right inside image) */}
                     <div className="absolute top-2 right-2 z-10 pointer-events-auto">
                         <button
                             type="button"
                             title="下载"
                             onClick={(e) => { e.stopPropagation(); onDownload?.(data.id); }}
                             className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-black/55 hover:bg-black/70 backdrop-blur-md text-white/90 hover:text-white transition-all shadow-lg"
                         >
                             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                 <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
                                 <path d="M16 6l-4-4-4 4" />
                                 <path d="M12 2v14" />
                             </svg>
                         </button>
                     </div>
                 </>
             ) : (
                 <div className={`w-full h-full flex flex-col items-center justify-center ${subtleText}`}>
                     <Icons.Image size={48} strokeWidth={1.5} className={isDark ? 'text-zinc-700' : 'text-gray-300'} />
                     <div className="mt-6 flex flex-col items-start gap-1.5 text-xs">
                         <span className={isDark ? 'text-zinc-500' : 'text-gray-400'}>尝试:</span>
                         <button
                             type="button"
                             className={`flex items-center gap-1.5 transition-colors ${isDark ? 'text-zinc-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}
                             onClick={(e) => { e.stopPropagation(); onUpload?.(data.id); }}
                         >
                             <Icons.Upload size={13} />
                             <span>图生图</span>
                         </button>
                         <button
                             type="button"
                             className={`flex items-center gap-1.5 transition-colors ${isDark ? 'text-zinc-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}
                             onClick={(e) => { e.stopPropagation(); updateData(data.id, { resolution: highestRes }); }}
                         >
                             <span className={`inline-flex h-3.5 w-5 items-center justify-center rounded-sm border text-[9px] font-bold ${isDark ? 'border-zinc-500 text-zinc-400' : 'border-gray-400 text-gray-500'}`}>HD</span>
                             <span>图片高清</span>
                         </button>
                     </div>
                 </div>
             )}
             
             {/* Loading Overlay with Progress */}
             {data.isLoading && (
                 <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-20">
                     <div className="relative w-16 h-16 mb-4">
                         <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
                             <circle cx="32" cy="32" r="28" fill="none" stroke={isDark ? '#3f3f46' : '#e5e7eb'} strokeWidth="4" />
                             <circle
                                 cx="32" cy="32" r="28" fill="none"
                                 stroke="#3b82f6" strokeWidth="4"
                                 strokeLinecap="round"
                                 strokeDasharray={`${progress * 1.76} 176`}
                                 className="transition-all duration-300"
                             />
                         </svg>
                         <div className="absolute inset-0 flex items-center justify-center">
                             <span className="text-white font-bold text-sm tabular-nums">{Math.floor(progress)}%</span>
                         </div>
                     </div>
                     <span className="text-white/80 text-sm font-medium">生成中...</span>
                 </div>
             )}
        </div>

        {/* Control Panel */}
        {isSelectedAndStable && showControls && !hasResult && (
            <div
                className="absolute top-full left-1/2 w-[640px] min-w-[640px] max-w-[640px] pt-4 z-[70] pointer-events-auto"
                style={{ transform: `translateX(-50%) scale(${controlPanelScale})`, transformOrigin: 'top center' }}
                onMouseDown={(e) => e.stopPropagation()}
            >
                 <div className={`${controlPanelBg} rounded-2xl p-3 flex flex-col gap-2.5 border`}>
                      {/* Top action row: Expand only (风格/标记/聚焦 暂时隐藏) */}
                      <div className="flex items-center gap-2">
                          {inputs.length > 0 && (
                              <LocalInputThumbnails inputs={inputs} ready={deferredInputs} isDark={isDark} compact />
                          )}
                          <div className="flex-1" />
                          <IconBtn icon={Icons.Maximize2} title="展开" onClick={() => setIsExpanded(true)} size={15} />
                      </div>

                      {/* Prompt Input */}
                      <textarea 
                          className={`w-full bg-transparent rounded-xl px-2 py-2 text-sm leading-relaxed resize-none focus:outline-none min-h-[72px] no-scrollbar transition-all ${isDark ? 'text-white placeholder-zinc-500' : 'text-gray-900 placeholder-gray-400'}`} 
                          placeholder="描述你想要生成的画面内容，按/呼出指令，@引用素材" 
                          value={data.prompt || ''} 
                          onChange={(e) => updateData(data.id, { prompt: e.target.value })} 
                          onWheel={(e) => e.stopPropagation()} 
                      />
                      
                      {/* Bottom params row */}
                      <div className="flex items-center gap-2 whitespace-nowrap">
                          <div className="shrink-0">
                              <LocalCustomDropdown 
                                  options={imageModels} 
                                  value={data.model || '未选择模型'} 
                                  onChange={(val: any) => updateData(data.id, { model: val })} 
                                  isOpen={activeDropdown === 'model'} 
                                  onToggle={() => setActiveDropdown(activeDropdown === 'model' ? null : 'model')} 
                                  onClose={() => setActiveDropdown(null)} 
                                  align="left" 
                                  width="w-[140px]" 
                                  isDark={isDark} 
                              />
                          </div>
                          <div className="shrink-0">
                              <ImageSizeDropdown
                                  ratio={data.aspectRatio || '1:1'}
                                  resolution={data.resolution || '1k'}
                                  supportedRatios={supportedRatios}
                                  supportedResolutions={supportedResolutions}
                                  onRatioChange={handleRatioChange}
                                  onResolutionChange={(val) => updateData(data.id, { resolution: val })}
                                  isOpen={activeDropdown === 'size'}
                                  onToggle={() => setActiveDropdown(activeDropdown === 'size' ? null : 'size')}
                                  onClose={() => setActiveDropdown(null)}
                                  isDark={isDark}
                              />
                          </div>
                          <button
                              type="button"
                              className={`shrink-0 inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-medium transition-all ${ghostIconBtn}`}
                              onClick={(e) => e.stopPropagation()}
                              title="摄像机"
                          >
                              <Icons.Camera size={14} />
                              <span>摄像机</span>
                          </button>

                          <div className="flex-1" />

                          <div className="shrink-0">
                              <LocalCustomDropdown 
                                  options={['1张', '2张', '3张', '4张']} 
                                  value={`${data.count || 1}张`} 
                                  onChange={(val: any) => updateData(data.id, { count: parseInt(String(val), 10) || 1 })} 
                                  isOpen={activeDropdown === 'count'} 
                                  onToggle={() => setActiveDropdown(activeDropdown === 'count' ? null : 'count')} 
                                  onClose={() => setActiveDropdown(null)} 
                                  isDark={isDark} 
                              />
                          </div>

                          {/* Send Button (circular up arrow) */}
                          <button 
                              type="button"
                              onClick={() => onGenerate(data.id)} 
                              disabled={data.isLoading || !isConfigured || (requiresInputImage && !hasInputImage)}
                              title={!isConfigured ? '请在设置中配置 API Key' : requiresInputImage && !hasInputImage ? '需要连接输入图片' : '开始生成'}
                              className={`shrink-0 h-9 w-9 rounded-full flex items-center justify-center transition-all active:scale-[0.95] ${
                                  data.isLoading || !isConfigured || (requiresInputImage && !hasInputImage) ? sendBtnDisabled : sendBtnEnabled
                              }`}
                          >
                              {data.isLoading ? (
                                  <Icons.Loader2 className="animate-spin" size={14}/>
                              ) : (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M12 19V5" />
                                      <path d="M5 12l7-7 7 7" />
                                  </svg>
                              )}
                          </button>
                      </div>
                 </div>
            </div>
        )}

        {/* Expanded modal panel rendered to body so it isn't affected by canvas transforms */}
        {isExpanded && typeof document !== 'undefined' && createPortal(
            <div
                className="fixed inset-0 z-[200] flex items-center justify-center p-6"
                onMouseDown={(e) => { if (e.target === e.currentTarget) setIsExpanded(false); }}
            >
                <div
                    className={`relative flex w-[min(900px,90vw)] max-h-[80vh] flex-col gap-3 rounded-2xl border p-4 shadow-2xl ${
                        isDark ? 'bg-[#1a1a1a]/95 border-zinc-700/50 backdrop-blur-xl' : 'bg-white border-gray-200'
                    }`}
                    style={{ height: 'min(620px, 80vh)' }}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    {/* Top row: chips + collapse */}
                    <div className="flex items-center gap-2">
                        <ActionChip icon={Icons.Layers} label="风格" />
                        <ActionChip icon={Icons.MapPin} label="标记" />
                        <ActionChip icon={Icons.Scan} label="聚焦" />
                        <div className="flex-1" />
                        <button
                            type="button"
                            title="收起"
                            onClick={() => setIsExpanded(false)}
                            className={`shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all ${ghostIconBtn}`}
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 14h6v6" />
                                <path d="M20 10h-6V4" />
                                <path d="M14 10l7-7" />
                                <path d="M3 21l7-7" />
                            </svg>
                        </button>
                    </div>

                    {/* Textarea fills remaining space */}
                    <textarea
                        className={`flex-1 w-full bg-transparent rounded-xl px-2 py-2 text-sm leading-relaxed resize-none focus:outline-none no-scrollbar ${isDark ? 'text-white placeholder-zinc-500' : 'text-gray-900 placeholder-gray-400'}`}
                        placeholder="描述你想要生成的画面内容，按/呼出指令，@引用素材"
                        value={data.prompt || ''}
                        onChange={(e) => updateData(data.id, { prompt: e.target.value })}
                        onWheel={(e) => e.stopPropagation()}
                        autoFocus
                    />

                    {/* Bottom params row */}
                    <div className="flex items-center gap-2 whitespace-nowrap">
                        <div className="shrink-0">
                            <LocalCustomDropdown
                                options={imageModels}
                                value={data.model || '未选择模型'}
                                onChange={(val: any) => updateData(data.id, { model: val })}
                                isOpen={activeDropdown === 'expanded-model'}
                                onToggle={() => setActiveDropdown(activeDropdown === 'expanded-model' ? null : 'expanded-model')}
                                onClose={() => setActiveDropdown(null)}
                                align="left"
                                width="w-[140px]"
                                isDark={isDark}
                            />
                        </div>
                        <div className="shrink-0">
                            <ImageSizeDropdown
                                ratio={data.aspectRatio || '1:1'}
                                resolution={data.resolution || '1k'}
                                supportedRatios={supportedRatios}
                                supportedResolutions={supportedResolutions}
                                onRatioChange={handleRatioChange}
                                onResolutionChange={(val) => updateData(data.id, { resolution: val })}
                                isOpen={activeDropdown === 'expanded-size'}
                                onToggle={() => setActiveDropdown(activeDropdown === 'expanded-size' ? null : 'expanded-size')}
                                onClose={() => setActiveDropdown(null)}
                                isDark={isDark}
                            />
                        </div>
                        <button
                            type="button"
                            className={`shrink-0 inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-medium transition-all ${ghostIconBtn}`}
                            onClick={(e) => e.stopPropagation()}
                            title="摄像机"
                        >
                            <Icons.Camera size={14} />
                            <span>摄像机</span>
                        </button>

                        <div className="flex-1" />

                        <div className="shrink-0">
                            <LocalCustomDropdown
                                options={['1张', '2张', '3张', '4张']}
                                value={`${data.count || 1}张`}
                                onChange={(val: any) => updateData(data.id, { count: parseInt(String(val), 10) || 1 })}
                                isOpen={activeDropdown === 'expanded-count'}
                                onToggle={() => setActiveDropdown(activeDropdown === 'expanded-count' ? null : 'expanded-count')}
                                onClose={() => setActiveDropdown(null)}
                                isDark={isDark}
                            />
                        </div>

                        <button
                            type="button"
                            onClick={() => onGenerate(data.id)}
                            disabled={data.isLoading || !isConfigured || (requiresInputImage && !hasInputImage)}
                            title={!isConfigured ? '请在设置中配置 API Key' : requiresInputImage && !hasInputImage ? '需要连接输入图片' : '开始生成'}
                            className={`shrink-0 h-9 w-9 rounded-full flex items-center justify-center transition-all active:scale-[0.95] ${
                                data.isLoading || !isConfigured || (requiresInputImage && !hasInputImage) ? sendBtnDisabled : sendBtnEnabled
                            }`}
                        >
                            {data.isLoading ? (
                                <Icons.Loader2 className="animate-spin" size={14}/>
                            ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 19V5" />
                                    <path d="M5 12l7-7 7 7" />
                                </svg>
                            )}
                        </button>
                    </div>
                </div>
            </div>,
            document.body
        )}
      </>
    );
};
