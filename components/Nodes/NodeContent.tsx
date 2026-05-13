import React, { memo } from 'react';
import { NodeData, NodeType } from '../../types';
import { TextToImageNode } from './TextToImageNode';
import { TextToVideoNode } from './TextToVideoNode';
import { StartEndToVideoNode } from './StartEndToVideoNode';
import { OriginalImageNode } from './OriginalImageNode';
import { CreativeDescNode } from './CreativeDescNode';
import { PanoramaNode } from './PanoramaNode';

interface NodeContentProps {
  data: NodeData;
  updateData: (id: string, updates: Partial<NodeData>) => void;
  onGenerate: (id: string) => void;
  onPanorama?: (id: string) => void;
  selected?: boolean;
  showControls?: boolean;
  inputs?: string[];
  onMaximize?: (id: string) => void;
  onDownload?: (id: string) => void;
  onUpload?: (nodeId: string) => void;
  isSelecting?: boolean;
  onDelete?: (id: string) => void;
  isDark?: boolean;
  canvasScale?: number;
}

const NodeContentComponent: React.FC<NodeContentProps> = (props) => {
    const { data } = props;

    switch (data.type) {
        case NodeType.TEXT_TO_IMAGE:
        case NodeType.IMAGE_TO_IMAGE:
            return <TextToImageNode {...props} />;
        case NodeType.TEXT_TO_VIDEO:
        case NodeType.IMAGE_TO_VIDEO:
            return <TextToVideoNode {...props} />;
        case NodeType.START_END_TO_VIDEO:
            return <StartEndToVideoNode {...props} />;
        case NodeType.ORIGINAL_IMAGE:
        case NodeType.ORIGINAL_VIDEO:
            return <OriginalImageNode {...props} />;
        case NodeType.PANORAMA_360:
            return <PanoramaNode {...props} />;
        case NodeType.CREATIVE_DESC:
            return <CreativeDescNode {...props} />;
        default:
            return null;
    }
};

export const NodeContent = memo(NodeContentComponent, (prev, next) => {
    if (prev.isSelecting !== next.isSelecting) return false;
    if (prev.isDark !== next.isDark) return false;
    if (prev.canvasScale !== next.canvasScale) return false;
    
    // Check Inputs
    if (prev.inputs !== next.inputs) {
         if (prev.inputs?.length !== next.inputs?.length) return false;
         if (prev.inputs && next.inputs) { 
             for (let i = 0; i < prev.inputs.length; i++) { 
                 if (prev.inputs[i] !== next.inputs[i]) return false; 
             } 
         }
    }
    
    // Check Selection/Visibility State
    if (prev.selected !== next.selected || prev.showControls !== next.showControls) return false;

    // Check Data *Excluding* X/Y to prevent re-renders on drag
    if (prev.data === next.data) return true;
    
    const keys = Object.keys(prev.data) as (keyof NodeData)[];
    // Check if keys length changed (rare but possible)
    if (keys.length !== Object.keys(next.data).length) return false;

    for (const key of keys) {
        if (key === 'x' || key === 'y') continue;
        if (prev.data[key] !== next.data[key]) return false;
    }
    
    return true;
});
