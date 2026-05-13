
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { NodeData } from '../../types';
import { Icons } from '../Icons';
import { getModelConfig } from '../../services/geminiService';
import { getCanvasModelOptions, CanvasModelOption } from '../../services/modelService';
import { VIDEO_HANDLERS } from '../../services/mode/video/configurations';
import { getVideoConstraints, getAutoCorrectedVideoSettings } from '../../services/mode/video/rules';
import { LocalEditableTitle, LocalCustomDropdown, LocalInputThumbnails, LocalMediaStack } from './Shared/LocalNodeComponents';

interface ImageToVideoNodeProps {
  data: NodeData;
  updateData: (id: string, updates: Partial<NodeData>) => void;
  onGenerate: (id: string) => void;
  selected?: boolean;
  showControls?: boolean;
  inputs?: string[];
  onMaximize?: (id: string) => void;
  onDownload?: (id: string) => void;
  isDark?: boolean;
  isSelecting?: boolean;
}

export const ImageToVideoNode: React.FC<ImageToVideoNodeProps> = ({
    data, updateData, onGenerate, selected, showControls, inputs = [], onMaximize, onDownload, isDark = true, isSelecting
}) => {
    const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
    const [deferredInputs, setDeferredInputs] = useState(false);
    const [progress, setProgress] = useState(0);
    const [isConfigured, setIsConfigured] = useState(true);
    const [videoModels, setVideoModels] = useState<CanvasModelOption[]>([]);

    const isSelectedAndStable = selected && !isSelecting;
    const hasInputImage = inputs.length > 0;

    const checkConfig = useCallback(() => {
         if (!data.model) {
             setIsConfigured(false);
             return;
         }
         const cfg = getModelConfig(data.model);
         setIsConfigured(!!cfg.key);
    }, [data.model]);

    const updateModels = useCallback(() => {
        const models = getCanvasModelOptions('VIDEO');
        setVideoModels(models);
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

    // Group models for dropdown
    const groupedVideoModels = useMemo(() => {
        const groups: Record<string, CanvasModelOption[]> = {
            'Kling': [],
            'Hailuo': [],
            'Veo': [],
            'Wan': []
        };
        const ungrouped: CanvasModelOption[] = [];
        
        videoModels.forEach(m => {
            const label = m.label || m.value;
            const lower = label.toLowerCase();
            if (label.startsWith('Kling') || label.includes('可灵')) {
                 groups['Kling'].push(m);
            } else if (label.startsWith('海螺') || lower.includes('hailuo')) {
                 groups['Hailuo'].push(m);
            } else if (label.startsWith('Veo')) {
                 groups['Veo'].push(m);
            } else if (label.startsWith('Wan') || lower.includes('wan')) {
                 groups['Wan'].push(m);
            } else {
                 ungrouped.push(m);
            }
        });
        
        const result = Object.entries(groups)
            .filter(([_, items]) => items.length > 0)
            .map(([label, items]) => ({ label, items }));
            
        return [...result, ...ungrouped];
    }, [videoModels]);

    useEffect(() => { if (isSelectedAndStable && showControls) { const t = setTimeout(() => setDeferredInputs(true), 100); return () => clearTimeout(t); } else setDeferredInputs(false); }, [isSelectedAndStable, showControls]);
    useEffect(() => { let interval: any; if (data.isLoading) { setProgress(0); interval = setInterval(() => { setProgress(prev => (prev >= 95 ? 95 : prev + Math.max(0.5, (95 - prev) / 20))); }, 200); } else setProgress(0); return () => clearInterval(interval); }, [data.isLoading]);

    const handleRatioChange = (ratio: string) => {
        const currentShort = Math.min(data.width, data.height);
        const baseSize = Math.max(currentShort, 400);

        const [wStr, hStr] = ratio.split(':');
        const wR = parseFloat(wStr);
        const hR = parseFloat(hStr);
        const r = wR / hR;

        let newW, newH;
        if (r >= 1) {
            newH = baseSize;
            newW = baseSize * r;
        } else {
            newW = baseSize;
            newH = baseSize / r;
        }
        updateData(data.id, { aspectRatio: ratio, width: Math.round(newW), height: Math.round(newH) });
    };

    const currentModel = data.model || 'Sora 2';
    const handler = VIDEO_HANDLERS[currentModel] || VIDEO_HANDLERS['__GENERIC__'] || VIDEO_HANDLERS['Sora 2'];
    const rules = handler.rules;

    const resOptions = rules.resolutions || ['720p'];
    const durOptions = rules.durations || ['5s'];
    const ratioOptions = rules.ratios || ['16:9'];
    const canOptimize = !!rules.hasPromptExtend;

    // Constraints & Auto-Correction
    const constraints = getVideoConstraints(currentModel, data.resolution, data.duration, inputs.length);
    const displayResValue = (data.model?.includes('海螺') && (data.resolution === '720p' || data.resolution === '768p')) ? '768p' : data.resolution;

    useEffect(() => {
        let updates: Partial<NodeData> = {};
        const corrections = getAutoCorrectedVideoSettings(currentModel, data.resolution, data.duration, inputs.length);
        if (corrections.resolution) updates.resolution = corrections.resolution;
        if (corrections.duration) updates.duration = corrections.duration;

        if (data.resolution && !resOptions.includes(data.resolution)) updates.resolution = resOptions[0];
        if (data.duration && !durOptions.includes(data.duration)) updates.duration = durOptions[0];
        if (data.aspectRatio && !ratioOptions.includes(data.aspectRatio)) updates.aspectRatio = ratioOptions[0];

        if (Object.keys(updates).length > 0) updateData(data.id, updates);
    }, [data.model, data.resolution, data.duration, data.aspectRatio, resOptions, durOptions, ratioOptions, currentModel, inputs.length, updateData, data.id]);

    const containerBg = isDark ? 'bg-[#1e1e1e]' : 'bg-white';
    const containerBorder = selected ? 'border-orange-500 ring-1 ring-orange-500' : (isDark ? 'border-zinc-800' : 'border-gray-200');
    const overlayToolbarBg = isDark ? 'bg-black/50 border-white/5 text-gray-400' : 'bg-white/50 border-black/5 text-gray-600';
    const controlPanelBg = isDark ? 'bg-[#1e1e1e] border-zinc-700/80' : 'bg-white border-gray-200';
    const inputBg = isDark ? 'bg-zinc-900/50 hover:bg-zinc-900 border-transparent focus:border-orange-500/50 text-zinc-200 placeholder-zinc-500' : 'bg-gray-50 hover:bg-gray-100 border-gray-200 focus:border-orange-400 text-gray-900 placeholder-gray-400';
    const dividerColor = isDark ? 'bg-zinc-800' : 'bg-gray-200';
    const emptyStateIconColor = isDark ? 'bg-zinc-900/50 border-zinc-800 text-zinc-600' : 'bg-gray-100 border-gray-200 text-gray-400';
    const emptyStateTextColor = isDark ? 'text-zinc-500' : 'text-gray-400';
    const warningColor = isDark ? 'text-amber-400' : 'text-amber-600';
    const hasResult = !!data.videoSrc && !data.isLoading;

    return (
      <>
        <div className="absolute bottom-full left-0 w-full mb-2 flex items-center justify-between pointer-events-auto">
           <div className="flex items-center gap-2 pl-1"><LocalEditableTitle title={data.title} onUpdate={(t) => updateData(data.id, { title: t })} isDark={isDark} /></div>
           <div className={`flex gap-1 backdrop-blur-md rounded-lg p-1 border ${overlayToolbarBg}`}>
               <button title="最大化" className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-zinc-800 hover:text-white' : 'hover:bg-gray-200 hover:text-black'}`} onClick={(e) => { e.stopPropagation(); onMaximize?.(data.id); }}><Icons.Maximize2 size={12} /></button>
               <button title="下载" className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-zinc-800 hover:text-white' : 'hover:bg-gray-200 hover:text-black'}`} onClick={(e) => { e.stopPropagation(); onDownload?.(data.id); }}><Icons.Download size={12} /></button>
           </div>
        </div>
        
        <div className={`w-full h-full relative rounded-xl border ${containerBorder} ${containerBg} ${data.isStackOpen ? 'overflow-visible' : 'overflow-hidden'} shadow-lg group`}>
            {hasResult ? (
                 <LocalMediaStack data={data} updateData={updateData} currentSrc={data.videoSrc} onMaximize={onMaximize} isDark={isDark} selected={selected} />
            ) : (
                <div className={`w-full h-full flex flex-col items-center justify-center ${emptyStateTextColor} grid-pattern`}>
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 border ${emptyStateIconColor}`}>
                        <Icons.Clapperboard size={20} className="opacity-50"/>
                    </div>
                    <span className="text-[11px] font-medium tracking-wide opacity-60">图生视频</span>
                    {!hasInputImage && (
                        <span className={`text-[10px] mt-2 flex items-center gap-1 ${warningColor}`}>
                            <Icons.AlertCircle size={10} />
                            需要连接输入图片
                        </span>
                    )}
                </div>
            )}
            {data.isLoading && <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-20"><Icons.Loader2 size={24} className="text-orange-500 animate-spin" /></div>}
        </div>

        {isSelectedAndStable && showControls && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-full min-w-[450px] pt-3 z-[70] pointer-events-auto" onMouseDown={(e) => e.stopPropagation()}>
               {inputs.length > 0 && <LocalInputThumbnails inputs={inputs} ready={deferredInputs} isDark={isDark} label="参考图" />}
               {!hasInputImage && (
                   <div className={`mb-2 px-3 py-2 rounded-lg border flex items-center gap-2 text-[10px] ${isDark ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-600'}`}>
                       <Icons.AlertCircle size={12} />
                       <span>请先连接一个图片节点作为参考图</span>
                   </div>
               )}
              <div className={`${controlPanelBg} rounded-2xl p-3 shadow-2xl flex flex-col gap-3 border`}>
                  <textarea className={`w-full border rounded-xl p-3 text-[11px] leading-relaxed resize-none focus:outline-none min-h-[70px] no-scrollbar ${inputBg}`} placeholder="描述视频运动效果..." value={data.prompt || ''} onChange={(e) => updateData(data.id, { prompt: e.target.value })} onWheel={(e) => e.stopPropagation()} />
                  <div className="flex items-center justify-between gap-2 h-7">
                       <LocalCustomDropdown options={groupedVideoModels} value={data.model || '未选择模型'} onChange={(val: any) => updateData(data.id, { model: val })} isOpen={activeDropdown === 'model'} onToggle={() => setActiveDropdown(activeDropdown === 'model' ? null : 'model')} onClose={() => setActiveDropdown(null)} align="left" width="w-[130px]" isDark={isDark} />
                       <div className={`w-px h-3 ${dividerColor}`}></div>
                       <div className="flex items-center gap-1">
                          <LocalCustomDropdown icon={Icons.Crop} options={ratioOptions} value={data.aspectRatio || '16:9'} onChange={handleRatioChange} isOpen={activeDropdown === 'ratio'} onToggle={() => setActiveDropdown(activeDropdown === 'ratio' ? null : 'ratio')} onClose={() => setActiveDropdown(null)} disabledOptions={constraints.disabledRatios} isDark={isDark} />
                          <LocalCustomDropdown icon={Icons.Monitor} options={resOptions} value={displayResValue || '720p'} onChange={(val: any) => updateData(data.id, { resolution: val })} isOpen={activeDropdown === 'res'} onToggle={() => setActiveDropdown(activeDropdown === 'res' ? null : 'res')} onClose={() => setActiveDropdown(null)} disabledOptions={constraints.disabledRes} isDark={isDark} />
                          <LocalCustomDropdown icon={Icons.Clock} options={durOptions} value={data.duration || '5s'} onChange={(val: any) => updateData(data.id, { duration: val })} isOpen={activeDropdown === 'duration'} onToggle={() => setActiveDropdown(activeDropdown === 'duration' ? null : 'duration')} onClose={() => setActiveDropdown(null)} disabledOptions={constraints.disabledDurations} isDark={isDark} />
                          <LocalCustomDropdown icon={Icons.Layers} options={[1, 2, 3, 4]} value={data.count || 1} onChange={(val: any) => updateData(data.id, { count: val })} isOpen={activeDropdown === 'count'} onToggle={() => setActiveDropdown(activeDropdown === 'count' ? null : 'count')} onClose={() => setActiveDropdown(null)} isDark={isDark} />
                          
                          <button 
                              className={`h-full px-2 rounded flex items-center justify-center transition-colors ${canOptimize ? (data.promptOptimize ? (isDark ? 'text-orange-400 bg-orange-500/10' : 'text-orange-600 bg-orange-50') : (isDark ? 'text-zinc-500 hover:text-gray-300 hover:bg-white/5' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100')) : (isDark ? 'text-zinc-700 opacity-50 cursor-not-allowed' : 'text-gray-200 opacity-50 cursor-not-allowed')}`} 
                              onClick={() => canOptimize && updateData(data.id, { promptOptimize: !data.promptOptimize })}
                              title={canOptimize ? `提示词优化: ${data.promptOptimize ? '开启' : '关闭'}` : '不支持提示词优化'}
                              disabled={!canOptimize}
                          >
                              <Icons.Sparkles size={13} fill={data.promptOptimize && canOptimize ? "currentColor" : "none"} />
                          </button>
                       </div>
                       <button 
                           onClick={() => onGenerate(data.id)} 
                           className={`ml-auto relative h-7 px-4 text-[11px] font-bold rounded-full flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-[0.98] overflow-hidden min-w-[90px] ${data.isLoading || !isConfigured || !hasInputImage ? 'opacity-50 cursor-not-allowed bg-zinc-600 text-white' : 'bg-orange-600 hover:bg-orange-500 text-white shadow-orange-500/20'}`} 
                           disabled={data.isLoading || !isConfigured || !hasInputImage} 
                           title={!isConfigured ? '请在设置中配置API Key' : !hasInputImage ? '需要连接输入图片' : '生成'}
                       >
                          {data.isLoading && <div className="absolute left-0 top-0 h-full bg-orange-500/30 z-0 transition-all duration-300 ease-linear" style={{ width: `${progress}%` }}><div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent w-[200%] animate-[shimmer_2s_infinite]"></div></div>}
                          <div className="relative z-10 flex items-center gap-1.5">{data.isLoading ? <span className="tabular-nums">{Math.floor(progress)}%</span> : <><Icons.Wand2 size={12} /><span>生成</span></>}</div>
                      </button>
                  </div>
              </div>
          </div>
        )}
      </>
    );
};
