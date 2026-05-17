import React, { useState, useRef, useEffect, memo, useMemo, useCallback } from 'react';
import { Icons } from './Icons';
import { NodeData } from '../types';
import { storageService, AssetEntry } from '../services/storageService';

interface SidebarProps {
  onClearCanvas: () => void;
  onOpenExportImport: () => void;
  nodes: NodeData[];
  onPreviewMedia: (url: string, type: 'image' | 'video') => void;
  onAddAssetToCanvas?: (asset: { src: string; title?: string; width?: number; height?: number; }) => void;
  onImportToLibrary?: () => void;
  isDark?: boolean;
  // Top-right toolbar actions migrated to sidebar
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onOpenCanvasManager: () => void;
}

type ActivePanel = 'HISTORY' | 'ASSETS' | null;

const HistoryItem = memo(({ node, type, onClick, isDark }: { node: NodeData, type: 'image' | 'video', onClick: () => void, isDark: boolean }) => {
    const stackCount = node.outputArtifacts?.length || 0;
    
    return (
        <div
           className={`media-tile relative aspect-square rounded-xl overflow-hidden cursor-pointer group ${isDark ? 'bg-zinc-900' : 'bg-gray-100'}`}
           onClick={onClick}
        >
            {type === 'image' ? (
                <img src={node.imageSrc} className="w-full h-full object-cover transition-transform duration-500 ease-organic group-hover:scale-[1.06]" loading="lazy" decoding="async"/>
            ) : (
                <div className="w-full h-full relative">
                   <video src={node.videoSrc} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-300" muted preload="metadata" />
                   <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                       <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-transform duration-200 ease-organic group-hover:scale-110 ${isDark ? 'bg-white/25' : 'bg-black/30'} backdrop-blur-md shadow-md`}>
                           <Icons.Play size={14} className="text-white ml-0.5"/>
                       </div>
                   </div>
                </div>
            )}

            {stackCount > 1 && (
                <div className={`absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0.5 rounded-md flex items-center gap-1 ${isDark ? 'bg-black/65 text-white' : 'bg-white/85 text-gray-800'} backdrop-blur-md ring-1 ring-inset ${isDark ? 'ring-white/10' : 'ring-black/[0.04]'}`}>
                    <Icons.Layers size={10} />
                    <span className="font-semibold tabular-nums">{stackCount}</span>
                </div>
            )}

            <div className={`pointer-events-none absolute inset-x-0 bottom-0 p-2 ${isDark ? 'bg-gradient-to-t from-black/85 via-black/40 to-transparent' : 'bg-gradient-to-t from-white/95 via-white/50 to-transparent'}`}>
                <div className={`text-[11px] truncate font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{node.title}</div>
            </div>
        </div>
    );
}, (prev, next) => {
    return prev.type === next.type && 
           prev.node.id === next.node.id && 
           prev.node.imageSrc === next.node.imageSrc && 
           prev.node.videoSrc === next.node.videoSrc &&
           prev.node.title === next.node.title &&
           prev.isDark === next.isDark &&
           (prev.node.outputArtifacts?.length || 0) === (next.node.outputArtifacts?.length || 0);
});

const Sidebar: React.FC<SidebarProps> = ({
  onClearCanvas,
  onOpenExportImport,
  nodes,
  onPreviewMedia,
  onAddAssetToCanvas,
  onImportToLibrary,
  isDark = true,
  onToggleTheme,
  onOpenSettings,
  onOpenCanvasManager,
}) => {
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [historyTab, setHistoryTab] = useState<'image' | 'video'>('image');
  const [assets, setAssets] = useState<AssetEntry[]>([]);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const refreshAssets = useCallback(async () => {
    try {
      const list = await storageService.listAssets();
      setAssets(list);
    } catch {}
  }, []);

  useEffect(() => {
    if (activePanel === 'ASSETS') refreshAssets();
  }, [activePanel, refreshAssets]);

  useEffect(() => {
    const onUpdate = () => refreshAssets();
    window.addEventListener('assetLibraryUpdated', onUpdate);
    return () => window.removeEventListener('assetLibraryUpdated', onUpdate);
  }, [refreshAssets]);

  const handleDeleteAsset = useCallback(async (id: string) => {
    await storageService.deleteAsset(id);
    refreshAssets();
    // 通知节点端刷新「已加入」状态，否则节点会卡在已加入而无法重新加入
    window.dispatchEvent(new CustomEvent('assetLibraryUpdated'));
  }, [refreshAssets]);

  // Deduplicate nodes for history display
  const uniqueNodes = useMemo(() => {
      const map = new Map<string, NodeData>();
      nodes.forEach(n => {
          if (!map.has(n.id)) map.set(n.id, n);
      });
      return Array.from(map.values());
  }, [nodes]);

  const imageNodes = useMemo(() => 
      uniqueNodes.filter(n => n.imageSrc && !n.isLoading), 
  [uniqueNodes]);
  
  const videoNodes = useMemo(() => 
      uniqueNodes.filter(n => n.videoSrc && !n.isLoading), 
  [uniqueNodes]);

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        sidebarRef.current && 
        !sidebarRef.current.contains(target) &&
        panelRef.current &&
        !panelRef.current.contains(target)
      ) {
        setActivePanel(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const togglePanel = (panel: ActivePanel) => {
    setActivePanel(prev => prev === panel ? null : panel);
  };

  // 样式
  const bgMain = isDark ? 'bg-zinc-950/90' : 'bg-white/90';
  const borderColor = isDark ? 'border-white/10' : 'border-gray-200/70';
  const textMain = isDark ? 'text-white' : 'text-gray-900';
  const textSub = isDark ? 'text-gray-400' : 'text-gray-500';
  const textMuted = isDark ? 'text-gray-500' : 'text-gray-400';
  const hoverBg = isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100';
  const activeBg = isDark ? 'bg-blue-500 text-white shadow-lg shadow-blue-950/30' : 'bg-blue-500 text-white shadow-lg shadow-blue-500/25';

  // 侧边栏按钮
  const SidebarButton = ({ 
    icon: Icon, 
    panel, 
    tooltip,
    onClick,
    active,
    disabled,
  }: { 
    icon: any, 
    panel?: ActivePanel, 
    tooltip: string,
    onClick?: () => void,
    active?: boolean,
    disabled?: boolean,
  }) => {
    const isActive = active || (panel && activePanel === panel);
    
    return (
      <button
        disabled={disabled}
        className={`relative w-11 h-11 flex items-center justify-center rounded-2xl group disabled:opacity-40 disabled:cursor-not-allowed press transition-[background-color,color] duration-200 ease-organic ${
          isActive ? activeBg : `${textSub} ${hoverBg}`
        }`}
        onClick={() => {
          if (onClick) {
            onClick();
          } else if (panel) {
            togglePanel(panel);
          }
        }}
      >
        {isActive && (
          <span className={`absolute -left-2 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full ${
            isDark ? 'bg-blue-400' : 'bg-blue-500'
          } animate-stagger`} />
        )}
        <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
        <div className={`surface-chip absolute left-full ml-3 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap opacity-0 translate-x-1 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-200 ease-organic pointer-events-none z-50 ${
          isDark ? 'text-white' : 'text-gray-900'
        }`}>
          {tooltip}
        </div>
      </button>
    );
  };

  // 渲染面板内容
  const renderPanel = () => {
    if (!activePanel) return null;

    // 生成历史面板 - 独立的大面板
    if (activePanel === 'HISTORY') {
      const currentList = historyTab === 'image' ? imageNodes : videoNodes;
      return (
        <div
          ref={panelRef}
          className="surface-panel fixed left-[92px] top-4 bottom-4 w-80 rounded-[26px] z-[190] flex flex-col animate-in slide-in-from-left-2 fade-in duration-200 ease-organic overflow-hidden"
        >
          {/* Header */}
          <div className={`px-5 py-4 flex items-center justify-between shrink-0 ${isDark ? 'bg-white/[0.025]' : 'bg-slate-50/60'}`}>
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-2xl ${isDark ? 'bg-gradient-to-br from-blue-500/25 to-blue-500/10 ring-1 ring-inset ring-blue-400/20' : 'bg-gradient-to-br from-blue-100 to-blue-50 ring-1 ring-inset ring-blue-200/60'}`}>
                <Icons.Clock size={18} className={isDark ? 'text-blue-300' : 'text-blue-600'} />
              </div>
              <div>
                <h3 className={`text-base font-bold tracking-tight ${textMain}`}>生成历史</h3>
                <p className={`text-xs ${textMuted}`}>查看已生成的媒体</p>
              </div>
            </div>
            <button
              onClick={() => setActivePanel(null)}
              className={`p-2 rounded-xl ${hoverBg} ${textSub} press transition-colors`}
              title="关闭"
            >
              <Icons.X size={18} />
            </button>
          </div>
          <div className="divider-soft mx-5" />

          {/* Tabs */}
          <div className={`px-4 pt-4 shrink-0`}>
            <div className={`flex p-1 rounded-xl ${isDark ? 'bg-zinc-900/60 ring-1 ring-inset ring-white/[0.04]' : 'bg-gray-100/80 ring-1 ring-inset ring-black/[0.04]'}`}>
              <button
                className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-all duration-200 ease-organic flex items-center justify-center gap-2 ${
                  historyTab === 'image'
                    ? (isDark ? 'bg-zinc-700/90 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm')
                    : `${textSub} hover:${isDark ? 'text-zinc-200' : 'text-gray-700'}`
                }`}
                onClick={() => setHistoryTab('image')}
              >
                <Icons.Image size={14} />
                图片 <span className={`tabular-nums ${historyTab === 'image' ? '' : 'opacity-60'}`}>({imageNodes.length})</span>
              </button>
              <button
                className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-all duration-200 ease-organic flex items-center justify-center gap-2 ${
                  historyTab === 'video'
                    ? (isDark ? 'bg-zinc-700/90 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm')
                    : `${textSub} hover:${isDark ? 'text-zinc-200' : 'text-gray-700'}`
                }`}
                onClick={() => setHistoryTab('video')}
              >
                <Icons.Video size={14} />
                视频 <span className={`tabular-nums ${historyTab === 'video' ? '' : 'opacity-60'}`}>({videoNodes.length})</span>
              </button>
            </div>
          </div>

          {/* Content Grid */}
          <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
            {currentList.length === 0 ? (
              <div className={`flex flex-col items-center justify-center h-full ${textMuted}`}>
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ring-1 ring-inset ${isDark ? 'bg-zinc-900/60 ring-white/[0.06]' : 'bg-gray-100 ring-black/[0.04]'} animate-soft-pulse`}>
                  {historyTab === 'image' ? <Icons.Image size={28} className="opacity-50" /> : <Icons.Video size={28} className="opacity-50" />}
                </div>
                <p className="text-sm font-medium">暂无生成历史</p>
                <p className={`text-xs mt-1 ${textMuted}`}>生成的{historyTab === 'image' ? '图片' : '视频'}将显示在这里</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {currentList.map((node, idx) => (
                  <div key={node.id} className="animate-stagger" style={{ animationDelay: `${Math.min(idx * 22, 220)}ms` }}>
                    <HistoryItem
                      node={node}
                      type={historyTab}
                      isDark={isDark}
                      onClick={() => onPreviewMedia(
                        (historyTab === 'image' ? node.imageSrc : node.videoSrc) || '',
                        historyTab
                      )}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer Stats */}
          <div className="divider-soft mx-5" />
          <div className={`px-5 py-3 shrink-0`}>
            <div className={`flex items-center justify-between text-xs ${textMuted}`}>
              <span className="tabular-nums">共 {currentList.length} 项</span>
              <span>{historyTab === 'image' ? '图片' : '视频'}历史</span>
            </div>
          </div>
        </div>
      );
    }

    // 素材库面板
    if (activePanel === 'ASSETS') {
      return (
        <div
          ref={panelRef}
          className="surface-panel fixed left-[92px] top-4 bottom-4 w-80 rounded-[26px] z-[190] flex flex-col animate-in slide-in-from-left-2 fade-in duration-200 ease-organic overflow-hidden"
        >
          {/* Header */}
          <div className={`px-5 py-4 flex items-center justify-between shrink-0 ${isDark ? 'bg-white/[0.025]' : 'bg-slate-50/60'}`}>
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-2xl ${isDark ? 'bg-gradient-to-br from-purple-500/25 to-purple-500/10 ring-1 ring-inset ring-purple-400/20' : 'bg-gradient-to-br from-purple-100 to-purple-50 ring-1 ring-inset ring-purple-200/60'}`}>
                <Icons.Images size={18} className={isDark ? 'text-purple-300' : 'text-purple-600'} />
              </div>
              <div>
                <h3 className={`text-base font-bold tracking-tight ${textMain}`}>素材库</h3>
                <p className={`text-xs ${textMuted}`}>跨画布共享的图片集合</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={onImportToLibrary}
                title="导入本地图片到素材库"
                className={`press inline-flex h-8 items-center gap-1.5 px-2.5 rounded-lg text-[12px] font-medium transition-colors duration-150 ${isDark ? 'bg-purple-500/15 text-purple-300 hover:bg-purple-500/25 ring-1 ring-inset ring-purple-400/15' : 'bg-purple-50 text-purple-700 hover:bg-purple-100 ring-1 ring-inset ring-purple-200/60'}`}
              >
                <Icons.Upload size={13} />
                <span>导入</span>
              </button>
              <button
                onClick={() => setActivePanel(null)}
                className={`p-2 rounded-xl ${hoverBg} ${textSub} press transition-colors`}
                title="关闭"
              >
                <Icons.X size={18} />
              </button>
            </div>
          </div>
          <div className="divider-soft mx-5" />

          {/* Content Grid */}
          <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
            {assets.length === 0 ? (
              <div className={`flex flex-col items-center justify-center h-full ${textMuted}`}>
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ring-1 ring-inset ${isDark ? 'bg-zinc-900/60 ring-white/[0.06]' : 'bg-gray-100 ring-black/[0.04]'} animate-soft-pulse`}>
                  <Icons.Images size={28} className="opacity-50" />
                </div>
                <p className="text-sm font-medium">素材库为空</p>
                <p className={`text-xs mt-1 ${textMuted}`}>在图片节点点击"加入素材库"以收藏</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {assets.map((asset, idx) => (
                  <div
                    key={asset.id}
                    className={`media-tile animate-stagger relative aspect-square rounded-xl overflow-hidden cursor-pointer group ${isDark ? 'bg-zinc-900' : 'bg-gray-100'}`}
                    style={{ animationDelay: `${Math.min(idx * 22, 220)}ms` }}
                    onClick={() => onAddAssetToCanvas?.({ src: asset.src, title: asset.title, width: asset.width, height: asset.height })}
                    title="点击加入画布"
                  >
                    <img src={asset.src} className="w-full h-full object-cover transition-transform duration-500 ease-organic group-hover:scale-[1.06]" loading="lazy" decoding="async" />

                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDeleteAsset(asset.id); }}
                      className="absolute top-1.5 right-1.5 inline-flex h-6 w-6 items-center justify-center rounded-md bg-black/55 hover:bg-red-500/90 backdrop-blur-md text-white/85 hover:text-white transition-all duration-150 opacity-0 group-hover:opacity-100 translate-y-0.5 group-hover:translate-y-0 shadow-md press"
                      title="删除"
                    >
                      <Icons.Trash2 size={11} />
                    </button>

                    <div className={`pointer-events-none absolute inset-x-0 bottom-0 p-2 ${isDark ? 'bg-gradient-to-t from-black/85 via-black/40 to-transparent' : 'bg-gradient-to-t from-white/95 via-white/50 to-transparent'}`}>
                      <div className={`text-[11px] truncate font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{asset.title}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer Stats */}
          <div className="divider-soft mx-5" />
          <div className={`px-5 py-3 shrink-0`}>
            <div className={`flex items-center justify-between text-xs ${textMuted}`}>
              <span className="tabular-nums">共 {assets.length} 项</span>
              <button
                type="button"
                onClick={() => { if (confirm('清空全部素材？此操作不可恢复。')) storageService.clearAssets().then(() => { refreshAssets(); window.dispatchEvent(new CustomEvent('assetLibraryUpdated')); }); }}
                className={`${textMuted} hover:text-red-500 transition-colors disabled:opacity-50 disabled:hover:text-current disabled:cursor-not-allowed`}
                disabled={assets.length === 0}
              >
                清空
              </button>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <>
      {/* Sidebar */}
      <div
        ref={sidebarRef}
        className="surface-panel fixed left-5 top-1/2 -translate-y-1/2 z-[200] rounded-[26px] p-2.5 flex flex-col items-center gap-1.5"
      >
        <SidebarButton icon={Icons.Clock} panel="HISTORY" tooltip="生成历史" />
        <SidebarButton icon={Icons.Images} panel="ASSETS" tooltip="素材库" />

        <div className={`w-7 my-1.5 divider-soft`} />

        {/* Top-right toolbar actions migrated here */}
        <SidebarButton icon={Icons.Folder} tooltip="项目" onClick={onOpenCanvasManager} />
        <SidebarButton icon={Icons.Download} tooltip="下载" onClick={onOpenExportImport} />
        <SidebarButton icon={isDark ? Icons.Sun : Icons.Moon} tooltip={isDark ? '切换为亮色' : '切换为暗色'} onClick={onToggleTheme} />
        <SidebarButton icon={Icons.Trash2} tooltip="清空当前画布" onClick={onClearCanvas} />
        <SidebarButton icon={Icons.Settings} tooltip="设置" onClick={onOpenSettings} />
      </div>

      {/* Panel */}
      {renderPanel()}
    </>
  );
};

export default Sidebar;
