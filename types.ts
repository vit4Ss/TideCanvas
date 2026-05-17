

export enum NodeType {

  TEXT_TO_IMAGE = 'TEXT_TO_IMAGE',

  TEXT_TO_VIDEO = 'TEXT_TO_VIDEO',

  IMAGE_TO_IMAGE = 'IMAGE_TO_IMAGE',

  IMAGE_TO_VIDEO = 'IMAGE_TO_VIDEO',

  START_END_TO_VIDEO = 'START_END_TO_VIDEO',

  CREATIVE_DESC = 'CREATIVE_DESC',

  STORYBOARD = 'STORYBOARD',

  ORIGINAL_IMAGE = 'ORIGINAL_IMAGE',

  ORIGINAL_VIDEO = 'ORIGINAL_VIDEO',

  PANORAMA_360 = 'PANORAMA_360',

}



export interface NodeData {

  id: string;

  type: NodeType;

  x: number;

  y: number;

  width: number;

  height: number;

  title: string;

  

  // State

  prompt?: string;

  imageSrc?: string; // Result or Input (Active Selection)

  inputImageSrc?: string; // 显式输入图（拆分网格→HD 生成场景：cropped piece，与上游连线无关）

  videoSrc?: string; // Result (Active Selection)

  outputArtifacts?: string[]; // History/Batch results

  isLoading?: boolean;

  isStackOpen?: boolean; // UI State for expanded gallery

  

  // Configs

  aspectRatio?: string;

  resolution?: string;

  duration?: string; // Video duration (5s, 10s, 15s)

  count?: number;

  model?: string;

  promptOptimize?: boolean; // Prompt Extension/Optimization switch

  swapFrames?: boolean; // For START_END_TO_VIDEO: swap first/last frame order

  

  // Creative Desc specific

  optimizedPrompt?: string;



  // UI State

  activeToolbarItem?: string;

}



export interface Connection {

  id: string;

  sourceId: string;

  targetId: string;

}



export interface CanvasTransform {

  x: number;

  y: number;

  k: number; // Scale

}



export type DragMode = 'NONE' | 'PAN' | 'DRAG_NODE' | 'SELECT' | 'CONNECT' | 'RESIZE_NODE';



export interface Point {

  x: number;

  y: number;

}

