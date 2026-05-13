import React from 'react';
import { NodeData, NodeType } from '../../types';

interface BaseNodeProps {
  data: NodeData;
  selected: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onConnectStart: (e: React.MouseEvent, type: 'source' | 'target') => void;
  onPortMouseUp?: (e: React.MouseEvent, nodeId: string, type: 'source' | 'target') => void;
  onResizeStart?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  scale: number;
  isDark?: boolean;
}

// Port component for cleaner code
const ConnectionPort: React.FC<{
  type: 'input' | 'output';
  isDark: boolean;
  onMouseDown?: (e: React.MouseEvent) => void;
  onMouseUp?: (e: React.MouseEvent) => void;
}> = ({ type, isDark, onMouseDown, onMouseUp }) => {
  const isInput = type === 'input';
  
  return (
    <div 
      className={`absolute ${isInput ? '-left-3' : '-right-3'} top-1/2 -translate-y-1/2 z-50 group/port`}
      onMouseDown={(e) => {
        e.stopPropagation();
        onMouseDown?.(e);
      }}
      onMouseUp={onMouseUp}
    >
      {/* Hover area for easier targeting */}
      <div className="absolute -inset-4 cursor-crosshair" />
      
      {/* Port visual */}
      <div className={`
        relative w-3.5 h-3.5 rounded-full cursor-crosshair
        transition-all duration-200 ease-out
        ${isDark 
          ? 'bg-[#1e1e1e] border border-zinc-600 shadow-[0_2px_4px_rgba(0,0,0,0.3)]' 
          : 'bg-white border border-gray-300 shadow-[0_2px_4px_rgba(0,0,0,0.1)]'
        }
        group-hover/port:scale-125 
        group-hover/port:border-blue-500
        group-hover/port:shadow-[0_0_8px_rgba(59,130,246,0.5)]
      `}>
        {/* Inner dot */}
        <div className={`
          absolute inset-[3px] rounded-full
          transition-all duration-200
          ${isDark ? 'bg-zinc-400' : 'bg-gray-400'}
          group-hover/port:bg-blue-500
        `} />
      </div>
    </div>
  );
};

const BaseNode: React.FC<BaseNodeProps> = ({ 
  data, selected, onMouseDown, onContextMenu, onConnectStart, onPortMouseUp, children, onResizeStart, isDark = true
}) => {
  
  // Get accent color based on node type
  const getAccentColor = () => {
    switch (data.type) {
      case NodeType.TEXT_TO_IMAGE: return 'cyan';
      case NodeType.TEXT_TO_VIDEO: return 'cyan';
      case NodeType.IMAGE_TO_IMAGE: return 'purple';
      case NodeType.IMAGE_TO_VIDEO: return 'orange';
      case NodeType.START_END_TO_VIDEO: return 'emerald';
      case NodeType.ORIGINAL_VIDEO: return 'orange';
      case NodeType.PANORAMA_360: return 'cyan';
      default: return 'cyan';
    }
  };

  const accentColor = getAccentColor();
  const showInputPort = data.type !== NodeType.ORIGINAL_IMAGE && data.type !== NodeType.ORIGINAL_VIDEO && data.type !== NodeType.PANORAMA_360;

  return (
    <div 
      className="absolute flex flex-col group transition-[width,height] transition-node-resize"
      style={{
        left: data.x,
        top: data.y,
        width: data.width,
        height: data.height,
        zIndex: data.isStackOpen ? 100 : (selected ? 50 : 10), 
        overflow: 'visible' 
      }}
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
    >
      {/* Main Content Area */}
      <div className="relative w-full h-full">
          {children}

          {/* Connection Ports */}
          {showInputPort && (
            <ConnectionPort 
              type="input" 
              isDark={isDark} 
              onMouseUp={(e) => onPortMouseUp?.(e, data.id, 'target')}
            />
          )}

          <ConnectionPort 
            type="output" 
            isDark={isDark} 
            onMouseDown={(e) => onConnectStart(e, 'source')}
          />

          {/* Resize Handle */}
          <div 
              className={`
                absolute -right-1 -bottom-1 w-5 h-5 cursor-se-resize z-50 
                flex items-center justify-center
                opacity-0 group-hover:opacity-100 transition-opacity duration-200
              `}
              onMouseDown={onResizeStart}
          >
              <svg width="10" height="10" viewBox="0 0 10 10" className={isDark ? 'text-zinc-500' : 'text-gray-400'}>
                <path d="M9 1L1 9M9 5L5 9M9 9L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
          </div>
      </div>
    </div>
  );
};

export default BaseNode;
