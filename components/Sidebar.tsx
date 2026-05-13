import React, { useState, useRef, useEffect, memo, useMemo } from 'react';
import { Icons } from './Icons';
import { NodeData } from '../types';

interface SidebarProps {
  onClearCanvas: () => void;
  onImportAsset: () => void;
  onOpenExportImport: () => void;
  nodes: NodeData[];
  onPreviewMedia: (url: string, type: 'image' | 'video') => void;
  isDark?: boolean;
  // Top-right toolbar actions migrated to sidebar
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onOpenCanvasManager: () => void;
}

type ActivePanel = 'HISTORY' | null;

const HistoryItem = memo(({ node, type, onClick, isDark }: { node: NodeData, type: 'image' | 'video', onClick: () => void, isDark: boolean }) => {
    const stackCount = node.outputArtifacts?.length || 0;
    
    return (
        <div 
           className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer group ${isDark ? 'bg-zinc-900' : 'bg-gray-100'}`}
           onClick={onClick}
        >
            {type === 'image' ? (
                <img src={node.imageSrc} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" decoding="async"/>
            ) : (
                <div className="w-full h-full relative">
                   <video src={node.videoSrc} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" muted preload="metadata" />
                   <div className="absolute inset-0 flex items-center justify-center">
                       <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isDark ? 'bg-white/20' : 'bg-black/20'} backdrop-blur-sm`}>
                           <Icons.Play size={14} className="text-white ml-0.5"/>
                       </div>
                   </div>
                </div>
            )}
            
            {stackCount > 1 && (
                <div className={`absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0.5 rounded-md flex items-center gap-1 ${isDark ? 'bg-black/60 text-white' : 'bg-white/80 text-gray-700'} backdrop-blur-sm`}>
                    <Icons.Layers size={10} />
                    <span className="font-semibold">{stackCount}</span>
                </div>
            )}

            <div className={`absolute inset-x-0 bottom-0 p-2 ${isDark ? 'bg-gradient-to-t from-black/80 to-transparent' : 'bg-gradient-to-t from-white/90 to-transparent'}`}>
                <div className={`text-[11px] truncate font-medium ${isDark ? 'text-white' : 'text-gray-800'}`}>{node.title}</div>
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
  onImportAsset,
  onOpenExportImport,
  nodes,
  onPreviewMedia,
  isDark = true,
  onToggleTheme,
  onOpenSettings,
  onOpenCanvasManager,
}) => {
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [historyTab, setHistoryTab] = useState<'image' | 'video'>('image');
  const sidebarRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

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
        className={`relative w-11 h-11 flex items-center justify-center rounded-2xl transition-all duration-200 group disabled:opacity-40 disabled:cursor-not-allowed hover:-translate-y-0.5 ${
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
          }`} />
        )}
        <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
        <div className={`absolute left-full ml-3 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap opacity-0 translate-x-1 group-hover:translate-x-0 group-hover:opacity-100 transition-all pointer-events-none z-50 ${
          isDark ? 'bg-zinc-950 text-white border border-white/10 shadow-xl shadow-black/30' : 'bg-white text-gray-900 border border-gray-200 shadow-xl shadow-gray-200/70'
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
      return (
        <div 
          ref={panelRef}
          className={`fixed left-[92px] top-4 bottom-4 w-80 ${bgMain} backdrop-blur-2xl border ${borderColor} rounded-[26px] z-[190] flex flex-col shadow-2xl shadow-black/10 animate-in slide-in-from-left-2 fade-in duration-200 overflow-hidden`}
        >
          {/* Header */}
          <div className={`px-5 py-4 border-b ${borderColor} flex items-center justify-between shrink-0 ${isDark ? 'bg-white/[0.02]' : 'bg-slate-50/70'}`}>
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-2xl ${isDark ? 'bg-blue-500/15' : 'bg-blue-50'}`}>
                <Icons.Clock size={18} className={isDark ? 'text-blue-400' : 'text-blue-600'} />
              </div>
              <div>
                <h3 className={`text-base font-bold ${textMain}`}>生成历史</h3>
                <p className={`text-xs ${textMuted}`}>查看已生成的媒体</p>
              </div>
            </div>
            <button 
              onClick={() => setActivePanel(null)}
              className={`p-2 rounded-xl ${hoverBg} ${textSub}`}
            >
              <Icons.X size={18} />
            </button>
          </div>
          
          {/* Tabs */}
          <div className={`px-4 pt-4 shrink-0`}>
            <div className={`flex p-1 rounded-xl ${isDark ? 'bg-zinc-900' : 'bg-gray-100'}`}>
              <button 
                className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
                  historyTab === 'image' 
                    ? (isDark ? 'bg-zinc-700 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm') 
                    : textSub
                }`}
                onClick={() => setHistoryTab('image')}
              >
                <Icons.Image size={14} />
                图片 ({imageNodes.length})
              </button>
              <button 
                className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
                  historyTab === 'video' 
                    ? (isDark ? 'bg-zinc-700 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm') 
                    : textSub
                }`}
                onClick={() => setHistoryTab('video')}
              >
                <Icons.Video size={14} />
                视频 ({videoNodes.length})
              </button>
            </div>
          </div>

          {/* Content Grid */}
          <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
            {(historyTab === 'image' ? imageNodes : videoNodes).length === 0 ? (
              <div className={`flex flex-col items-center justify-center h-full ${textMuted}`}>
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${isDark ? 'bg-zinc-800' : 'bg-gray-100'}`}>
                  {historyTab === 'image' ? <Icons.Image size={28} className="opacity-40" /> : <Icons.Video size={28} className="opacity-40" />}
                </div>
                <p className="text-sm font-medium">暂无生成历史</p>
                <p className={`text-xs mt-1 ${textMuted}`}>生成的{historyTab === 'image' ? '图片' : '视频'}将显示在这里</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {(historyTab === 'image' ? imageNodes : videoNodes).map(node => (
                  <HistoryItem 
                    key={node.id} 
                    node={node} 
                    type={historyTab} 
                    isDark={isDark}
                    onClick={() => onPreviewMedia(
                      (historyTab === 'image' ? node.imageSrc : node.videoSrc) || '', 
                      historyTab
                    )}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer Stats */}
          <div className={`px-4 py-3 border-t ${borderColor} shrink-0`}>
            <div className={`flex items-center justify-between text-xs ${textMuted}`}>
              <span>共 {(historyTab === 'image' ? imageNodes : videoNodes).length} 项</span>
              <span>{historyTab === 'image' ? '图片' : '视频'}历史</span>
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
        className={`fixed left-5 top-1/2 -translate-y-1/2 z-[200] ${bgMain} backdrop-blur-2xl border ${borderColor} rounded-[26px] p-2.5 flex flex-col items-center gap-1.5 shadow-2xl shadow-black/10`}
      >
        <SidebarButton icon={Icons.Clock} panel="HISTORY" tooltip="生成历史" />
        <SidebarButton icon={Icons.Upload} tooltip="导入素材" onClick={onImportAsset} />

        <div className={`w-8 h-px my-1 ${isDark ? 'bg-zinc-800' : 'bg-gray-200'}`} />

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
