

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';

import Sidebar from './components/Sidebar';

import { NodeData, Connection, CanvasTransform, Point, DragMode, NodeType } from './types';

import BaseNode from './components/Nodes/BaseNode';

import { NodeContent } from './components/Nodes/NodeContent';

import { Icons } from './components/Icons';

import { generateCreativeDescription, generateImage, generateVideo, generateStoryboard } from './services/geminiService';
import { parseStoryboardShots, cropImageToGrid, loadImageRobust } from './services/imageCrop';
import { SplitGridModal, SplitGridConfirmPayload, SplitShot } from './components/SplitGridModal';

import { storageService } from './services/storageService';

import { ThemeSwitcher } from './components/ThemeSwitcher';

import { SettingsModal } from './components/Settings/SettingsModal';

import { ExportImportModal } from './components/Settings/ExportImportModal';

import { CanvasManagerModal } from './components/CanvasManager/CanvasManagerModal';

import MiniMap from './components/MiniMap';

import { syncAllModelServiceBindingsToRegistry, getCanvasModelOptions } from './services/modelService';



const DEFAULT_NODE_WIDTH = 320;

const DEFAULT_NODE_HEIGHT = 240; 

const EMPTY_ARRAY: string[] = [];

const HISTORY_LIMIT = 50;

const ZOOM_BASE_SCALE = 1;

const ZOOM_MIN = 0.3;

const ZOOM_MAX = 2;

const ZOOM_STEP = 0.1;



interface HistorySnapshot {

  nodes: NodeData[];

  connections: Connection[];

  selectedNodeIds: string[];

  selectedConnectionId: string | null;

}



// Helper for resizing imported media constraints

const calculateImportDimensions = (naturalWidth: number, naturalHeight: number) => {

    const ratio = naturalWidth / naturalHeight;

    const maxSide = 750;

    let width = naturalWidth;

    let height = naturalHeight;



    if (width > height) {

        if (width > maxSide) {

            width = maxSide;

            height = width / ratio;

        }

    } else {

        if (height > maxSide) {

            height = maxSide;

            width = height * ratio;

        }

    }

    return { width, height, ratio };

};

type ImportAssetKind = 'image' | 'video';

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif', 'svg']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', 'avi', 'mkv', 'ogv']);

const getAssetKind = (file: Pick<File, 'type' | 'name'> | Blob, fallbackName = ''): ImportAssetKind | null => {
  const mime = (file.type || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';

  const rawName = 'name' in file && file.name ? file.name : fallbackName;
  const ext = rawName.split('.').pop()?.toLowerCase() || '';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  return null;
};



const App: React.FC = () => {

  return (

      <CanvasWithSidebar />

  );

};



const CanvasWithSidebar: React.FC = () => {

  const [nodes, setNodes] = useState<NodeData[]>([]);

  const [connections, setConnections] = useState<Connection[]>([]);

  const [transform, setTransform] = useState<CanvasTransform>({ x: 0, y: 0, k: ZOOM_BASE_SCALE });

  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());

  const [dragMode, setDragMode] = useState<DragMode | 'RESIZE_NODE' | 'SELECT'>('NONE');

  const dragModeRef = useRef(dragMode);

  

  // New Workflow Dialog State

  const [showNewWorkflowDialog, setShowNewWorkflowDialog] = useState(false);

  const [showClearCanvasDialog, setShowClearCanvasDialog] = useState(false);

  

  // Project Name State

  const [projectName, setProjectName] = useState('未命名项目');

  const [isEditingProjectName, setIsEditingProjectName] = useState(false);

  

  // Settings Modal State

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [isExportImportOpen, setIsExportImportOpen] = useState(false);



  // Canvas Manager State

  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null);

  const [isCanvasManagerOpen, setIsCanvasManagerOpen] = useState(true);

  const [canvasManagerRefreshToken, setCanvasManagerRefreshToken] = useState(0);



  // History State (Persist deleted nodes that have content)

  const [deletedNodes, setDeletedNodes] = useState<NodeData[]>([]);

  const [isMergingVideos, setIsMergingVideos] = useState(false);



  useEffect(() => {

      dragModeRef.current = dragMode;

  }, [dragMode]);



  useEffect(() => {

      syncAllModelServiceBindingsToRegistry();

  }, []);



  useEffect(() => {

      const preventBrowserZoom = (event: WheelEvent) => {

          if (event.ctrlKey || event.metaKey) event.preventDefault();

      };



      window.addEventListener('wheel', preventBrowserZoom, { passive: false, capture: true });

      return () => window.removeEventListener('wheel', preventBrowserZoom, true);

  }, []);



  // 清除 Sora 2 的旧配置（修复 endpoint 问题）

  useEffect(() => {

      if (typeof window !== 'undefined') {

          try {

              const sora2Key = `API_CONFIG_MODEL_Sora 2`;

              const stored = localStorage.getItem(sora2Key);

              if (stored) {

                  const parsed = JSON.parse(stored);

                  // 如果 endpoint 是旧的 chat completions，清除配置

                  if (parsed.endpoint === '/v1/chat/completions') {

                      localStorage.removeItem(sora2Key);

                      console.log('[App] Cleared old Sora 2 config with old endpoint');

                  }

              }

          } catch(e) {

              // 忽略错误

          }

      }

  }, []);



  // Default to light theme (white)

  const [canvasBg, setCanvasBg] = useState('#F5F7FA');

  const isDark = canvasBg === '#0B0C0E';

  

  // Sync body class for CSS variables

  useEffect(() => {

    if (isDark) {

      document.body.classList.add('dark');

    } else {

      document.body.classList.remove('dark');

    }

  }, [isDark]);



  const [selectionBox, setSelectionBox] = useState<{ x: number, y: number, w: number, h: number } | null>(null);

  // 选中节点的可视边界（container-internal screen coords）。
  // 优先用用户拖框出的 selectionBox；否则根据 Ctrl+点击多选的节点 world 坐标算一个虚拟框，
  // 让右上角浮条在「点击多选」场景也能渲染出来
  const displaySelectionBox = useMemo(() => {
    if (selectionBox) return selectionBox;
    if (selectedNodeIds.size === 0) return null;
    const sel = nodes.filter(n => selectedNodeIds.has(n.id));
    if (sel.length === 0) return null;
    const minX = Math.min(...sel.map(n => n.x));
    const minY = Math.min(...sel.map(n => n.y));
    const maxX = Math.max(...sel.map(n => n.x + n.width));
    const maxY = Math.max(...sel.map(n => n.y + n.height));
    return {
      x: minX * transform.k + transform.x,
      y: minY * transform.k + transform.y,
      w: (maxX - minX) * transform.k,
      h: (maxY - minY) * transform.k,
    };
  }, [selectionBox, selectedNodeIds, nodes, transform]);

  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);

  const [suggestedNodes, setSuggestedNodes] = useState<NodeData[]>([]);

  const [previewMedia, setPreviewMedia] = useState<{ url: string, type: 'image' | 'video' } | null>(null);



  // Bottom-left canvas controls

  const [gridSnap, setGridSnap] = useState(false);

  const [showMinimap, setShowMinimap] = useState(false);

  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  const GRID_SIZE = 20;

  

  // Quick Add Menu State

  const [quickAddMenu, setQuickAddMenu] = useState<{ sourceId: string, x: number, y: number, worldX: number, worldY: number } | null>(null);



  const [contextMenu, setContextMenu] = useState<{ 

      type: 'CANVAS' | 'NODE', 

      nodeId?: string, 

      nodeType?: NodeType, 

      x: number, 

      y: number, 

      worldX: number, 

      worldY: number 

  } | null>(null);



  const [internalClipboard, setInternalClipboard] = useState<{ nodes: NodeData[], connections: Connection[] } | null>(null);

  const [historyVersion, setHistoryVersion] = useState(0);



  const containerRef = useRef<HTMLDivElement>(null);

  const dragStartRef = useRef<{ x: number, y: number, w?: number, h?: number, nodeId?: string }>({ x: 0, y: 0 });
  const lastCanvasMouseDownAtRef = useRef<number>(0); // 双击检测：上一次画布 mousedown 时间戳

  const initialTransformRef = useRef<CanvasTransform>({ x: 0, y: 0, k: ZOOM_BASE_SCALE });

  const initialNodePositionsRef = useRef<{id: string, x: number, y: number}[]>([]);

  const connectionStartRef = useRef<{ nodeId: string, type: 'source' | 'target' } | null>(null);

  const undoStackRef = useRef<HistorySnapshot[]>([]);

  const redoStackRef = useRef<HistorySnapshot[]>([]);

  const interactionHistoryRecordedRef = useRef(false);

  const [tempConnection, setTempConnection] = useState<Point | null>(null);

  const lastMousePosRef = useRef<Point>({ x: 0, y: 0 }); 

  

  const workflowInputRef = useRef<HTMLInputElement>(null);

  const assetInputRef = useRef<HTMLInputElement>(null);

  const replaceImageRef = useRef<HTMLInputElement>(null);

  const nodeToReplaceRef = useRef<string | null>(null);



  const spacePressed = useRef(false);



  const screenToWorld = (x: number, y: number) => ({

    x: (x - transform.x) / transform.k,

    y: (y - transform.y) / transform.k,

  });



  const generateId = () => Math.random().toString(36).substr(2, 9);



  const createHistorySnapshot = useCallback((): HistorySnapshot => ({

    nodes: nodes.map(n => ({

      ...n,

      outputArtifacts: n.outputArtifacts ? [...n.outputArtifacts] : undefined,

    })),

    connections: connections.map(c => ({ ...c })),

    selectedNodeIds: Array.from(selectedNodeIds),

    selectedConnectionId,

  }), [nodes, connections, selectedNodeIds, selectedConnectionId]);



  const applyHistorySnapshot = useCallback((snapshot: HistorySnapshot) => {

    setNodes(snapshot.nodes.map(n => ({

      ...n,

      outputArtifacts: n.outputArtifacts ? [...n.outputArtifacts] : undefined,

      // 撤销/重做不应恢复"生成中"状态：原生成已脱离当前轨迹，恢复 isLoading=true 会让节点永久卡在 loading
      isLoading: false,

    })));

    setConnections(snapshot.connections.map(c => ({ ...c })));

    setSelectedNodeIds(new Set(snapshot.selectedNodeIds));

    setSelectedConnectionId(snapshot.selectedConnectionId);

    setContextMenu(null);

    setQuickAddMenu(null);

  }, []);



  const pushHistory = useCallback(() => {

    undoStackRef.current.push(createHistorySnapshot());

    if (undoStackRef.current.length > HISTORY_LIMIT) undoStackRef.current.shift();

    redoStackRef.current = [];

    setHistoryVersion(v => v + 1);

  }, [createHistorySnapshot]);



  const handleUndo = useCallback(() => {

    const previous = undoStackRef.current.pop();

    if (!previous) return;

    redoStackRef.current.push(createHistorySnapshot());

    if (redoStackRef.current.length > HISTORY_LIMIT) redoStackRef.current.shift();

    applyHistorySnapshot(previous);

    setHistoryVersion(v => v + 1);

  }, [applyHistorySnapshot, createHistorySnapshot]);



  const handleRedo = useCallback(() => {

    const next = redoStackRef.current.pop();

    if (!next) return;

    undoStackRef.current.push(createHistorySnapshot());

    if (undoStackRef.current.length > HISTORY_LIMIT) undoStackRef.current.shift();

    applyHistorySnapshot(next);

    setHistoryVersion(v => v + 1);

  }, [applyHistorySnapshot, createHistorySnapshot]);



  const canUndo = historyVersion >= 0 && undoStackRef.current.length > 0;

  const canRedo = historyVersion >= 0 && redoStackRef.current.length > 0;



  // Memoize inputs map to prevent array recreation on every render

  const inputsMap = useMemo(() => {

    const map: Record<string, string[]> = {};

    nodes.forEach(node => {

        map[node.id] = connections

            .filter(c => c.targetId === node.id)

            .map(c => nodes.find(n => n.id === c.sourceId))

            .filter(n => {

                if (!n) return false;

                if (node.type === NodeType.IMAGE_TO_IMAGE || node.type === NodeType.IMAGE_TO_VIDEO || node.type === NodeType.START_END_TO_VIDEO) {

                    return !!n.imageSrc;

                }

                return !!(n.imageSrc || n.videoSrc);

            })

            .map(n => {

                if (node.type === NodeType.IMAGE_TO_IMAGE || node.type === NodeType.IMAGE_TO_VIDEO || node.type === NodeType.START_END_TO_VIDEO) {

                    return n!.imageSrc || '';

                }

                return n!.imageSrc || n!.videoSrc || '';

            })
            .filter(Boolean);

    });

    return map;

  }, [nodes, connections]);



  const getInputImages = useCallback((nodeId: string) => {

    return inputsMap[nodeId] || EMPTY_ARRAY;

  }, [inputsMap]);

  // Map each node to upstream text reference (used by image/video nodes as "use upstream text" chip).
  // Only collects from text-type sources (CREATIVE_DESC / STORYBOARD).
  const upstreamTextMap = useMemo(() => {
    const map: Record<string, string> = {};
    nodes.forEach(node => {
      const source = connections
        .filter(c => c.targetId === node.id)
        .map(c => nodes.find(n => n.id === c.sourceId))
        .find(n => !!n && (n.type === NodeType.CREATIVE_DESC || n.type === NodeType.STORYBOARD));
      if (source) {
        const text = (source.optimizedPrompt || source.prompt || '').trim();
        if (text) map[node.id] = text;
      }
    });
    return map;
  }, [nodes, connections]);

  // Unified upstream refs for STORYBOARD nodes —— 不区分类型，所有上游都作为素材引用
  interface StoryboardRef {
    kind: 'text' | 'image';
    title: string;
    content: string; // text: 文本内容；image: 提示词描述
    imageSrc?: string; // 仅 image 类型
  }
  const storyboardUpstreamMap = useMemo(() => {
    const map: Record<string, StoryboardRef[]> = {};
    nodes.forEach(node => {
      if (node.type !== NodeType.STORYBOARD) return;
      const sources = connections
        .filter(c => c.targetId === node.id)
        .map(c => nodes.find(n => n.id === c.sourceId))
        .filter((n): n is NodeData => !!n);

      const refs: StoryboardRef[] = sources.map(n => {
        const isText = n.type === NodeType.CREATIVE_DESC || n.type === NodeType.STORYBOARD;
        if (isText) {
          const text = (n.optimizedPrompt || n.prompt || '').trim();
          return text ? { kind: 'text' as const, title: n.title || '文本', content: text } : null;
        }
        // 任意带图或带 prompt 的节点
        const prompt = (n.prompt || '').trim();
        if (n.imageSrc || prompt) {
          return { kind: 'image' as const, title: n.title || '素材', content: prompt, imageSrc: n.imageSrc };
        }
        return null;
      }).filter((r): r is StoryboardRef => !!r);

      map[node.id] = refs;
    });
    return map;
  }, [nodes, connections]);

  

  const performCopy = () => {

      if (selectedNodeIds.size === 0) return;

      

      const selectedNodes = nodes.filter(n => selectedNodeIds.has(n.id));

      const selectedConnections = connections.filter(c => 

          selectedNodeIds.has(c.sourceId) && selectedNodeIds.has(c.targetId)

      );

      

      setInternalClipboard({ nodes: selectedNodes, connections: selectedConnections });

  };



  const performPaste = (targetPos: Point) => {

      if (!internalClipboard || internalClipboard.nodes.length === 0) return;

      pushHistory();



      const { nodes: clipboardNodes, connections: clipboardConnections } = internalClipboard;

      

      let minX = Infinity, minY = Infinity;

      clipboardNodes.forEach(n => {

          if (n.x < minX) minX = n.x;

          if (n.y < minY) minY = n.y;

      });



      const idMap = new Map<string, string>();

      const newNodes: NodeData[] = [];



      clipboardNodes.forEach(node => {

          const newId = generateId();

          idMap.set(node.id, newId);

          const offsetX = node.x - minX;

          const offsetY = node.y - minY;

          newNodes.push({

              ...node,

              id: newId,

              x: targetPos.x + offsetX,

              y: targetPos.y + offsetY,

              title: node.title.endsWith('(Copy)') ? node.title : `${node.title} (Copy)`,

              isLoading: false,

          });

      });



      const newConnections: Connection[] = clipboardConnections.map(c => ({

          id: generateId(),

          sourceId: idMap.get(c.sourceId)!,

          targetId: idMap.get(c.targetId)!

      }));



      setNodes(prev => [...prev, ...newNodes]);

      setConnections(prev => [...prev, ...newConnections]);

      setSelectedNodeIds(new Set(newNodes.map(n => n.id)));

  };



  const handleAlign = useCallback((direction: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') => {

      if (selectedNodeIds.size < 2) return;

      pushHistory();



      setNodes(prevNodes => {

          const selected = prevNodes.filter(n => selectedNodeIds.has(n.id));

          const unselected = prevNodes.filter(n => !selectedNodeIds.has(n.id));

          const updatedNodes = selected.map(n => ({ ...n })); // Shallow clone to mutate



          const isVerticalAlign = direction === 'UP' || direction === 'DOWN';

          

          // Check overlap logic with Threshold to avoid accidental grouping

          const OVERLAP_THRESHOLD = 10;

          const isOverlap = (a: NodeData, b: NodeData) => {

              if (isVerticalAlign) {

                  const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);

                  return overlap > OVERLAP_THRESHOLD;

              } else {

                  const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);

                  return overlap > OVERLAP_THRESHOLD;

              }

          };



          const clusters: NodeData[][] = [];

          const visited = new Set<string>();



          for (const node of updatedNodes) {

              if (visited.has(node.id)) continue;

              const cluster = [node];

              visited.add(node.id);

              const queue = [node];



              while (queue.length > 0) {

                  const current = queue.shift()!;

                  for (const other of updatedNodes) {

                      if (!visited.has(other.id) && isOverlap(current, other)) {

                          visited.add(other.id);

                          cluster.push(other);

                          queue.push(other);

                      }

                  }

              }

              clusters.push(cluster);

          }



          const minTop = Math.min(...updatedNodes.map(n => n.y));

          const maxBottom = Math.max(...updatedNodes.map(n => n.y + n.height));

          const minLeft = Math.min(...updatedNodes.map(n => n.x));

          const maxRight = Math.max(...updatedNodes.map(n => n.x + n.width));



          const HORIZONTAL_GAP = 20; 

          const VERTICAL_GAP = 60;   



          clusters.forEach(cluster => {

              if (direction === 'UP') {

                  cluster.sort((a, b) => (a.y - b.y) || a.id.localeCompare(b.id));

                  let currentY = minTop;

                  cluster.forEach((node) => {

                      node.y = currentY;

                      currentY += node.height + VERTICAL_GAP;

                  });

              } else if (direction === 'DOWN') {

                  cluster.sort((a, b) => (b.y - a.y) || a.id.localeCompare(b.id)); 

                  let currentBottom = maxBottom;

                  cluster.forEach((node) => {

                      node.y = currentBottom - node.height;

                      currentBottom -= (node.height + VERTICAL_GAP);

                  });

              } else if (direction === 'LEFT') {

                  cluster.sort((a, b) => (a.x - b.x) || a.id.localeCompare(b.id));

                  let currentX = minLeft;

                  cluster.forEach((node) => {

                      node.x = currentX;

                      currentX += node.width + HORIZONTAL_GAP;

                  });

              } else if (direction === 'RIGHT') {

                  cluster.sort((a, b) => (b.x - a.x) || a.id.localeCompare(b.id)); 

                  let currentRight = maxRight;

                  cluster.forEach((node) => {

                      node.x = currentRight - node.width;

                      currentRight -= (node.width + HORIZONTAL_GAP);

                  });

              }

          });



          return [...unselected, ...updatedNodes];

      });

  }, [selectedNodeIds, pushHistory]);



  const addNode = (type: NodeType, x?: number, y?: number, dataOverride?: Partial<NodeData>) => {

    if (x === undefined || y === undefined) {

      if (containerRef.current) {

        const rect = containerRef.current.getBoundingClientRect();

        const center = screenToWorld(rect.width / 2, rect.height / 2);

        x = center.x - DEFAULT_NODE_WIDTH / 2;

        y = center.y - DEFAULT_NODE_HEIGHT / 2;

      } else {

        x = 0; y = 0;

      }

    }



    let w = dataOverride?.width || DEFAULT_NODE_WIDTH;

    let h = dataOverride?.height || DEFAULT_NODE_HEIGHT;



    if (type === NodeType.ORIGINAL_IMAGE || type === NodeType.ORIGINAL_VIDEO) {

        h = dataOverride?.height || 240;

    } else if (type === NodeType.PANORAMA_360) {

        if (!dataOverride?.width) w = 640;

        if (!dataOverride?.height) h = 360;

    } else if (type === NodeType.TEXT_TO_VIDEO || type === NodeType.IMAGE_TO_VIDEO || type === NodeType.START_END_TO_VIDEO) {

        if (!dataOverride?.width) w = 400 * (16/9); 

        if (!dataOverride?.height) h = 400;

    } else if (type === NodeType.TEXT_TO_IMAGE || type === NodeType.IMAGE_TO_IMAGE) {

        if (!dataOverride?.width) w = 400;

        if (!dataOverride?.height) h = 400;

    } else if (type === NodeType.CREATIVE_DESC) {

        if (!dataOverride?.width) w = 600;

        if (!dataOverride?.height) h = 570;

    } else if (type === NodeType.STORYBOARD) {

        if (!dataOverride?.width) w = 640;

        if (!dataOverride?.height) h = 620;

    }

    

    const getDefaultTitle = (t: NodeType) => {

        const nextIndex = (label: string) => {

            const used = nodes

                .map(n => n.title)

                .filter(title => title && title.startsWith(label))

                .map(title => parseInt(title.slice(label.length).trim(), 10))

                .filter(n => Number.isFinite(n));

            return (used.length ? Math.max(...used) : 0) + 1;

        };

        switch (t) {

            case NodeType.TEXT_TO_IMAGE: return `图片节点 ${nextIndex('图片节点')}`;

            case NodeType.IMAGE_TO_IMAGE: return `图生图 ${nextIndex('图生图')}`;

            case NodeType.TEXT_TO_VIDEO: return `视频节点 ${nextIndex('视频节点')}`;

            case NodeType.IMAGE_TO_VIDEO: return `图生视频 ${nextIndex('图生视频')}`;

            case NodeType.START_END_TO_VIDEO: return `首尾帧视频 ${nextIndex('首尾帧视频')}`;

            case NodeType.CREATIVE_DESC: return `文本节点 ${nextIndex('文本节点')}`;

            case NodeType.STORYBOARD: return `脚本节点 ${nextIndex('脚本节点')}`;

            case NodeType.PANORAMA_360: return `全景 ${nextIndex('全景')}`;

            case NodeType.ORIGINAL_VIDEO: return `原始视频_${Date.now()}`;

            default: return `原始图片_${Date.now()}`;

        }

    };



    const getDefaultModel = (t: NodeType) => {

        switch (t) {

            case NodeType.TEXT_TO_IMAGE:

            case NodeType.IMAGE_TO_IMAGE:

                return getCanvasModelOptions('IMAGE')[0]?.value || '';

            case NodeType.TEXT_TO_VIDEO:

            case NodeType.IMAGE_TO_VIDEO:

            case NodeType.START_END_TO_VIDEO:

                return getCanvasModelOptions('VIDEO')[0]?.value || '';

            default:

                return '';

        }

    };



    const isVideoType = type === NodeType.TEXT_TO_VIDEO || type === NodeType.ORIGINAL_VIDEO;

    const isPanoramaType = type === NodeType.PANORAMA_360;

    

    const newNode: NodeData = {

      id: generateId(),

      type,

      x,

      y,

      width: w,

      height: h, 

      title: dataOverride?.title || getDefaultTitle(type),

      aspectRatio: dataOverride?.aspectRatio || (isVideoType || isPanoramaType ? '16:9' : '1:1'),

      model: dataOverride?.model || getDefaultModel(type),

      resolution: dataOverride?.resolution || (isVideoType ? '720p' : '1k'),

      duration: dataOverride?.duration || (isVideoType ? '5s' : undefined),

      count: 1,

      prompt: dataOverride?.prompt || '',

      imageSrc: dataOverride?.imageSrc,

      videoSrc: dataOverride?.videoSrc,

      outputArtifacts: dataOverride?.outputArtifacts || (dataOverride?.imageSrc || dataOverride?.videoSrc ? [dataOverride.imageSrc || dataOverride.videoSrc!] : [])

    };

    pushHistory();

    setNodes(prev => [...prev, newNode]);

    setSelectedNodeIds(new Set([newNode.id]));

  };



  const handleQuickAddNode = (type: NodeType) => {

      if (!quickAddMenu) return;

      const sourceNode = nodes.find(n => n.id === quickAddMenu.sourceId);
      const sourceHasImage = !!sourceNode?.imageSrc;
      const resolvedType =
          sourceHasImage && type === NodeType.TEXT_TO_IMAGE
              ? NodeType.IMAGE_TO_IMAGE
              : sourceHasImage && type === NodeType.TEXT_TO_VIDEO
                  ? NodeType.IMAGE_TO_VIDEO
                  : type;



      const newId = generateId();

      let w = DEFAULT_NODE_WIDTH;

      let h = DEFAULT_NODE_HEIGHT;



      const isVideoType = resolvedType === NodeType.TEXT_TO_VIDEO || resolvedType === NodeType.IMAGE_TO_VIDEO;

      const isImageGenType = resolvedType === NodeType.TEXT_TO_IMAGE || resolvedType === NodeType.IMAGE_TO_IMAGE;



      if (resolvedType === NodeType.ORIGINAL_IMAGE || resolvedType === NodeType.ORIGINAL_VIDEO) {

          h = 240;

      } else if (resolvedType === NodeType.PANORAMA_360) {

          w = 640; h = 360;

      } else if (isVideoType) {

          w = 400 * (16/9); h = 400;

      } else if (isImageGenType) {

          w = 400; h = 400;

      } else if (resolvedType === NodeType.CREATIVE_DESC) {

          w = 600; h = 570;

      } else if (resolvedType === NodeType.STORYBOARD) {

          w = 640; h = 620;

      }



      const getDefaultTitle = (t: NodeType) => {

          const nextIndex = (label: string) => {

              const used = nodes

                  .map(n => n.title)

                  .filter(title => title && title.startsWith(label))

                  .map(title => parseInt(title.slice(label.length).trim(), 10))

                  .filter(n => Number.isFinite(n));

              return (used.length ? Math.max(...used) : 0) + 1;

          };

          switch (t) {

              case NodeType.TEXT_TO_IMAGE: return `图片节点 ${nextIndex('图片节点')}`;

              case NodeType.IMAGE_TO_IMAGE: return `图生图 ${nextIndex('图生图')}`;

              case NodeType.TEXT_TO_VIDEO: return `视频节点 ${nextIndex('视频节点')}`;

              case NodeType.IMAGE_TO_VIDEO: return `图生视频 ${nextIndex('图生视频')}`;

              case NodeType.START_END_TO_VIDEO: return `首尾帧视频 ${nextIndex('首尾帧视频')}`;

              case NodeType.CREATIVE_DESC: return `文本节点 ${nextIndex('文本节点')}`;

            case NodeType.STORYBOARD: return `脚本节点 ${nextIndex('脚本节点')}`;

              case NodeType.PANORAMA_360: return `全景 ${nextIndex('全景')}`;

              case NodeType.ORIGINAL_VIDEO: return `原始视频_${Date.now()}`;

              default: return `原始图片_${Date.now()}`;

          }

      };



      const getDefaultModel = (t: NodeType) => {

          switch (t) {

              case NodeType.TEXT_TO_IMAGE:

              case NodeType.IMAGE_TO_IMAGE:

                  return getCanvasModelOptions('IMAGE')[0]?.value || '';

              case NodeType.TEXT_TO_VIDEO:

              case NodeType.IMAGE_TO_VIDEO:

              case NodeType.START_END_TO_VIDEO:

                  return getCanvasModelOptions('VIDEO')[0]?.value || '';

              default:

                  return '';

          }

      };



      const newNode: NodeData = {

          id: newId,

          type: resolvedType,

          x: quickAddMenu.worldX,

          y: quickAddMenu.worldY - h / 2,

          width: w,

          height: h,

          title: getDefaultTitle(resolvedType),

          aspectRatio: isVideoType || resolvedType === NodeType.PANORAMA_360 ? '16:9' : '1:1',

          model: getDefaultModel(resolvedType),

          resolution: isVideoType ? '720p' : '1k',

          duration: isVideoType ? '5s' : undefined,

          count: 1,

          prompt: '',

          outputArtifacts: []

      };



      pushHistory();

      setNodes(prev => [...prev, newNode]);

      setConnections(prev => [...prev, { id: generateId(), sourceId: quickAddMenu.sourceId, targetId: newId }]);

      setQuickAddMenu(null);

  };

  const addImportedAssetNode = useCallback((file: File | Blob, x: number, y: number, title?: string) => {

    const kind = getAssetKind(file, title);

    if (kind === 'image') {

        const reader = new FileReader();

        reader.onload = (event) => {

            const img = new Image();

            img.onload = () => {

                const { width, height, ratio } = calculateImportDimensions(img.width, img.height);

                const src = event.target?.result as string;

                addNode(NodeType.TEXT_TO_IMAGE, x - width / 2, y - height / 2, {

                    width,
                    height,
                    imageSrc: src,
                    title: title || undefined,
                    aspectRatio: `${ratio}:1`,
                    outputArtifacts: [src],

                });

            };

            img.src = event.target?.result as string;

        };

        reader.readAsDataURL(file);

        return true;

    }

    if (kind === 'video') {

        const url = URL.createObjectURL(file);

        const video = document.createElement('video');

        video.preload = 'metadata';

        video.onloadedmetadata = () => {

            const { width, height, ratio } = calculateImportDimensions(video.videoWidth, video.videoHeight);

            addNode(NodeType.ORIGINAL_VIDEO, x - width / 2, y - height / 2, {

                width, height, videoSrc: url, title, aspectRatio: `${ratio}:1`, outputArtifacts: [url]

            });

        };

        video.onerror = () => URL.revokeObjectURL(url);

        video.src = url;

        return true;

    }

    return false;

  }, [addNode]);



  const handlePaste = useCallback(async (e: ClipboardEvent) => {

    const activeElement = document.activeElement;

    const isInputFocused = activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement;

    if (isInputFocused) return;



    const items = e.clipboardData?.items;

    let hasSystemMedia = false;

    const mousePos = lastMousePosRef.current;

    const worldPos = screenToWorld(mousePos.x, mousePos.y);



    if (items) {

        for (let i = 0; i < items.length; i++) {

            const item = items[i] as DataTransferItem;

            const file = item.getAsFile();

            if (file && addImportedAssetNode(file, worldPos.x, worldPos.y, file.name)) {

                hasSystemMedia = true;

            }

        }

    }

    if (!hasSystemMedia && internalClipboard) performPaste(worldPos);

  }, [addImportedAssetNode, transform, internalClipboard]); 



  const handleContextPaste = async (targetPos: Point) => {

    if (internalClipboard) {

        performPaste(targetPos);

        return;

    }



    if (typeof navigator === 'undefined' || !navigator.clipboard) {

        alert('当前环境不支持读取剪贴板');

        return;

    }



    try {

        if ('read' in navigator.clipboard) {

            const items = await navigator.clipboard.read();

            for (const item of items) {

                const mediaType = item.types.find(type => type.startsWith('image/') || type.startsWith('video/'));

                if (!mediaType) continue;

                const blob = await item.getType(mediaType);

                if (addImportedAssetNode(blob, targetPos.x, targetPos.y, mediaType.startsWith('video/') ? '剪贴板视频' : '剪贴板图片')) {

                    return;

                }

            }

        }



        if ('readText' in navigator.clipboard) {

            const text = (await navigator.clipboard.readText()).trim();

            if (text) {

                addNode(NodeType.TEXT_TO_IMAGE, targetPos.x, targetPos.y, { prompt: text });

                return;

            }

        }



        alert('剪贴板中没有可粘贴的内容');

    } catch (err) {

        console.error(err);

        alert('无法读取剪贴板，请使用 Ctrl/⌘ + V 粘贴');

    }

  };



  useEffect(() => {

    document.addEventListener('paste', handlePaste);

    return () => document.removeEventListener('paste', handlePaste);

  }, [handlePaste]);



  useEffect(() => {

    const handleKeyDown = (e: KeyboardEvent) => {

        const target = e.target as HTMLElement;

        const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

        // DEBUG: 删除键打日志，方便定位为什么没删
        if (e.key === 'Delete' || e.key === 'Backspace') {
            console.log('[Delete Key]', {
                key: e.key,
                targetTag: target?.tagName,
                isContentEditable: target?.isContentEditable,
                isInput,
                selectedNodes: selectedNodeIds.size,
                selectedConn: selectedConnectionId,
                activeEl: document.activeElement?.tagName,
            });
        }

        if (!isInput) {

            if (e.key === 'Delete' || e.key === 'Backspace') {

                 e.preventDefault();
                 e.stopPropagation();

                 const hasDeletableSelection = selectedNodeIds.size > 0 || !!selectedConnectionId;

                 if (hasDeletableSelection) pushHistory();

                 if (selectedNodeIds.size > 0) {

                     const nodesToDelete = nodes.filter(n => selectedNodeIds.has(n.id));

                     const withContent = nodesToDelete.filter(n => n.imageSrc || n.videoSrc);

                     if (withContent.length > 0) {

                         setDeletedNodes(prev => [...prev, ...withContent]);

                     }

                     setNodes(prev => prev.filter(n => !selectedNodeIds.has(n.id)));

                     setConnections(prev => prev.filter(c => !selectedNodeIds.has(c.sourceId) && !selectedNodeIds.has(c.targetId)));

                     setSelectedNodeIds(new Set());

                     setSelectionBox(null); // 清掉选区框

                     console.log('[Delete] Removed', nodesToDelete.length, 'nodes');

                 }

                 if (selectedConnectionId) {

                     setConnections(prev => prev.filter(c => c.id !== selectedConnectionId));

                     setSelectedConnectionId(null);

                 }

            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {

                e.preventDefault();

                if (e.shiftKey) handleRedo();

                else handleUndo();

            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {

                e.preventDefault();

                handleRedo();

            }

            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {

                e.preventDefault();

                performCopy();

            }

            if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {

                if (e.key === 'ArrowUp') { e.preventDefault(); handleAlign('UP'); }

                if (e.key === 'ArrowDown') { e.preventDefault(); handleAlign('DOWN'); }

                if (e.key === 'ArrowLeft') { e.preventDefault(); handleAlign('LEFT'); }

                if (e.key === 'ArrowRight') { e.preventDefault(); handleAlign('RIGHT'); }

            }

        }

        

        if (e.key === 'Escape') {

            if (previewMedia) setPreviewMedia(null);

            if (contextMenu) setContextMenu(null);

            if (quickAddMenu) setQuickAddMenu(null);

            if (showNewWorkflowDialog) setShowNewWorkflowDialog(false);

            if (showClearCanvasDialog) setShowClearCanvasDialog(false);

            if (isSettingsOpen) setIsSettingsOpen(false);

            if (isExportImportOpen) setIsExportImportOpen(false);

            // 取消持久化选区
            if (selectionBox) { setSelectionBox(null); setSelectedNodeIds(new Set()); }

        }

        if (e.code === 'Space') spacePressed.current = true;

    };

    const handleKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') spacePressed.current = false; };

    window.addEventListener('keydown', handleKeyDown);

    window.addEventListener('keyup', handleKeyUp);

    return () => {

        window.removeEventListener('keydown', handleKeyDown);

        window.removeEventListener('keyup', handleKeyUp);

    };

  }, [selectedNodeIds, selectedConnectionId, previewMedia, contextMenu, nodes, connections, quickAddMenu, showNewWorkflowDialog, showClearCanvasDialog, isSettingsOpen, isExportImportOpen, selectionBox, handleAlign, pushHistory, handleUndo, handleRedo]);



  useEffect(() => {

    const handleGlobalMouseUp = () => {

        if (dragModeRef.current !== 'NONE') {

            setDragMode('NONE');

            setTempConnection(null);

            connectionStartRef.current = null;

            dragStartRef.current = { x: 0, y: 0 };

            setSuggestedNodes([]);

            setSelectionBox(null);

        }

    };

    window.addEventListener('mouseup', handleGlobalMouseUp);

    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);

  }, []);



  const handleImportWorkflow = (data: { nodes: NodeData[], connections: Connection[], transform?: CanvasTransform, projectName?: string }) => {

      // 保存当前有内容的节点到历史

      const withContent = nodes.filter(n => n.imageSrc || n.videoSrc);

      if (withContent.length > 0) setDeletedNodes(prev => [...prev, ...withContent]);



      // 清掉外部数据里残留的 isLoading（保存期间生成还没完成会留下这个 flag，导致重新加载后卡在"生成中"）
      setNodes((data.nodes || []).map(n => n.isLoading ? { ...n, isLoading: false } : n));

      setConnections(data.connections);

      if (data.transform) setTransform(data.transform);

      if (data.projectName) setProjectName(data.projectName);

      setSelectedNodeIds(new Set());

  };



  const updateNodeData = useCallback((id: string, updates: Partial<NodeData>) => {

    setNodes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));

  }, []);



  const handleGenerate = async (nodeId: string) => {

    // 用 workspaceStateRef 读最新节点，避免被旧闭包困住（在 setNodes 之后立即触发生成时尤其重要）
    const node = workspaceStateRef.current.nodes.find(n => n.id === nodeId) || nodes.find(n => n.id === nodeId);

    if (!node) return;

    updateNodeData(nodeId, { isLoading: true });

    

    // 用 workspaceStateRef 直接计算 inputs，避免 inputsMap 闭包过期
    const wsNodes = workspaceStateRef.current.nodes;
    const wsConnections = workspaceStateRef.current.connections;
    const needsImage = node.type === NodeType.IMAGE_TO_IMAGE || node.type === NodeType.IMAGE_TO_VIDEO || node.type === NodeType.START_END_TO_VIDEO;

    let inputs: string[];
    // 关键：inputImageSrc 优先级高于连接 input（拆分网格→HD 场景：每个 HD 节点都连着源 32 宫格，
    //   如果用连接就会拿到同一张大图，所以必须用 inputImageSrc 里的"切下来的格子"）
    if (node.inputImageSrc && needsImage) {
        inputs = [node.inputImageSrc];
        console.log('[Generate] using node.inputImageSrc (overrides connection inputs)');
    } else {
        inputs = wsConnections
            .filter(c => c.targetId === node.id)
            .map(c => wsNodes.find(n => n.id === c.sourceId))
            .filter((n): n is NodeData => !!n && (needsImage ? !!n.imageSrc : !!(n.imageSrc || n.videoSrc)))
            .map(n => needsImage ? (n.imageSrc || '') : (n.imageSrc || n.videoSrc || ''))
            .filter(Boolean);
    }

    // Debug: Log input images for troubleshooting

    console.log(`[Generation] Node: ${node.title} (${node.type}), Input Images:`, inputs.length > 0 ? inputs.map(i => i.substring(0, 50) + '...') : 'None');



    try {

      if (node.type === NodeType.CREATIVE_DESC) {

        const res = await generateCreativeDescription(node.prompt || '', node.model === 'TEXT_TO_VIDEO' ? 'VIDEO' : 'IMAGE', node.model);

        updateNodeData(nodeId, { optimizedPrompt: res, isLoading: false });

      } else if (node.type === NodeType.STORYBOARD) {

        // 所有上游统一作为素材；用户在输入框写的是故事
        const sources = wsConnections
            .filter(c => c.targetId === node.id)
            .map(c => wsNodes.find(n => n.id === c.sourceId))
            .filter((n): n is NodeData => !!n);
        const story = (node.prompt || '').trim();
        const refs = sources.map(n => {
            const isText = n.type === NodeType.CREATIVE_DESC || n.type === NodeType.STORYBOARD;
            if (isText) {
                const text = (n.optimizedPrompt || n.prompt || '').trim();
                return text ? { title: n.title || '文本', text, kind: 'text' as const, imageSrc: undefined as string | undefined } : null;
            }
            const prompt = (n.prompt || '').trim();
            const imageSrc = n.imageSrc;
            if (!prompt && !imageSrc) return null;
            return { title: n.title || '素材', text: prompt, kind: 'image' as const, imageSrc };
        }).filter((r): r is { title: string; text: string; kind: 'text' | 'image'; imageSrc: string | undefined } => !!r);

        if (!story && refs.length === 0) {
            throw new Error('请提供故事内容（在输入框写故事，或连接节点作为素材）');
        }

        // 组合：素材引用文字描述 + 用户故事
        const composed = [
            refs.length > 0
                ? `【素材引用】\n${refs.map((r, i) => `[${i + 1}] (${r.kind === 'text' ? '文本' : '图片'}) ${r.title}：${r.text || '(见配套图片)'}`).join('\n')}`
                : '',
            story
                ? `【故事】\n${story}`
                : '【故事】\n（无明确故事，请根据上述素材引用自行设计一个轻松搞笑的小故事并生成分镜）',
        ].filter(Boolean).join('\n\n');

        // 图片源：所有 kind === 'image' 且带 imageSrc 的引用，按序传给模型（vision 接口）
        const images = refs
            .filter(r => r.kind === 'image' && !!r.imageSrc)
            .map(r => r.imageSrc!)
            .slice(0, 8); // 最多 8 张，避免 payload 过大

        const res = await generateStoryboard(composed, images, node.model);
        updateNodeData(nodeId, { optimizedPrompt: res, isLoading: false });

      } else {

          let results: string[] = [];

          // 检测上游是否有文本/脚本节点；有则把内容前置注入到 prompt（避免 "上述分镜脚本" 之类的引用模型读不到）
          const upstreamTextSources = wsConnections
              .filter(c => c.targetId === node.id)
              .map(c => wsNodes.find(n => n.id === c.sourceId))
              .filter((n): n is NodeData => !!n && (n.type === NodeType.CREATIVE_DESC || n.type === NodeType.STORYBOARD));
          const upstreamTextBlock = upstreamTextSources
              .map(n => {
                  const t = (n.optimizedPrompt || n.prompt || '').trim();
                  if (!t) return '';
                  const tag = n.type === NodeType.STORYBOARD ? '分镜脚本' : '参考文本';
                  return `【${tag} · ${n.title || ''}】\n${t}`;
              })
              .filter(Boolean)
              .join('\n\n');
          // 避免重复注入：若用户已手动复制过文本到 prompt，开头片段会重合
          const ownPrompt = (node.prompt || '').trim();
          const alreadyInPrompt = upstreamTextBlock && ownPrompt.length > 30
              && upstreamTextSources.some(n => {
                  const t = (n.optimizedPrompt || n.prompt || '').trim().slice(0, 30);
                  return t && ownPrompt.includes(t);
              });
          const finalPrompt = (upstreamTextBlock && !alreadyInPrompt)
              ? `${upstreamTextBlock}\n\n【用户提示】\n${ownPrompt}`
              : ownPrompt;
          if (upstreamTextBlock) {
              console.log('[Generate] auto-prepended upstream text', { length: upstreamTextBlock.length, alreadyInPrompt });
          }

          // Image generation

          if (node.type === NodeType.TEXT_TO_IMAGE || node.type === NodeType.IMAGE_TO_IMAGE) {

            results = await generateImage(

                finalPrompt, node.aspectRatio, node.model, node.resolution, node.count || 1, inputs, node.promptOptimize

            );

          }

          // Video generation

          else if (node.type === NodeType.TEXT_TO_VIDEO || node.type === NodeType.IMAGE_TO_VIDEO) {

            // 视频模型通常只接受 1 张参考图；多传会被网关拒绝或 payload 过大。这里只取第一张。
            const videoInputs = inputs.slice(0, 1);
            if (inputs.length > 1) {
                console.warn(`[Generate] Video node received ${inputs.length} input images, using first one only. Excess images ignored.`);
            }

            results = await generateVideo(

                finalPrompt, videoInputs, node.aspectRatio, node.model, node.resolution, node.duration, node.count || 1, node.promptOptimize

            );

          }

          // Start-End Frame to Video generation (首尾帧模式)

          else if (node.type === NodeType.START_END_TO_VIDEO) {

            // 添加 _FL 后缀来标识首尾帧模式

            const modelWithFL = (node.model || 'Sora 2') + '_FL';

            // 首尾帧只接受 2 张（首+尾），多余的忽略
            const trimmedInputs = inputs.slice(0, 2);
            // 如果设置了 swapFrames，交换首尾帧顺序

            const orderedInputs = node.swapFrames && trimmedInputs.length >= 2 ? [trimmedInputs[1], trimmedInputs[0]] : trimmedInputs;

            if (inputs.length > 2) {
                console.warn(`[Generate] START_END_TO_VIDEO received ${inputs.length} input images, only first 2 used.`);
            }

            results = await generateVideo(

                finalPrompt, orderedInputs, node.aspectRatio, modelWithFL, node.resolution, node.duration, node.count || 1, node.promptOptimize

            );

          }



          if (results.length > 0) {

              const currentArtifacts = node.outputArtifacts || [];

              if (node.imageSrc && !currentArtifacts.includes(node.imageSrc)) currentArtifacts.push(node.imageSrc);

              if (node.videoSrc && !currentArtifacts.includes(node.videoSrc)) currentArtifacts.push(node.videoSrc);

              const newArtifacts = [...results, ...currentArtifacts];

              

              const updates: Partial<NodeData> = { isLoading: false, outputArtifacts: newArtifacts };

              

              // Set output based on node type

              if (node.type === NodeType.TEXT_TO_IMAGE || node.type === NodeType.IMAGE_TO_IMAGE) {

                  updates.imageSrc = results[0];

              } else if (node.type === NodeType.TEXT_TO_VIDEO || node.type === NodeType.IMAGE_TO_VIDEO || node.type === NodeType.START_END_TO_VIDEO) {

                  updates.videoSrc = results[0];

              }

              

              updateNodeData(nodeId, updates);

          } else {

              throw new Error("未返回结果");

          }

      }

    } catch (e: any) {

      console.error('[Generate] failed', {
        nodeId,
        nodeType: node.type,
        model: node.model,
        prompt: (node.prompt || '').slice(0, 200),
        errorName: e?.name,
        errorMessage: e?.message,
        causeCode: e?.cause?.code,
        causeHostname: e?.cause?.hostname,
        causeMessage: e?.cause?.message,
        stack: e?.stack,
      });

      alert(`生成失败: ${(e as Error).message}`);

      updateNodeData(nodeId, { isLoading: false });

    }

  };

  // 在源节点旁边新建一个 TEXT_TO_IMAGE 节点，写入 prompt 并立即触发生成
  const handleGenerateNineGrid = (nodeId: string, template: { key: string; label: string; prompt: string }) => {
      const source = workspaceStateRef.current.nodes.find(n => n.id === nodeId);
      if (!source) return;

      const nextIndex = (label: string) => {
          const used = workspaceStateRef.current.nodes
              .map(n => n.title)
              .filter(title => title && title.startsWith(label))
              .map(title => parseInt(title.slice(label.length).trim(), 10))
              .filter(n => Number.isFinite(n));
          return (used.length ? Math.max(...used) : 0) + 1;
      };

      const width = Math.max(source.width, 480);
      const height = Math.max(source.height, 480);
      const newNode: NodeData = {
          id: generateId(),
          // 源节点带 imageSrc 时，新节点应是图生图（依赖参考图保持角色/产品一致性）
          type: source.imageSrc ? NodeType.IMAGE_TO_IMAGE : NodeType.TEXT_TO_IMAGE,
          x: source.x + source.width + 80,
          y: source.y,
          width,
          height,
          title: `${template.label} ${nextIndex(template.label)}`,
          aspectRatio: '1:1',
          model: source.model || '',
          resolution: source.resolution || '1k',
          count: 1,
          prompt: template.prompt,
      };

      pushHistory();
      setNodes(prev => [...prev, newNode]);
      // 自动连线：源节点 → 新九宫格节点
      setConnections(prev => [...prev, { id: generateId(), sourceId: source.id, targetId: newNode.id }]);
      setSelectedNodeIds(new Set([newNode.id]));
      // 等 setNodes 提交后再触发生成；handleGenerate 已改用 workspaceStateRef，能读到最新 node
      setTimeout(() => handleGenerate(newNode.id), 50);
  };

  const handleGeneratePanorama = async (nodeId: string) => {

      const node = workspaceStateRef.current.nodes.find(n => n.id === nodeId);

      const sourceImageSrc = node?.imageSrc;

      if (!node || !sourceImageSrc) {

          alert('请先选择一张图片');

          return;

      }

      const computeNextIndex = (titles: string[], label: string) => {
          const used = titles
              .filter(t => t && t.startsWith(label))
              .map(t => parseInt(t.slice(label.length).trim(), 10))
              .filter(n => Number.isFinite(n));
          return (used.length ? Math.max(...used) : 0) + 1;
      };

      // 复用源节点的模型与 key：'Banana Pro Edit' 等 handler 没注册到 MODEL_REGISTRY，
      // 直接用会拿到 fallback config（modelId 为空、依赖全局 key），多数情况下生成失败。
      // 用户已经能在源节点跑生成，说明 source.model 已配置好，直接复用最稳妥。
      const panoModel = node.model || 'BananaPro';
      // 16:9 是所有主流图片模型都支持的最宽比例；21:9 只有 'Banana Pro Edit' 一家走得通，
      // 其它模型会回落到 1:1，反而出来个方图，不如老老实实用 16:9。
      const PANO_RATIO = '16:9';
      const width = Math.max(720, node.width);
      const height = Math.max(405, Math.round(width * 9 / 16));

      const newNodeId = generateId();
      const newNodeBase: Omit<NodeData, 'title'> = {

          id: newNodeId,

          type: NodeType.PANORAMA_360,

          x: node.x + node.width + 80,

          y: node.y,

          width,

          height,

          aspectRatio: PANO_RATIO,

          model: panoModel,

          resolution: node.resolution || '2k',

          count: 1,

          prompt: node.prompt || '',

          imageSrc: undefined,

          outputArtifacts: [],

          isLoading: true,

      };

      pushHistory();

      // 标题计算放进 setNodes 回调，基于最新 prev 排序，
      // 避免连点两次"全景"时两边都用 workspaceStateRef 旧快照得到同样的"全景 1"
      setNodes(prev => {
          const title = `全景 ${computeNextIndex(prev.map(n => n.title), '全景')}`;
          return [...prev, { ...newNodeBase, title }];
      });

      setSelectedNodeIds(new Set([newNodeId]));

      const userPrompt = (node.prompt || '').trim();
      const panoPrompt = [
          userPrompt,
          'Reframe this scene as a wide cinematic 360° panorama view: ultra-wide horizontal field of view, level horizon line centered vertically, natural perspective without fisheye distortion, consistent lighting and style with the reference image.',
      ].filter(Boolean).join('\n\n');

      try {
          const results = await generateImage(
              panoPrompt,
              PANO_RATIO,
              panoModel,
              newNodeBase.resolution || '2k',
              1,
              [sourceImageSrc],
              false,
          );
          if (!results || results.length === 0) throw new Error('未返回结果');
          updateNodeData(newNodeId, {
              imageSrc: results[0],
              outputArtifacts: [results[0]],
              isLoading: false,
          });
      } catch (e: any) {
          console.error('[Panorama] generation failed', {
              sourceNodeId: nodeId,
              errorMessage: e?.message,
              cause: e?.cause,
          });
          alert(`全景生成失败: ${e?.message || e}`);
          updateNodeData(newNodeId, { isLoading: false });
      }

  };



  const handleMaximize = (nodeId: string) => {

      const node = nodes.find(n => n.id === nodeId);

      if (!node) return;

      if (node.videoSrc) setPreviewMedia({ url: node.videoSrc, type: 'video' });

      else if (node.imageSrc) setPreviewMedia({ url: node.imageSrc, type: 'image' });

      else alert("没有可预览的内容");

  };

  

  const handleHistoryPreview = (url: string, type: 'image' | 'video') => setPreviewMedia({ url, type });

  // 拆分网格模态状态（预设和自定义都走这里）
  const [splitGridState, setSplitGridState] = useState<{
    nodeId: string;
    imageSrc: string;
    title: string;
    shots: SplitShot[];
    presetRows?: number;
    presetCols?: number;
  } | null>(null);

  // 批量生成进度（拆分→高清时显示在右下角浮条）
  const [batchGenProgress, setBatchGenProgress] = useState<{
    total: number;
    completed: number;
    failed: number;
    label: string;
    startedAt: number;
    paused: boolean;
    cancelled: boolean;
  } | null>(null);
  // ref 让 async 循环能读到最新控制状态
  const batchControlRef = useRef<{ paused: boolean; cancelled: boolean }>({ paused: false, cancelled: false });
  // 用一个独立计时器让"用时"每秒刷新
  const [batchTick, setBatchTick] = useState(0);
  useEffect(() => {
    if (!batchGenProgress) return;
    const done = batchGenProgress.completed + batchGenProgress.failed;
    if (done >= batchGenProgress.total) return; // 完成后不再 tick
    const id = setInterval(() => setBatchTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [batchGenProgress?.startedAt, batchGenProgress?.completed, batchGenProgress?.failed]);

  const handleSplitImageGrid = async (nodeId: string, presetRows?: number, presetCols?: number) => {
    const node = workspaceStateRef.current.nodes.find(n => n.id === nodeId) || nodes.find(n => n.id === nodeId);
    if (!node?.imageSrc) {
      alert('当前节点没有可拆分的图片');
      return;
    }
    const upstreamShots = workspaceStateRef.current.connections
      .filter(c => c.targetId === node.id)
      .map(c => workspaceStateRef.current.nodes.find(n2 => n2.id === c.sourceId))
      .find(n2 => !!n2 && n2.type === NodeType.STORYBOARD);
    const shots = upstreamShots
      ? parseStoryboardShots(upstreamShots.optimizedPrompt || upstreamShots.prompt || '')
      : [];
    // 预设和自定义都打开模态；预设只是预填 rows/cols
    setSplitGridState({
      nodeId,
      imageSrc: node.imageSrc,
      title: node.title || '分镜图',
      shots,
      presetRows,
      presetCols,
    });
  };

  const handleSplitGridConfirm = async (payload: SplitGridConfirmPayload) => {
    if (!splitGridState) return;
    const sourceNode = workspaceStateRef.current.nodes.find(n => n.id === splitGridState.nodeId);
    if (!sourceNode) {
      setSplitGridState(null);
      return;
    }

    const { pieces, rows, cols } = payload;
    // 强制所有拆分生成的节点统一尺寸：固定 360×360 方形
    // 之所以不按 cell 真实比例自动算高度 —— 是因为：
    //   1) API 生成时 aspectRatio='1:1'，返回的是方形图
    //   2) 节点容器和生成结果保持同样比例，object-cover 不会裁切
    //   3) 32 个节点在画布上看起来整整齐齐，不会一会儿胖一会儿瘦
    const w = 360;
    const h = 360;
    console.log(`[Split Grid] All nodes will be ${w}×${h} (rows=${rows}, cols=${cols}, pieces=${pieces.length})`);
    const gap = 40;
    // 排在源图右边，按原 row/col 矩阵位置
    const startX = sourceNode.x + sourceNode.width + 120;
    const startY = sourceNode.y;

    const imageModel = sourceNode.model || (getCanvasModelOptions('IMAGE')[0]?.value || '');

    // 1. 创建图生图节点：inputImageSrc = 切下来的格子（绕过 connection-input 机制）
    const newNodes: NodeData[] = pieces.map((p) => ({
      id: generateId(),
      type: NodeType.IMAGE_TO_IMAGE,
      x: startX + p.col * (w + gap),
      y: startY + p.row * (h + gap),
      width: w,
      height: h,
      title: p.title,
      prompt: p.prompt
        ? `${p.prompt}\n\n要求：高清细节，4K，影视级渲染，保持原构图与主体`
        : '基于参考图生成高清版本：高清细节，4K，影视级渲染，保持原构图与主体',
      inputImageSrc: p.dataUrl, // ← 关键：把切出来的格子作为输入图
      aspectRatio: '1:1',
      model: imageModel,
      resolution: '2k', // 高清默认 2K
      count: 1,
    }));

    // 2. 连线：源节点 → 每个新节点（视觉上的血缘关系；实际 input 用 inputImageSrc）
    const newConnections: Connection[] = newNodes.map(nn => ({
      id: generateId(),
      sourceId: sourceNode.id,
      targetId: nn.id,
    }));

    pushHistory();
    setNodes(prev => [...prev, ...newNodes]);
    setConnections(prev => [...prev, ...newConnections]);
    setSelectedNodeIds(new Set(newNodes.map(nn => nn.id)));
    setSplitGridState(null);

    console.log(`[Split Grid] Created ${newNodes.length} HD nodes, triggering generation...`);

    // 初始化批量进度 + 重置控制状态
    batchControlRef.current = { paused: false, cancelled: false };
    setBatchGenProgress({
      total: newNodes.length,
      completed: 0,
      failed: 0,
      label: `生成 ${newNodes.length} 张高清分镜`,
      startedAt: Date.now(),
      paused: false,
      cancelled: false,
    });

    // 3. 等 setNodes 提交后触发并发生成（限流 4 并发，支持暂停/取消）
    setTimeout(async () => {
      const concurrency = 4;
      const queue = [...newNodes];
      const runNext = async (): Promise<void> => {
        while (true) {
          // 取消 → 直接退出
          if (batchControlRef.current.cancelled) return;
          // 暂停 → 等 250ms 再检查
          if (batchControlRef.current.paused) {
            await new Promise(r => setTimeout(r, 250));
            continue;
          }
          const next = queue.shift();
          if (!next) return;
          try {
            await handleGenerate(next.id);
            if (!batchControlRef.current.cancelled) {
              setBatchGenProgress(prev => prev ? { ...prev, completed: prev.completed + 1 } : prev);
            }
          } catch (e) {
            console.error('[Split Grid] generate failed for', next.title, e);
            if (!batchControlRef.current.cancelled) {
              setBatchGenProgress(prev => prev ? { ...prev, failed: prev.failed + 1 } : prev);
            }
          }
        }
      };
      await Promise.all(Array.from({ length: concurrency }, () => runNext()));
      console.log('[Split Grid] Batch finished. cancelled=', batchControlRef.current.cancelled);
      // 全部完成或取消后保留浮条 5 秒
      setTimeout(() => setBatchGenProgress(null), 5000);
    }, 100);
  };

  const handleAddToAssetLibrary = async (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || !node.imageSrc) return;
    try {
      await storageService.addAsset({
        title: node.title || '未命名素材',
        src: node.imageSrc,
        type: 'image',
        sourceNodeId: node.id,
        sourceNodeType: node.type,
        width: node.width,
        height: node.height,
      });
      window.dispatchEvent(new CustomEvent('assetLibraryUpdated'));
    } catch (e) {
      console.error('Add to asset library failed:', e);
    }
  };

  const handleAddAssetToCanvas = (asset: { src: string; title?: string; width?: number; height?: number; }) => {
    addNode(NodeType.ORIGINAL_IMAGE, undefined, undefined, {
      title: asset.title || '素材',
      imageSrc: asset.src,
      width: asset.width,
      height: asset.height,
    });
  };

  const libraryImportRef = useRef<HTMLInputElement>(null);

  const handleLibraryImportFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // tsconfig 引入了 'node' types，FileList 推断回退到 unknown[]，所以显式断言到 File[]
    const files = Array.from(e.target.files || []) as File[];
    e.target.value = '';
    if (files.length === 0) return;
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      await new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const src = ev.target?.result as string;
          try {
            await storageService.addAsset({
              title: file.name.replace(/\.[^.]+$/, '') || '导入素材',
              src,
              type: 'image',
            });
          } catch (err) {
            console.error('Import to library failed:', err);
          }
          resolve();
        };
        reader.onerror = () => resolve();
        reader.readAsDataURL(file);
      });
    }
    window.dispatchEvent(new CustomEvent('assetLibraryUpdated'));
  };

  const handleTriggerLibraryImport = () => {
    libraryImportRef.current?.click();
  };



  const copyImageToClipboard = async (nodeId: string) => {

      const node = nodes.find(n => n.id === nodeId);

      if (node && node.imageSrc) {

          try {

              const res = await fetch(node.imageSrc);

              const blob = await res.blob();

              await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob as Blob })]);

              alert("图片已复制到剪贴板");

          } catch (e) { console.error(e); alert("复制图片失败"); }

      }

  };



  const triggerReplaceImage = (nodeId: string) => {

      nodeToReplaceRef.current = nodeId;

      replaceImageRef.current?.click();

  };



  const handleReplaceImage = (e: React.ChangeEvent<HTMLInputElement>) => {

      const file = e.target.files?.[0];

      const nodeId = nodeToReplaceRef.current;

      if (file && nodeId) {

           const reader = new FileReader();

           reader.onload = (event) => {

               const img = new Image();

               img.onload = () => {

                   const node = nodes.find(n => n.id === nodeId);

                   if (node) {

                        const { width, height, ratio } = calculateImportDimensions(img.width, img.height);

                        const src = event.target?.result as string;

                        const currentArtifacts = node.outputArtifacts || [];

                        const newArtifacts = [src, ...currentArtifacts];

                        updateNodeData(nodeId, { 

                            imageSrc: src, 

                            width, height,

                            aspectRatio: `${ratio}:1`, 

                            outputArtifacts: newArtifacts

                        });

                   }

               };

               img.src = event.target?.result as string;

           };

           reader.readAsDataURL(file);

      }

      if (replaceImageRef.current) replaceImageRef.current.value = '';

      nodeToReplaceRef.current = null;

  };



  const handleSaveWorkflow = () => {

    const workflowData = { nodes, connections, transform, projectName, version: "1.0" };

    const blob = new Blob([JSON.stringify(workflowData, null, 2)], { type: "application/json" });

    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');

    link.href = url;

    const safeName = projectName.replace(/[<>:"/\\|?*]/g, '_').trim() || '未命名项目';

    link.download = `${safeName}.aistudio-flow`;

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

    URL.revokeObjectURL(url);

  };



  // ============ Canvas Workspace Management ============

  const workspaceStateRef = useRef({ nodes, connections, transform, projectName, currentWorkspaceId });

  useEffect(() => {

    workspaceStateRef.current = { nodes, connections, transform, projectName, currentWorkspaceId };

  }, [nodes, connections, transform, projectName, currentWorkspaceId]);



  const flushSaveCurrentWorkspace = useCallback(async () => {

    const snap = workspaceStateRef.current;

    if (!snap.currentWorkspaceId) return;

    try {

      await storageService.saveWorkspace({

        id: snap.currentWorkspaceId,

        name: snap.projectName,

        projectName: snap.projectName,

        nodes: snap.nodes,

        connections: snap.connections,

        transform: snap.transform,

      });

    } catch (e) {

      console.error('Failed to save workspace:', e);

    }

  }, []);



  // Debounced auto-save of current workspace when content changes

  useEffect(() => {

    if (!currentWorkspaceId) return;

    const timer = setTimeout(() => {

      storageService.saveWorkspace({

        id: currentWorkspaceId,

        name: projectName,

        projectName,

        nodes,

        connections,

        transform,

      }).catch(e => console.error('Auto-save failed:', e));

    }, 800);

    return () => clearTimeout(timer);

  }, [currentWorkspaceId, projectName, nodes, connections, transform]);



  const applyWorkspaceState = useCallback((data: {

    projectName: string;

    nodes: NodeData[];

    connections: Connection[];

    transform: CanvasTransform;

  }) => {

    // 清掉持久化时残留的 isLoading（生成中途被自动保存的节点重新加载后不应继续显示"生成中"）
    setNodes((data.nodes || []).map(n => n.isLoading ? { ...n, isLoading: false } : n));

    setConnections(data.connections || []);

    setTransform(data.transform || { x: 0, y: 0, k: ZOOM_BASE_SCALE });

    setProjectName(data.projectName || '未命名项目');

    setSelectedNodeIds(new Set());

    setSelectionBox(null);

    setSelectedConnectionId(null);

    undoStackRef.current = [];

    redoStackRef.current = [];

    setHistoryVersion(v => v + 1);

  }, []);



  const generateWorkspaceName = useCallback(async () => {

    const list = await storageService.listWorkspaces();

    let n = list.length + 1;

    const existing = new Set(list.map(w => w.name));

    while (existing.has(`未命名画布 ${n}`)) n += 1;

    return `未命名画布 ${n}`;

  }, []);



  const generateWorkspaceId = () => {

    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {

      return crypto.randomUUID();

    }

    return `ws_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  };



  const handleOpenWorkspace = useCallback(async (id: string) => {

    await flushSaveCurrentWorkspace();

    let loaded;

    try {

      loaded = await storageService.loadWorkspace(id);

    } catch (e: any) {

      throw new Error(e?.message ? `加载画布失败：${e.message}` : '加载画布失败');

    }

    if (!loaded) throw new Error('画布数据已损坏或被移除，无法打开');

    setCurrentWorkspaceId(id);

    applyWorkspaceState({

      projectName: loaded.data.projectName,

      nodes: loaded.data.nodes,

      connections: loaded.data.connections,

      transform: loaded.data.transform,

    });

    setIsCanvasManagerOpen(false);

  }, [applyWorkspaceState, flushSaveCurrentWorkspace]);



  const handleCreateWorkspace = useCallback(async () => {

    await flushSaveCurrentWorkspace();

    const id = generateWorkspaceId();

    const name = await generateWorkspaceName();

    const initialTransform: CanvasTransform = { x: 0, y: 0, k: ZOOM_BASE_SCALE };

    await storageService.saveWorkspace({

      id,

      name,

      projectName: name,

      nodes: [],

      connections: [],

      transform: initialTransform,

    });

    setCurrentWorkspaceId(id);

    applyWorkspaceState({ projectName: name, nodes: [], connections: [], transform: initialTransform });

    setIsCanvasManagerOpen(false);

  }, [applyWorkspaceState, flushSaveCurrentWorkspace, generateWorkspaceName]);



  const handleOpenCanvasManager = useCallback(async () => {

    await flushSaveCurrentWorkspace();

    setCanvasManagerRefreshToken(v => v + 1);

    setIsCanvasManagerOpen(true);

  }, [flushSaveCurrentWorkspace]);



  const handleCloseCanvasManager = useCallback(() => {

    if (!currentWorkspaceId) return;

    setIsCanvasManagerOpen(false);

  }, [currentWorkspaceId]);

  const handleRenameCurrentWorkspace = useCallback((name: string) => {

    setProjectName(name);

  }, []);



  const handleDeleteCurrentWorkspace = useCallback(() => {

    setCurrentWorkspaceId(null);

    applyWorkspaceState({ projectName: '未命名项目', nodes: [], connections: [], transform: { x: 0, y: 0, k: ZOOM_BASE_SCALE } });

  }, [applyWorkspaceState]);



  const handleNewWorkflow = () => setShowNewWorkflowDialog(true);



  const handleClearCanvas = () => {

    if (nodes.length === 0 && connections.length === 0) return;

    setShowClearCanvasDialog(true);

  };



  const handleConfirmClearCanvas = () => {

    pushHistory();

    const withContent = nodes.filter(n => n.imageSrc || n.videoSrc);

    if (withContent.length > 0) setDeletedNodes(prev => [...prev, ...withContent]);

    setNodes([]);

    setConnections([]);

    setSelectedNodeIds(new Set());

    setSelectedConnectionId(null);

    setSelectionBox(null);

    setShowClearCanvasDialog(false);

  };



  const handleConfirmNew = (shouldSave: boolean) => {

    if (shouldSave) handleSaveWorkflow();

    const withContent = nodes.filter(n => n.imageSrc || n.videoSrc);

    if (withContent.length > 0) setDeletedNodes(prev => [...prev, ...withContent]);

    setNodes([]);

    setConnections([]);

    setTransform({ x: 0, y: 0, k: ZOOM_BASE_SCALE });

    setProjectName('未命名项目');

    setShowNewWorkflowDialog(false);

    setSelectedNodeIds(new Set());

    setSelectionBox(null);

  };



  const handleLoadWorkflow = (e: React.ChangeEvent<HTMLInputElement>) => {

    const file = e.target.files?.[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = (event) => {

        try {

            const data = JSON.parse(event.target?.result as string);

            if (data.nodes && data.connections) {

                setNodes((data.nodes as NodeData[]).map(n => n.isLoading ? { ...n, isLoading: false } : n));

                setConnections(data.connections);

                if (data.transform) setTransform(data.transform);

                if (data.projectName) setProjectName(data.projectName);

            }

        } catch (err) { console.error(err); alert("Invalid workflow file"); }

    };

    reader.readAsText(file);

    e.target.value = '';

  };



  const handleDownload = async (nodeId: string) => {

      const node = nodes.find(n => n.id === nodeId);

      if (!node) return;

      const url = node.videoSrc || node.imageSrc;

      if (!url) { alert("No content to download."); return; }

      

      const ext = node.videoSrc ? 'mp4' : 'png';

      const filename = `${node.title.replace(/\s+/g, '_')}_${Date.now()}.${ext}`;



      try {

          const response = await fetch(url);

          const blob = await response.blob();

          

          // Try storage service first

          const saved = await storageService.saveFile(blob, filename);

          if (saved) return;



          const blobUrl = URL.createObjectURL(blob as Blob);

          const link = document.createElement('a');

          link.href = blobUrl;

          link.download = filename;

          document.body.appendChild(link);

          link.click();

          document.body.removeChild(link);

          URL.revokeObjectURL(blobUrl);

      } catch (e) {

          const link = document.createElement('a');

          link.href = url;

          link.download = filename;

          link.target = "_blank"; 

          document.body.appendChild(link);

          link.click();

          document.body.removeChild(link);

      }

  };



  const handleImportAsset = (e: React.ChangeEvent<HTMLInputElement>) => {

    const file = e.target.files?.[0];

    if (!file) return;

    

    const rect = containerRef.current?.getBoundingClientRect();

    const center = rect ? screenToWorld(rect.width / 2, rect.height / 2) : { x: 0, y: 0 };

    

    addImportedAssetNode(file, center.x, center.y, file.name);

    e.target.value = '';

  };



  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };



  const handleDrop = (e: React.DragEvent) => {

      e.preventDefault(); e.stopPropagation();

      const files: File[] = Array.from(e.dataTransfer.files); 

      if (files.length === 0) return;

      const worldPos = screenToWorld(e.clientX, e.clientY);

      files.forEach((file, index) => {

          const offsetX = index * 20; const offsetY = index * 20;

          addImportedAssetNode(file, worldPos.x + offsetX, worldPos.y + offsetY, file.name);

      });

  };



  const handleWheel = (e: React.WheelEvent) => {

    e.preventDefault();



    if (e.ctrlKey || e.metaKey) {

      const zoomIntensity = ZOOM_STEP;

      const direction = e.deltaY > 0 ? -1 : 1;

      let newK = transform.k + direction * zoomIntensity;

      newK = Math.min(Math.max(ZOOM_MIN, newK), ZOOM_MAX); 

      const rect = containerRef.current!.getBoundingClientRect();

      const worldX = (e.clientX - rect.left - transform.x) / transform.k;

      const worldY = (e.clientY - rect.top - transform.y) / transform.k;

      setTransform({ x: (e.clientX - rect.left) - worldX * newK, y: (e.clientY - rect.top) - worldY * newK, k: newK });

      return;

    }



    if (e.shiftKey) {

      setTransform(prev => ({ ...prev, x: prev.x - e.deltaY }));

      return;

    }



    setTransform(prev => ({ ...prev, y: prev.y - e.deltaY }));

  };



  // Zoom in/out centered on the canvas viewport center

  const handleZoomBy = useCallback((delta: number) => {

    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();

    const cx = rect.width / 2;

    const cy = rect.height / 2;

    const newK = Math.min(Math.max(ZOOM_MIN, transform.k + delta), ZOOM_MAX);

    if (newK === transform.k) return;

    const worldX = (cx - transform.x) / transform.k;

    const worldY = (cy - transform.y) / transform.k;

    setTransform({ x: cx - worldX * newK, y: cy - worldY * newK, k: newK });

  }, [transform]);



  // Fit all nodes to view (整理画布). When canvas is empty, recenter to origin at 100%.

  const handleArrangeCanvas = useCallback(() => {

    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();

    if (nodes.length === 0) {

      setTransform({ x: rect.width / 2, y: rect.height / 2, k: ZOOM_BASE_SCALE });

      return;

    }

    const padding = 80;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    nodes.forEach(n => {

      if (n.x < minX) minX = n.x;

      if (n.y < minY) minY = n.y;

      if (n.x + n.width > maxX) maxX = n.x + n.width;

      if (n.y + n.height > maxY) maxY = n.y + n.height;

    });

    const w = Math.max(1, maxX - minX);

    const h = Math.max(1, maxY - minY);

    const fitK = Math.min((rect.width - padding * 2) / w, (rect.height - padding * 2) / h, ZOOM_BASE_SCALE);

    const k = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, fitK));

    setTransform({

      x: (rect.width - w * k) / 2 - minX * k,

      y: (rect.height - h * k) / 2 - minY * k,

      k,

    });

  }, [nodes]);



  // Center the viewport at a given world point (used by minimap)

  const handleNavigateTo = useCallback((worldX: number, worldY: number) => {

    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();

    setTransform(prev => ({ ...prev, x: rect.width / 2 - worldX * prev.k, y: rect.height / 2 - worldY * prev.k }));

  }, []);



  // Track viewport size for minimap rendering

  useEffect(() => {

    const el = containerRef.current;

    if (!el) return;

    const updateSize = () => {

      const r = el.getBoundingClientRect();

      setViewportSize({ width: r.width, height: r.height });

    };

    updateSize();

    const ro = new ResizeObserver(updateSize);

    ro.observe(el);

    return () => ro.disconnect();

  }, []);



  const handleMouseDown = (e: React.MouseEvent) => {

    if (contextMenu) setContextMenu(null);

    if (quickAddMenu) setQuickAddMenu(null);

    if (selectedConnectionId) setSelectedConnectionId(null);

    if (e.button === 1 || (e.button === 0 && spacePressed.current)) {

      setDragMode('PAN');

      dragStartRef.current = { x: e.clientX, y: e.clientY };

      initialTransformRef.current = { ...transform };

      e.preventDefault(); return;

    }

    if (e.target === containerRef.current && e.button === 0) {

      // 点击画布 → 主动失去输入框焦点（避免之后按 Delete 时事件还在 textarea 上无法删节点）
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) active.blur();

      // 有持久化的选区框 → 这次点击清掉它（除非按住 Shift 想追加）
      if (selectionBox && !e.shiftKey) setSelectionBox(null);

      const now = Date.now();
      const isDoubleClick = now - lastCanvasMouseDownAtRef.current < 350;
      lastCanvasMouseDownAtRef.current = now;

      // Ctrl/Cmd 拖 或 双击后拖 → 框选模式
      if (e.ctrlKey || e.metaKey || isDoubleClick) {

        setDragMode('SELECT');

        dragStartRef.current = { x: e.clientX, y: e.clientY };

        setSelectionBox({ x: 0, y: 0, w: 0, h: 0 });

        if (!e.shiftKey) setSelectedNodeIds(new Set());

        e.preventDefault();

        return;

      }



      setDragMode('PAN');

      dragStartRef.current = { x: e.clientX, y: e.clientY };

      initialTransformRef.current = { ...transform };

      if (selectedNodeIds.size > 0) setSelectedNodeIds(new Set());

      e.preventDefault();

    }

  };



  const handleNodeMouseDown = (e: React.MouseEvent, id: string) => {

    e.stopPropagation();

    if (contextMenu) setContextMenu(null);

    if (quickAddMenu) setQuickAddMenu(null);

    if (selectedConnectionId) setSelectedConnectionId(null);

    if (e.button === 0) {

        setDragMode('DRAG_NODE');

        interactionHistoryRecordedRef.current = false;

        dragStartRef.current = { x: e.clientX, y: e.clientY };

        const isAlreadySelected = selectedNodeIds.has(id);

        let newSelection = new Set(selectedNodeIds);

        if (e.ctrlKey || e.metaKey || e.shiftKey) { isAlreadySelected ? newSelection.delete(id) : newSelection.add(id); } else { if (!isAlreadySelected) { newSelection.clear(); newSelection.add(id); } }

        setSelectedNodeIds(newSelection);

        initialNodePositionsRef.current = nodes.map(n => ({ id: n.id, x: n.x, y: n.y }));

    }

  };



  const handleNodeContextMenu = (e: React.MouseEvent, id: string, type: NodeType) => {

      e.stopPropagation(); e.preventDefault();

      const worldPos = screenToWorld(e.clientX, e.clientY);

      setContextMenu({ type: 'NODE', nodeId: id, nodeType: type, x: e.clientX, y: e.clientY, worldX: worldPos.x, worldY: worldPos.y });

      if (!selectedNodeIds.has(id)) setSelectedNodeIds(new Set([id]));

  };



  const handleCanvasContextMenu = (e: React.MouseEvent) => {

      e.preventDefault();

      const worldPos = screenToWorld(e.clientX, e.clientY);

      setContextMenu({ type: 'CANVAS', x: e.clientX, y: e.clientY, worldX: worldPos.x, worldY: worldPos.y });

  };



  const handleResizeStart = (e: React.MouseEvent, nodeId: string) => {

      e.stopPropagation(); e.preventDefault();

      const node = nodes.find(n => n.id === nodeId);

      if (!node) return;

      setDragMode('RESIZE_NODE');

      interactionHistoryRecordedRef.current = false;

      dragStartRef.current = { x: e.clientX, y: e.clientY, w: node.width, h: node.height, nodeId: nodeId };

      setSelectedNodeIds(new Set([nodeId]));

  };



  const handleConnectStart = (e: React.MouseEvent, nodeId: string, type: 'source' | 'target') => {

    e.stopPropagation(); e.preventDefault();

    connectionStartRef.current = { nodeId, type };

    setDragMode('CONNECT');

    setTempConnection(screenToWorld(e.clientX, e.clientY));

  };



  const handleMouseMove = (e: React.MouseEvent) => {

    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    const worldPos = screenToWorld(e.clientX, e.clientY);

    if (dragMode !== 'NONE' && e.buttons === 0) { setDragMode('NONE'); interactionHistoryRecordedRef.current = false; dragStartRef.current = { x: 0, y: 0 }; return; }

    if (dragMode === 'PAN') {

      setTransform({ ...initialTransformRef.current, x: initialTransformRef.current.x + (e.clientX - dragStartRef.current.x), y: initialTransformRef.current.y + (e.clientY - dragStartRef.current.y) });

    } else if (dragMode === 'DRAG_NODE') {

      if (!interactionHistoryRecordedRef.current) {

        pushHistory();

        interactionHistoryRecordedRef.current = true;

      }

      const dx = (e.clientX - dragStartRef.current.x) / transform.k;

      const dy = (e.clientY - dragStartRef.current.y) / transform.k;

      setNodes(prev => prev.map(n => {

        if (!selectedNodeIds.has(n.id)) return n;

        const initial = initialNodePositionsRef.current.find(init => init.id === n.id);

        if (!initial) return n;

        let nx = initial.x + dx;

        let ny = initial.y + dy;

        if (gridSnap) {

          nx = Math.round(nx / GRID_SIZE) * GRID_SIZE;

          ny = Math.round(ny / GRID_SIZE) * GRID_SIZE;

        }

        return { ...n, x: nx, y: ny };

      }));

    } else if (dragMode === 'SELECT') {

        const x = Math.min(dragStartRef.current.x, e.clientX);

        const y = Math.min(dragStartRef.current.y, e.clientY);

        const w = Math.abs(e.clientX - dragStartRef.current.x);

        const h = Math.abs(e.clientY - dragStartRef.current.y);

        setSelectionBox({ x: x - containerRef.current!.getBoundingClientRect().left, y: y - containerRef.current!.getBoundingClientRect().top, w, h });

        const worldStartX = (x - containerRef.current!.getBoundingClientRect().left - transform.x) / transform.k;

        const worldStartY = (y - containerRef.current!.getBoundingClientRect().top - transform.y) / transform.k;

        const worldWidth = w / transform.k; const worldHeight = h / transform.k;

        const newSelection = new Set<string>();

        nodes.forEach(n => { if (n.x < worldStartX + worldWidth && n.x + n.width > worldStartX && n.y < worldStartY + worldHeight && n.y + n.height > worldStartY) newSelection.add(n.id); });

        setSelectedNodeIds(newSelection);

    } else if (dragMode === 'CONNECT') {

        setTempConnection(worldPos);

        if (connectionStartRef.current?.type === 'source') {

            const candidates = nodes.filter(n => n.id !== connectionStartRef.current?.nodeId).filter(n => n.type !== NodeType.ORIGINAL_IMAGE && n.type !== NodeType.ORIGINAL_VIDEO)

                .map(n => ({ node: n, dist: Math.sqrt(Math.pow(worldPos.x - (n.x + n.width/2), 2) + Math.pow(worldPos.y - (n.y + n.height/2), 2)) }))

                .filter(item => item.dist < 500).sort((a, b) => a.dist - b.dist).slice(0, 3).map(item => item.node);

            setSuggestedNodes(candidates);

        }

    } else if (dragMode === 'RESIZE_NODE') {

        const nodeId = dragStartRef.current.nodeId;

        const node = nodes.find(n => n.id === nodeId);

        if (node) {

            if (!interactionHistoryRecordedRef.current) {

                pushHistory();

                interactionHistoryRecordedRef.current = true;

            }

            const dx = (e.clientX - dragStartRef.current.x) / transform.k;

            let ratio = 1.33; 

            if (node.aspectRatio) { const [w, h] = node.aspectRatio.split(':').map(Number); if (!isNaN(w) && !isNaN(h) && h !== 0) ratio = w / h; } 

            else if (node.type === NodeType.ORIGINAL_IMAGE || node.type === NodeType.ORIGINAL_VIDEO) { ratio = (dragStartRef.current.w || 1) / (dragStartRef.current.h || 1); }

            let minWidth = 150;

            if (node.type !== NodeType.CREATIVE_DESC && node.type !== NodeType.STORYBOARD) {

                const limit1 = ratio >= 1 ? 400 * ratio : 400;

                minWidth = Math.max(limit1, 400);

            } else minWidth = node.type === NodeType.STORYBOARD ? 360 : 280;

            let newWidth = Math.max(minWidth, (dragStartRef.current.w || 0) + dx);

            setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, width: newWidth, height: newWidth / ratio } : n));

        }

    }

  };



  const handleMouseUp = (e: React.MouseEvent) => {

    if (dragMode === 'CONNECT' && connectionStartRef.current?.type === 'source') {

         setQuickAddMenu({ sourceId: connectionStartRef.current.nodeId, x: e.clientX, y: e.clientY, worldX: screenToWorld(e.clientX, e.clientY).x, worldY: screenToWorld(e.clientX, e.clientY).y });

    }

    // SELECT 模式松手：保留选区框（持久化显示，等下次点击或操作再清掉）
    const wasSelectingWithNodes = dragMode === 'SELECT' && selectedNodeIds.size > 0;

    if (dragMode !== 'NONE') {
        setDragMode('NONE');
        setTempConnection(null);
        connectionStartRef.current = null;
        setSuggestedNodes([]);
        // 框选有选中节点时保留 selectionBox；否则清掉
        if (!wasSelectingWithNodes) setSelectionBox(null);
        interactionHistoryRecordedRef.current = false;
    }

  };



  const createConnection = (sourceId: string, targetId: string) => {

      if (!connections.some(c => c.sourceId === sourceId && c.targetId === targetId)) {

          pushHistory();

          setConnections(prev => [...prev, { id: generateId(), sourceId, targetId }]);

          // Auto-promote target type when an image-bearing source is connected
          const source = nodes.find(n => n.id === sourceId);
          const target = nodes.find(n => n.id === targetId);
          if (source && target && source.imageSrc) {
              if (target.type === NodeType.TEXT_TO_IMAGE) {
                  setNodes(prev => prev.map(n => n.id === targetId ? { ...n, type: NodeType.IMAGE_TO_IMAGE } : n));
              } else if (target.type === NodeType.TEXT_TO_VIDEO) {
                  setNodes(prev => prev.map(n => n.id === targetId ? { ...n, type: NodeType.IMAGE_TO_VIDEO } : n));
              }
          }

      }

      setDragMode('NONE'); setTempConnection(null); connectionStartRef.current = null; setSuggestedNodes([]);

  };



  const handlePortMouseUp = (e: React.MouseEvent, nodeId: string, type: 'source' | 'target') => {

      e.stopPropagation(); e.preventDefault();

      if (dragMode === 'CONNECT' && connectionStartRef.current && connectionStartRef.current.type === 'source' && type === 'target' && connectionStartRef.current.nodeId !== nodeId) createConnection(connectionStartRef.current.nodeId, nodeId);

  };



  const deleteNode = (id: string) => {

      pushHistory();

      const node = nodes.find(n => n.id === id);

      if (node && (node.imageSrc || node.videoSrc)) setDeletedNodes(prev => [...prev, node]);

      setNodes(prev => prev.filter(n => n.id !== id));

      setConnections(prev => prev.filter(c => c.sourceId !== id && c.targetId !== id));

  };



  const removeConnection = (id: string) => { pushHistory(); setConnections(prev => prev.filter(c => c.id !== id)); setSelectedConnectionId(null); };



  const renderClearCanvasDialog = () => {

      if (!showClearCanvasDialog) return null;

      const totalCount = nodes.length;

      const withContentCount = nodes.filter(n => n.imageSrc || n.videoSrc).length;

      return (

        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/65 backdrop-blur-md animate-in fade-in duration-200 ease-organic" onClick={() => setShowClearCanvasDialog(false)}>

            <div className={`surface-panel w-[400px] p-6 rounded-2xl flex flex-col gap-4 animate-in zoom-in-95 fade-in duration-200 ease-organic ${isDark ? 'text-gray-200' : 'text-gray-800'}`} onClick={(e) => e.stopPropagation()}>

                <div>

                    <h3 className="text-lg font-bold flex items-center gap-2 tracking-tight"><Icons.Trash2 size={20} className="text-red-500"/>清空当前画布</h3>

                    <p className={`text-xs mt-2 leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>将清空当前画布上的全部节点与连线，共 {totalCount} 个节点{withContentCount > 0 ? `（含 ${withContentCount} 个生成结果，可在历史中找回）` : ''}。<br/>项目名称会保留，本操作可通过 Ctrl+Z 撤销。</p>

                </div>

                <div className="divider-soft" />

                <div className="flex justify-end gap-2">

                    <button onClick={() => setShowClearCanvasDialog(false)} className={`press px-4 py-2 rounded-lg text-xs font-medium transition-colors ${isDark ? 'hover:bg-white/[0.06] text-gray-400' : 'hover:bg-black/[0.04] text-gray-600'}`}>取消</button>

                    <button onClick={handleConfirmClearCanvas} className={`press px-4 py-2 rounded-lg text-xs font-bold text-white transition-colors shadow-md shadow-red-500/30 flex items-center gap-1.5 ${isDark ? 'bg-red-600 hover:bg-red-500' : 'bg-red-500 hover:bg-red-400'}`}><Icons.Trash2 size={14}/>清空</button>

                </div>

            </div>

        </div>

      );

  };



  const renderNewWorkflowDialog = () => {

      if (!showNewWorkflowDialog) return null;

      return (

        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/65 backdrop-blur-md animate-in fade-in duration-200 ease-organic" onClick={() => setShowNewWorkflowDialog(false)}>

            <div className={`surface-panel w-[400px] p-6 rounded-2xl flex flex-col gap-4 animate-in zoom-in-95 fade-in duration-200 ease-organic ${isDark ? 'text-gray-200' : 'text-gray-800'}`} onClick={(e) => e.stopPropagation()}>

                <div>

                    <h3 className="text-lg font-bold flex items-center gap-2 tracking-tight"><Icons.FilePlus size={20} className="text-blue-500"/>新建工作流</h3>

                    <p className={`text-xs mt-2 leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>是否在创建新工作流之前保存当前工作流？<br/>任何未保存的更改将永久丢失。</p>

                </div>

                <div className="divider-soft" />

                <div className="flex justify-end gap-2">

                    <button onClick={() => setShowNewWorkflowDialog(false)} className={`press px-4 py-2 rounded-lg text-xs font-medium transition-colors ${isDark ? 'hover:bg-white/[0.06] text-gray-400' : 'hover:bg-black/[0.04] text-gray-600'}`}>取消</button>

                    <button onClick={() => handleConfirmNew(false)} className={`press px-4 py-2 rounded-lg text-xs font-bold transition-colors ring-1 ring-inset ${isDark ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 ring-red-500/20' : 'bg-red-50 text-red-600 hover:bg-red-100 ring-red-200'}`}>不保存</button>

                    <button onClick={() => handleConfirmNew(true)} className={`press px-4 py-2 rounded-lg text-xs font-bold text-white transition-colors shadow-md shadow-blue-500/30 flex items-center gap-1.5 ${isDark ? 'bg-blue-600 hover:bg-blue-500' : 'bg-blue-500 hover:bg-blue-400'}`}><Icons.Save size={14}/>保存并新建</button>

                </div>

            </div>

        </div>

      );

  };



  const renderContextMenu = () => {

    if (!contextMenu) return null;

    const menuWidth = 220;

    const menuHeight = contextMenu.type === 'CANVAS' ? 304 : 248;

    const left = typeof window === 'undefined' ? contextMenu.x : Math.min(contextMenu.x, window.innerWidth - menuWidth - 12);

    const top = typeof window === 'undefined' ? contextMenu.y : Math.min(contextMenu.y, window.innerHeight - menuHeight - 12);

    const surfaceClass = `surface-panel fixed z-50 w-[220px] rounded-[18px] px-3 py-3 flex flex-col animate-in fade-in zoom-in-95 duration-150 ease-organic`;

    const dividerClass = `h-px my-2 ${isDark ? 'bg-white/[0.07]' : 'bg-gray-100'}`;

    const shortcutClass = `ml-auto text-xs tabular-nums ${isDark ? 'text-zinc-500' : 'text-gray-400'}`;

    const submenuWidth = 240;

    const openSubmenuToLeft = typeof window !== 'undefined' && left + menuWidth + submenuWidth + 12 > window.innerWidth;

    const submenuOuterClass = `absolute top-[-92px] ${openSubmenuToLeft ? 'right-full pr-2' : 'left-full pl-2'} opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 ease-organic`;

    const submenuSurfaceClass = `surface-panel w-[240px] rounded-[18px] px-4 py-4`;

    const MenuItem = ({ label, shortcut, onClick, disabled, danger }: { label: string; shortcut?: string; onClick?: () => void; disabled?: boolean; danger?: boolean }) => (

        <button

            type="button"

            disabled={disabled}

            onClick={onClick}

            className={`press flex h-10 items-center rounded-lg px-2.5 text-[13px] font-medium transition-colors duration-150 ${

                disabled

                    ? (isDark ? 'text-zinc-700 cursor-not-allowed' : 'text-gray-300 cursor-not-allowed')

                    : danger

                        ? (isDark ? 'text-red-400 hover:bg-red-500/15' : 'text-red-600 hover:bg-red-50')

                        : (isDark ? 'text-zinc-200 hover:bg-white/[0.08]' : 'text-gray-800 hover:bg-black/[0.04]')

            }`}

        >

            <span>{label}</span>

            {shortcut && <span className={shortcutClass}>{shortcut}</span>}

        </button>

    );

    const AddNodeSubItem = ({ icon: Icon, label, beta, onClick, disabled }: { icon: any; label: string; beta?: boolean; onClick?: () => void; disabled?: boolean }) => (

        <button

            type="button"

            disabled={disabled}

            onClick={onClick}

            className={`flex h-[52px] w-full items-center gap-3 rounded-xl px-1.5 text-sm font-medium transition-colors ${

                disabled

                    ? (isDark ? 'text-zinc-700 cursor-not-allowed' : 'text-gray-300 cursor-not-allowed')

                    : (isDark ? 'text-zinc-100 hover:bg-white/10' : 'text-gray-800 hover:bg-gray-50')

            }`}

        >

            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${

                isDark ? 'bg-white/10' : 'bg-gray-100'

            }`}>

                <Icon size={19} strokeWidth={2.1} />

            </span>

            <span>{label}</span>

            {beta && (

                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${

                    isDark ? 'bg-white/10 text-zinc-500' : 'bg-gray-100 text-gray-400'

                }`}>

                    Beta

                </span>

            )}

        </button>

    );

    const addContextNode = (type: NodeType) => {

        addNode(type, contextMenu.worldX, contextMenu.worldY);

        setContextMenu(null);

    };



    return (

        <div className={surfaceClass} style={{ left, top }} onMouseDown={(e) => e.stopPropagation()}>

            {contextMenu.type === 'NODE' && contextMenu.nodeId && (() => {

                const node = nodes.find(n => n.id === contextMenu.nodeId);

                const canToggleVideoType = node?.type === NodeType.TEXT_TO_VIDEO || node?.type === NodeType.START_END_TO_VIDEO;

                

                return (

                    <>

                        <MenuItem label="复制节点" shortcut="⌘C" onClick={() => { performCopy(); setContextMenu(null); }} />

                        {(contextMenu.nodeType === NodeType.ORIGINAL_IMAGE || contextMenu.nodeType === NodeType.TEXT_TO_IMAGE || contextMenu.nodeType === NodeType.IMAGE_TO_IMAGE) && (

                            <MenuItem label="替换图片" onClick={() => { triggerReplaceImage(contextMenu.nodeId!); setContextMenu(null); }} />

                        )}

                        {canToggleVideoType && (

                            <MenuItem label={node?.type === NodeType.TEXT_TO_VIDEO ? '切换为首尾帧模式' : '切换为普通视频模式'} onClick={() => { if (contextMenu.nodeId) { const newNode = nodes.find(n => n.id === contextMenu.nodeId); if (newNode) { const newType = newNode.type === NodeType.TEXT_TO_VIDEO ? NodeType.START_END_TO_VIDEO : NodeType.TEXT_TO_VIDEO; updateNodeData(contextMenu.nodeId, { type: newType, title: newType === NodeType.START_END_TO_VIDEO ? '首尾帧视频' : '生视频' }); } setContextMenu(null); } }} />

                        )}

                        <MenuItem label="复制图片数据" onClick={() => { if (contextMenu.nodeId) copyImageToClipboard(contextMenu.nodeId); setContextMenu(null); }} />

                        <div className={dividerClass}></div>

                        <MenuItem
                            label={(selectedNodeIds.size > 1 && contextMenu.nodeId && selectedNodeIds.has(contextMenu.nodeId)) ? `删除选中 ${selectedNodeIds.size} 个节点` : '删除'}
                            shortcut="⌫"
                            danger
                            onClick={() => {
                                if (selectedNodeIds.size > 1 && contextMenu.nodeId && selectedNodeIds.has(contextMenu.nodeId)) {
                                    // 多选 + 右键的节点在选中里 → 批量删除全部选中
                                    pushHistory();
                                    const nodesToDelete = nodes.filter(n => selectedNodeIds.has(n.id));
                                    const withContent = nodesToDelete.filter(n => n.imageSrc || n.videoSrc);
                                    if (withContent.length > 0) setDeletedNodes(prev => [...prev, ...withContent]);
                                    setNodes(prev => prev.filter(n => !selectedNodeIds.has(n.id)));
                                    setConnections(prev => prev.filter(c => !selectedNodeIds.has(c.sourceId) && !selectedNodeIds.has(c.targetId)));
                                    setSelectedNodeIds(new Set());
                                } else if (contextMenu.nodeId) {
                                    deleteNode(contextMenu.nodeId);
                                }
                                setContextMenu(null);
                            }}
                        />

                    </>

                );

            })()}

            {contextMenu.type === 'CANVAS' && (() => {

                return (

                    <>

                        <MenuItem label="上传" onClick={() => { setContextMenu(null); setTimeout(() => assetInputRef.current?.click(), 0); }} />

                        <MenuItem label="保存到我的素材" disabled />

                        <div className="relative group">

                            <button

                                type="button"

                                className={`flex h-11 w-full items-center rounded-xl px-2 text-sm transition-colors ${

                                    isDark ? 'text-zinc-200 hover:bg-white/10' : 'text-gray-800 hover:bg-gray-50'

                                }`}

                            >

                                <span>添加节点</span>

                                <Icons.ChevronRight size={16} className={`ml-auto ${isDark ? 'text-zinc-600' : 'text-gray-300'}`} />

                            </button>

                            <div className={submenuOuterClass}>

                                <div className={submenuSurfaceClass}>

                                    <div className={`px-1.5 pb-2 text-sm ${isDark ? 'text-zinc-300' : 'text-gray-500'}`}>添加节点</div>

                                    <AddNodeSubItem icon={Icons.FileText} label="文本" onClick={() => addContextNode(NodeType.CREATIVE_DESC)} />

                                    <AddNodeSubItem icon={Icons.ImagePlus} label="图片" onClick={() => addContextNode(NodeType.TEXT_TO_IMAGE)} />

                                    <AddNodeSubItem icon={Icons.Video} label="视频" onClick={() => addContextNode(NodeType.TEXT_TO_VIDEO)} />

                                    <AddNodeSubItem icon={Icons.Scissors} label="视频合成" beta onClick={() => addContextNode(NodeType.START_END_TO_VIDEO)} />

                                    <AddNodeSubItem icon={Icons.Sliders} label="音频" disabled />

                                    <AddNodeSubItem icon={Icons.BookOpen} label="脚本" beta onClick={() => addContextNode(NodeType.STORYBOARD)} />

                                    <div className={`px-1.5 py-2 text-sm ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>添加资源</div>

                                    <AddNodeSubItem icon={Icons.Upload} label="上传" onClick={() => { setContextMenu(null); setTimeout(() => assetInputRef.current?.click(), 0); }} />

                                    <AddNodeSubItem icon={Icons.Album} label="从图库选择" disabled />

                                </div>

                            </div>

                        </div>

                        <div className={dividerClass}></div>

                        <MenuItem label="撤销" shortcut="⌘Z" disabled={!canUndo} onClick={() => { handleUndo(); setContextMenu(null); }} />

                        <MenuItem label="重做" shortcut="⇧⌘Z" disabled={!canRedo} onClick={() => { handleRedo(); setContextMenu(null); }} />

                        <div className={dividerClass}></div>

                        <MenuItem label="粘贴" shortcut="⌘V" onClick={() => { handleContextPaste({ x: contextMenu.worldX, y: contextMenu.worldY }); setContextMenu(null); }} />

                    </>

                );

            })()}

        </div>

    );

  };



  const renderQuickAddMenu = () => {

    if (!quickAddMenu) return null;

    

    const menuWidth = 240;

    const menuHeight = 500;

    const left = typeof window === 'undefined' ? quickAddMenu.x : Math.min(quickAddMenu.x, window.innerWidth - menuWidth - 12);

    const top = typeof window === 'undefined' ? quickAddMenu.y : Math.min(quickAddMenu.y, window.innerHeight - menuHeight - 12);

    const surfaceClass = `surface-panel fixed z-50 w-[240px] rounded-[18px] px-4 py-4 flex flex-col animate-in fade-in zoom-in-95 duration-150 ease-organic`;

    const sectionTitleClass = `px-1.5 py-2 text-[11px] font-semibold uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-gray-500'}`;

    const QuickAddItem = ({ icon: Icon, label, type, beta, disabled, onClick }: { icon: any; label: string; type?: NodeType; beta?: boolean; disabled?: boolean; onClick?: () => void }) => (

        <button

            type="button"

            disabled={disabled}

            className={`press group flex h-[52px] w-full items-center gap-3 rounded-xl px-1.5 text-sm font-medium transition-colors duration-150 ${

                disabled

                    ? (isDark ? 'text-zinc-700 cursor-not-allowed' : 'text-gray-300 cursor-not-allowed')

                    : (isDark ? 'text-zinc-100 hover:bg-white/[0.08]' : 'text-gray-800 hover:bg-black/[0.04]')

            }`}

            onClick={() => {

                if (disabled) return;

                if (onClick) onClick();

                else if (type) handleQuickAddNode(type);

            }}

        >

            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset transition-colors duration-150 ${

                disabled

                    ? (isDark ? 'bg-white/[0.04] ring-white/[0.04]' : 'bg-gray-50 ring-black/[0.03]')

                    : (isDark ? 'bg-white/[0.08] ring-white/[0.06] group-hover:bg-white/[0.12]' : 'bg-gray-100 ring-black/[0.04] group-hover:bg-gray-200/70')

            }`}>

                <Icon size={19} strokeWidth={2.1} />

            </span>

            <span>{label}</span>

            {beta && (

                <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold ${

                    isDark ? 'bg-white/[0.08] text-zinc-400' : 'bg-gray-100 text-gray-500'

                }`}>

                    Beta

                </span>

            )}

        </button>

    );

    

    return (

        <div 

            className={surfaceClass}

            style={{ left, top }} 

            onMouseDown={(e) => e.stopPropagation()}

        >

            <div className={sectionTitleClass}>添加节点</div>

            <QuickAddItem icon={Icons.FileText} label="文本" type={NodeType.CREATIVE_DESC} />

            <QuickAddItem icon={Icons.ImagePlus} label="图片" type={NodeType.TEXT_TO_IMAGE} />

            <QuickAddItem icon={Icons.Video} label="视频" type={NodeType.TEXT_TO_VIDEO} />

            <QuickAddItem icon={Icons.Scissors} label="视频合成" type={NodeType.START_END_TO_VIDEO} beta />

            <QuickAddItem icon={Icons.Sliders} label="音频" disabled />

            <QuickAddItem icon={Icons.BookOpen} label="脚本" type={NodeType.STORYBOARD} beta />

            <div className={sectionTitleClass}>添加资源</div>

            <QuickAddItem icon={Icons.Upload} label="上传" onClick={() => { setQuickAddMenu(null); setTimeout(() => assetInputRef.current?.click(), 0); }} />

            <QuickAddItem icon={Icons.Album} label="从图库选择" disabled />

        </div>

    );

  };



  const toggleTheme = (dark: boolean) => {

      setCanvasBg(dark ? '#0B0C0E' : '#F5F7FA');

  };



  return (

    <div className="w-full h-screen overflow-hidden flex relative font-sans text-gray-800">

        <SettingsModal 

            isOpen={isSettingsOpen} 

            onClose={() => setIsSettingsOpen(false)} 

            isDark={isDark} 

        />

        {splitGridState && (
            <SplitGridModal
                isOpen={!!splitGridState}
                sourceImageSrc={splitGridState.imageSrc}
                sourceTitle={splitGridState.title}
                shots={splitGridState.shots}
                presetRows={splitGridState.presetRows}
                presetCols={splitGridState.presetCols}
                onClose={() => setSplitGridState(null)}
                onConfirm={handleSplitGridConfirm}
                isDark={isDark}
            />
        )}

        {batchGenProgress && (() => {
            const { total, completed, failed, label, startedAt, paused, cancelled } = batchGenProgress;
            const done = completed + failed;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            const isFinished = done >= total || cancelled;
            const elapsed = Math.floor((Date.now() - startedAt) / 1000);

            const togglePause = () => {
                const next = !paused;
                batchControlRef.current.paused = next;
                setBatchGenProgress(prev => prev ? { ...prev, paused: next } : prev);
            };
            const cancelBatch = () => {
                batchControlRef.current.cancelled = true;
                batchControlRef.current.paused = false;
                setBatchGenProgress(prev => prev ? { ...prev, cancelled: true, paused: false } : prev);
            };

            // 状态颜色
            const statusColor = cancelled
                ? (isDark ? 'bg-zinc-500/15 text-zinc-400' : 'bg-zinc-100 text-zinc-600')
                : paused
                    ? (isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-100 text-amber-600')
                    : isFinished
                        ? (failed > 0
                            ? (isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-100 text-amber-600')
                            : (isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-600'))
                        : (isDark ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-100 text-blue-600');
            const statusIcon = cancelled
                ? <Icons.X size={16} strokeWidth={3} />
                : paused
                    ? <Icons.Pause size={16} />
                    : isFinished
                        ? (failed > 0 ? <Icons.Info size={16} /> : <Icons.Check size={16} strokeWidth={3} />)
                        : <Icons.Loader2 size={16} className="animate-spin" />;
            const statusLabel = cancelled
                ? `已取消（${completed} 张已完成）`
                : paused
                    ? `已暂停（${done}/${total}）`
                    : isFinished
                        ? (failed === 0 ? '全部完成 🎉' : `完成 ${completed} / 失败 ${failed}`)
                        : label;
            const barColor = cancelled
                ? 'bg-gradient-to-r from-zinc-400 to-zinc-500'
                : paused
                    ? 'bg-gradient-to-r from-amber-400 to-orange-500'
                    : isFinished
                        ? (failed > 0 ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 'bg-gradient-to-r from-emerald-400 to-emerald-500')
                        : 'bg-gradient-to-r from-blue-400 via-indigo-500 to-purple-500';

            return (
                <div className="fixed bottom-6 right-6 z-[250] w-[360px] rounded-2xl glass-card overflow-hidden animate-in slide-in-from-bottom-3 fade-in duration-300"
                    style={{ backgroundColor: isDark ? 'rgba(20,20,22,0.95)' : 'rgba(255,255,255,0.95)', backdropFilter: 'blur(20px)' }}
                >
                    <div className={`px-4 py-3 flex items-center gap-3 border-b ${isDark ? 'border-white/[0.06]' : 'border-zinc-100'}`}>
                        <div className={`flex items-center justify-center w-9 h-9 rounded-xl ${statusColor}`}>
                            {statusIcon}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className={`text-[13px] font-semibold truncate ${isDark ? 'text-zinc-100' : 'text-gray-900'}`}>
                                {statusLabel}
                            </div>
                            <div className={`text-[11px] mt-0.5 tabular-nums ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>
                                {done} / {total} · {elapsed}s 用时
                                {failed > 0 && <span className={isDark ? ' text-red-400' : ' text-red-600'}> · {failed} 失败</span>}
                            </div>
                        </div>
                    </div>

                    {/* 进度条 */}
                    <div className={`h-1.5 ${isDark ? 'bg-white/[0.05]' : 'bg-zinc-200'}`}>
                        <div
                            className={`h-full transition-all duration-500 ease-out ${barColor}`}
                            style={{ width: `${pct}%` }}
                        />
                    </div>

                    {/* 操作行 */}
                    <div className={`flex items-center gap-1.5 px-3 py-2 ${isDark ? 'bg-white/[0.02]' : 'bg-zinc-50/60'}`}>
                        {!isFinished && (
                            <button
                                onClick={togglePause}
                                className={`flex-1 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                                    paused
                                        ? (isDark ? 'bg-blue-500/15 text-blue-300 hover:bg-blue-500/25' : 'bg-blue-50 text-blue-700 hover:bg-blue-100')
                                        : (isDark ? 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25' : 'bg-amber-50 text-amber-700 hover:bg-amber-100')
                                }`}
                            >
                                {paused ? <Icons.Play size={12} /> : <Icons.Pause size={12} />}
                                <span>{paused ? '继续' : '暂停'}</span>
                            </button>
                        )}
                        {!isFinished && (
                            <button
                                onClick={cancelBatch}
                                className={`inline-flex h-8 items-center justify-center gap-1.5 px-3 rounded-lg text-[12px] font-medium transition-colors ${isDark ? 'bg-white/[0.04] text-zinc-300 hover:bg-red-500/15 hover:text-red-300' : 'bg-zinc-100 text-gray-700 hover:bg-red-50 hover:text-red-700'}`}
                            >
                                <Icons.X size={12} />
                                <span>取消</span>
                            </button>
                        )}
                        {isFinished && (
                            <button
                                onClick={() => setBatchGenProgress(null)}
                                className={`flex-1 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg text-[12px] font-medium transition-colors ${isDark ? 'bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]' : 'bg-zinc-100 text-gray-700 hover:bg-zinc-200'}`}
                            >
                                <Icons.X size={12} />
                                <span>关闭</span>
                            </button>
                        )}
                    </div>
                </div>
            );
        })()}

        <ExportImportModal

            isOpen={isExportImportOpen}

            onClose={() => setIsExportImportOpen(false)}

            isDark={isDark}

            projectName={projectName}

            onProjectNameChange={setProjectName}

            nodes={nodes}

            connections={connections}

            transform={transform}

            onImport={handleImportWorkflow}

        />



        <Sidebar 

          onClearCanvas={handleClearCanvas}

          onImportToLibrary={handleTriggerLibraryImport}

          onOpenExportImport={() => setIsExportImportOpen(true)}

          nodes={[...nodes, ...deletedNodes]}

          onPreviewMedia={handleHistoryPreview}

          onAddAssetToCanvas={handleAddAssetToCanvas}

          isDark={isDark}

          onToggleTheme={() => toggleTheme(!isDark)}

          onOpenSettings={() => setIsSettingsOpen(true)}

          onOpenCanvasManager={handleOpenCanvasManager}

        />

        <CanvasManagerModal

          isOpen={isCanvasManagerOpen}

          isDark={isDark}

          canClose={!!currentWorkspaceId}

          currentWorkspaceId={currentWorkspaceId}

          onClose={handleCloseCanvasManager}

          onCreate={handleCreateWorkspace}

          onOpen={handleOpenWorkspace}

          onDeleteCurrent={handleDeleteCurrentWorkspace}

          onRenameCurrent={handleRenameCurrentWorkspace}

          refreshToken={canvasManagerRefreshToken}

        />

        <input type="file" ref={workflowInputRef} hidden accept=".aistudio-flow,.json" onChange={handleLoadWorkflow} />

        <input type="file" ref={assetInputRef} hidden accept="image/*,video/*" onChange={handleImportAsset} />

        <input type="file" ref={libraryImportRef} hidden multiple accept="image/*" onChange={handleLibraryImportFiles} />

        <input type="file" ref={replaceImageRef} hidden accept="image/*" onChange={handleReplaceImage} />

        <div 

            ref={containerRef}

            className={`flex-1 w-full h-full relative grid-pattern select-none ${dragMode === 'PAN' ? 'cursor-grabbing' : 'cursor-grab'}`}

            style={{ 

                backgroundColor: canvasBg,

                '--grid-color': isDark ? '#27272a' : '#E4E4E7'

            } as React.CSSProperties}

            onWheel={handleWheel}

            onMouseDown={handleMouseDown}

            onMouseMove={handleMouseMove}

            onMouseUp={handleMouseUp}

            onContextMenu={handleCanvasContextMenu}

            onDragOver={handleDragOver}

            onDrop={handleDrop}

        >

            <div className="absolute origin-top-left will-change-transform" style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})` }}>

                {/* Connection Lines - Rendered as absolute positioned divs with SVG */}

                {connections.map(conn => {

                    const source = nodes.find(n => n.id === conn.sourceId);

                    const target = nodes.find(n => n.id === conn.targetId);

                    if (!source || !target) return null;

                    

                    // 源节点右侧输出端口位置

                    const sx = source.x + source.width;

                    const sy = source.y + source.height / 2;

                    // 目标节点左侧输入端口位置

                    const tx = target.x;

                    const ty = target.y + target.height / 2;

                    

                    // 计算贝塞尔曲线控制点

                    const dist = Math.abs(tx - sx);

                    const cp = Math.max(50, dist * 0.4);

                    

                    // 计算SVG边界

                    const minX = Math.min(sx, tx) - cp - 20;

                    const minY = Math.min(sy, ty) - 20;

                    const maxX = Math.max(sx, tx) + cp + 20;

                    const maxY = Math.max(sy, ty) + 20;

                    const svgWidth = maxX - minX;

                    const svgHeight = maxY - minY;

                    

                    // 相对于SVG的坐标

                    const relSx = sx - minX;

                    const relSy = sy - minY;

                    const relTx = tx - minX;

                    const relTy = ty - minY;

                    

                    const d = `M ${relSx} ${relSy} C ${relSx + cp} ${relSy}, ${relTx - cp} ${relTy}, ${relTx} ${relTy}`;

                    const isSelected = selectedConnectionId === conn.id;

                    

                    // 连接线颜色

                    const lineColor = isSelected ? "#3b82f6" : (isDark ? "#6b7280" : "#9ca3af");

                    

                    // 计算贝塞尔曲线上 t=0.5 的实际中点位置

                    const t = 0.5;

                    const p0x = relSx, p0y = relSy;

                    const p1x = relSx + cp, p1y = relSy;

                    const p2x = relTx - cp, p2y = relTy;

                    const p3x = relTx, p3y = relTy;

                    const midX = Math.pow(1-t,3)*p0x + 3*Math.pow(1-t,2)*t*p1x + 3*(1-t)*Math.pow(t,2)*p2x + Math.pow(t,3)*p3x;

                    const midY = Math.pow(1-t,3)*p0y + 3*Math.pow(1-t,2)*t*p1y + 3*(1-t)*Math.pow(t,2)*p2y + Math.pow(t,3)*p3y;

                    

                    return (

                        <svg 

                            key={conn.id}

                            className="absolute"

                            style={{ 

                                left: minX, 

                                top: minY, 

                                width: svgWidth, 

                                height: svgHeight,

                                zIndex: isSelected ? 20 : 5,

                                overflow: 'visible',

                                pointerEvents: 'none'

                            }}

                        >

                            {/* 点击区域 */}

                            <path 

                                d={d} 

                                stroke="transparent" 

                                strokeWidth={16} 

                                fill="none" 

                                style={{ pointerEvents: 'stroke', cursor: 'pointer' }}

                                onClick={(e) => { e.stopPropagation(); setSelectedConnectionId(conn.id); }}

                            />

                            {/* 主连接线 - 实线 */}

                            <path 

                                d={d} 

                                stroke={lineColor}

                                strokeWidth={isSelected ? 3 : 2} 

                                fill="none" 

                                strokeLinecap="round"

                                style={{ pointerEvents: 'none' }}

                            />

                            {/* 选中时的发光效果 */}

                            {isSelected && (

                                <path 

                                    d={d} 

                                    stroke="#3b82f6"

                                    strokeWidth={6} 

                                    fill="none" 

                                    strokeLinecap="round"

                                    opacity={0.3}

                                    style={{ pointerEvents: 'none' }}

                                />

                            )}

                            {/* 删除按钮 - 使用纯 SVG 实现 */}

                            {isSelected && (

                                <g 

                                    style={{ pointerEvents: 'auto', cursor: 'pointer' }}

                                    onClick={(e) => { e.stopPropagation(); removeConnection(conn.id); }}

                                    onMouseDown={(e) => e.stopPropagation()}

                                >

                                    {/* 按钮背景 */}

                                    <circle 

                                        cx={midX} 

                                        cy={midY} 

                                        r={10}

                                        fill={isDark ? "#27272a" : "#ffffff"}

                                        stroke={isDark ? "#52525b" : "#d1d5db"}

                                        strokeWidth={1}

                                        className="hover:stroke-red-500"

                                    />

                                    {/* X 图标 */}

                                    <line 

                                        x1={midX - 4} y1={midY - 4} 

                                        x2={midX + 4} y2={midY + 4} 

                                        stroke={isDark ? "#a1a1aa" : "#6b7280"}

                                        strokeWidth={2}

                                        strokeLinecap="round"

                                        className="hover:stroke-red-500"

                                    />

                                    <line 

                                        x1={midX + 4} y1={midY - 4} 

                                        x2={midX - 4} y2={midY + 4} 

                                        stroke={isDark ? "#a1a1aa" : "#6b7280"}

                                        strokeWidth={2}

                                        strokeLinecap="round"

                                        className="hover:stroke-red-500"

                                    />

                                </g>

                            )}

                        </svg>

                    );

                })}

                

                {/* 拖拽连接预览线 */}

                {dragMode === 'CONNECT' && connectionStartRef.current && tempConnection && (() => {

                    const sourceNode = nodes.find(n => n.id === connectionStartRef.current?.nodeId);

                    if (!sourceNode) return null;

                    

                    const sx = sourceNode.x + sourceNode.width;

                    const sy = sourceNode.y + sourceNode.height / 2;

                    const tx = tempConnection.x;

                    const ty = tempConnection.y;

                    

                    const dist = Math.abs(tx - sx);

                    const cp = Math.max(30, dist * 0.3);

                    

                    const minX = Math.min(sx, tx) - cp - 20;

                    const minY = Math.min(sy, ty) - 20;

                    const maxX = Math.max(sx, tx) + cp + 20;

                    const maxY = Math.max(sy, ty) + 20;

                    

                    const relSx = sx - minX;

                    const relSy = sy - minY;

                    const relTx = tx - minX;

                    const relTy = ty - minY;

                    

                    const d = `M ${relSx} ${relSy} C ${relSx + cp} ${relSy}, ${relTx - cp} ${relTy}, ${relTx} ${relTy}`;

                    

                    return (

                        <svg 

                            className="absolute pointer-events-none"

                            style={{ 

                                left: minX, 

                                top: minY, 

                                width: maxX - minX, 

                                height: maxY - minY,

                                zIndex: 100,

                                overflow: 'visible'

                            }}

                        >

                            {/* 虚线预览 */}

                            <path 

                                d={d} 

                                stroke="#3b82f6" 

                                strokeWidth={2} 

                                fill="none" 

                                strokeDasharray="6,4" 

                                strokeLinecap="round"

                            />

                            {/* 目标点指示器 */}

                            <circle 

                                cx={relTx} 

                                cy={relTy} 

                                r={5} 

                                fill="#3b82f6"

                            />

                        </svg>

                    );

                })()}

                {nodes.map(node => (

                    <BaseNode

                        key={node.id}

                        data={node}

                        selected={selectedNodeIds.has(node.id)}

                        onMouseDown={(e) => handleNodeMouseDown(e, node.id)}

                        onContextMenu={(e) => handleNodeContextMenu(e, node.id, node.type)}

                        onConnectStart={(e, type) => handleConnectStart(e, node.id, type)}

                        onPortMouseUp={handlePortMouseUp}

                        onResizeStart={(e) => handleResizeStart(e, node.id)}

                        scale={transform.k}

                        isDark={isDark}

                    >

                        <NodeContent 

                            data={node} 

                            updateData={updateNodeData} 

                            onGenerate={handleGenerate}

                            onPanorama={handleGeneratePanorama}

                            onNineGrid={handleGenerateNineGrid}

                            selected={selectedNodeIds.has(node.id)}

                            showControls={selectedNodeIds.size === 1}

                            inputs={getInputImages(node.id)}

                            upstreamText={upstreamTextMap[node.id]}

                            storyboardUpstream={storyboardUpstreamMap[node.id]}


                            onMaximize={handleMaximize}

                            onDownload={handleDownload}

                            onUpload={triggerReplaceImage}

                            onAddToAssetLibrary={handleAddToAssetLibrary}

                            onSplitImageGrid={handleSplitImageGrid}

                            isSelecting={dragMode === 'SELECT'}

                            onDelete={deleteNode}

                            isDark={isDark}

                            canvasScale={transform.k}

                        />

                    </BaseNode>

                ))}

            </div>

            {selectionBox && (
                <div
                    className={`fixed pointer-events-none z-50 rounded-md ${
                        dragMode === 'SELECT'
                            ? 'border border-cyan-500/60 bg-cyan-500/10'
                            : 'border-2 border-dashed border-blue-400/80 bg-blue-400/10 shadow-[0_0_0_3px_rgba(96,165,250,0.15)]'
                    }`}
                    style={{
                        left: containerRef.current!.getBoundingClientRect().left + selectionBox.x,
                        top: containerRef.current!.getBoundingClientRect().top + selectionBox.y,
                        width: selectionBox.w,
                        height: selectionBox.h,
                    }}
                />
            )}

            {/* 持久化选区右上角操作浮条 —— 仅多选 ≥2 个视频节点时显示 */}
            {(() => {
                if (!displaySelectionBox || dragMode === 'SELECT' || selectedNodeIds.size === 0) return null;
                const orderedIds = Array.from(selectedNodeIds);
                const videoNodes = orderedIds
                    .map(id => nodes.find(n => n.id === id))
                    .filter((n): n is NodeData => !!n && !!n.videoSrc);
                if (videoNodes.length < 2) return null;
                const videoIdSet = new Set(videoNodes.map(n => n.id));
                return (
                <div
                    className="surface-chip fixed z-[60] flex items-center gap-0.5 px-1.5 py-1 rounded-xl pointer-events-auto animate-in fade-in zoom-in-95 duration-200 ease-organic"
                    style={{
                        left: containerRef.current!.getBoundingClientRect().left + displaySelectionBox.x + displaySelectionBox.w + 8,
                        top: containerRef.current!.getBoundingClientRect().top + displaySelectionBox.y,
                    }}
                >
                    <span className="text-[11px] text-zinc-300 px-2 py-1 font-medium tabular-nums">已选 {selectedNodeIds.size}</span>
                    <span className="w-px h-4 bg-white/10 mx-0.5" />
                    <button
                        className="press inline-flex h-7 items-center gap-1.5 px-2.5 rounded-lg text-[11px] font-medium text-purple-300 hover:bg-purple-500/20 hover:text-purple-200 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={`按点击顺序拼接 ${videoNodes.length} 段视频为一个长视频（在本机用 ffmpeg）`}
                        disabled={isMergingVideos}
                        onClick={async () => {
                            const api = (window as any).electronAPI;
                            if (!api?.concatVideos) {
                                window.alert('视频合并仅在 Electron 桌面端可用');
                                return;
                            }
                            const urls = videoNodes.map(n => n.videoSrc!);
                            setIsMergingVideos(true);
                            try {
                                console.log('[Merge Videos] 顺序:', videoNodes.map(n => n.title));
                                console.log('[Merge Videos] urls:', urls);
                                const res = await api.concatVideos({ urls });
                                if (!res?.ok) {
                                    console.error('[Merge Videos] failed:', res?.error);
                                    window.alert(`合并失败：${res?.error || '未知错误'}`);
                                    return;
                                }
                                // 用自定义 protocol（tide-media://）让 video 元素能加载本地文件，绕开 Electron 的 file:// 拦截
                                const fileUrl = 'tide-media:///' + String(res.outputPath).replace(/\\/g, '/');
                                console.log('[Merge Videos] outputPath:', res.outputPath, '→', fileUrl);
                                const rightMost = videoNodes.reduce((acc, n) => Math.max(acc, n.x + n.width), -Infinity);
                                const top = videoNodes[0].y;
                                const baseW = videoNodes[0].width;
                                const baseH = videoNodes[0].height;
                                pushHistory();
                                addNode(NodeType.ORIGINAL_VIDEO, rightMost + 40, top, {
                                    videoSrc: fileUrl,
                                    title: `合并_${videoNodes.length}段`,
                                    width: baseW,
                                    height: baseH,
                                });
                            } catch (e: any) {
                                console.error('[Merge Videos] exception:', e);
                                window.alert(`合并异常：${e?.message || e}`);
                            } finally {
                                setIsMergingVideos(false);
                            }
                        }}
                    >
                        <Icons.Film size={12} />
                        <span>{isMergingVideos ? '合并中…' : `合并视频 ×${videoNodes.length}`}</span>
                    </button>
                    <button
                        className="press inline-flex h-7 items-center gap-1.5 px-2.5 rounded-lg text-[11px] font-medium text-blue-300 hover:bg-blue-500/20 hover:text-blue-200 transition-colors duration-150"
                        title={`把选中的 ${videoNodes.length} 个视频节点统一为同一尺寸（取众数作为模板）`}
                        onClick={() => {
                            const sizeCount = new Map<string, number>();
                            videoNodes.forEach(n => {
                                const k = `${n.width}x${n.height}`;
                                sizeCount.set(k, (sizeCount.get(k) || 0) + 1);
                            });
                            let majorKey = '';
                            let majorCount = -1;
                            sizeCount.forEach((v, k) => { if (v > majorCount) { majorCount = v; majorKey = k; } });
                            const [mw, mh] = majorKey.split('x').map(Number);
                            if (!Number.isFinite(mw) || !Number.isFinite(mh) || mw <= 0 || mh <= 0) {
                                console.warn(`[Unify Size] invalid majorKey="${majorKey}" → skip`);
                                return;
                            }
                            // 所有视频已经是同一尺寸时跳过：避免空操作污染撤销栈
                            if (videoNodes.every(n => n.width === mw && n.height === mh)) {
                                console.log('[Unify Size] all already match', majorKey);
                                return;
                            }
                            pushHistory();
                            console.log(`[Unify Size] ${majorKey} (occurs ${majorCount} times among ${videoNodes.length} video nodes)`);
                            setNodes(prev => prev.map(n => videoIdSet.has(n.id) ? { ...n, width: mw, height: mh } : n));
                        }}
                    >
                        <Icons.Crop size={12} />
                        <span>统一尺寸</span>
                    </button>
                    <span className="w-px h-4 bg-white/10 mx-0.5" />
                    <button
                        className="press inline-flex h-7 items-center gap-1.5 px-2.5 rounded-lg text-[11px] font-medium text-red-300 hover:bg-red-500/20 hover:text-red-200 transition-colors duration-150"
                        title="删除选中节点 (Delete)"
                        onClick={() => {
                            pushHistory();
                            const toDel = nodes.filter(n => selectedNodeIds.has(n.id));
                            const withContent = toDel.filter(n => n.imageSrc || n.videoSrc);
                            if (withContent.length > 0) setDeletedNodes(prev => [...prev, ...withContent]);
                            setNodes(prev => prev.filter(n => !selectedNodeIds.has(n.id)));
                            setConnections(prev => prev.filter(c => !selectedNodeIds.has(c.sourceId) && !selectedNodeIds.has(c.targetId)));
                            setSelectedNodeIds(new Set());
                            setSelectionBox(null);
                        }}
                    >
                        <Icons.Trash2 size={12} />
                        <span>删除</span>
                    </button>
                    <button
                        className="press inline-flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-zinc-200 transition-colors duration-150"
                        title="取消选择 (Esc)"
                        onClick={() => { setSelectedNodeIds(new Set()); setSelectionBox(null); }}
                    >
                        <Icons.X size={12} />
                    </button>
                </div>
                );
            })()}

            

            {/* Top Left Project Name */}

            <div className="absolute top-4 left-4 z-50">

                <div className="surface-chip flex items-center gap-2.5 px-2 py-1.5 rounded-2xl transition-all duration-300 ease-organic">

                    {/* Logo */}

                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center ring-1 ring-inset ${

                        isDark ? 'bg-gradient-to-br from-blue-500/25 to-blue-500/10 text-blue-300 ring-blue-400/20' : 'bg-gradient-to-br from-blue-100 to-blue-50 text-blue-600 ring-blue-200/60'

                    }`}>

                        <Icons.Sparkles size={16} />

                    </div>

                    

                    {/* Project Name */}

                    {isEditingProjectName ? (

                        <input

                            type="text"

                            value={projectName}

                            onChange={(e) => setProjectName(e.target.value)}

                            onBlur={() => setIsEditingProjectName(false)}

                            onKeyDown={(e) => {

                                if (e.key === 'Enter') setIsEditingProjectName(false);

                                if (e.key === 'Escape') setIsEditingProjectName(false);

                            }}

                            autoFocus

                            className={`w-36 px-2 py-1 rounded-lg text-sm font-medium border-0 outline-none bg-transparent ${

                                isDark ? 'text-white' : 'text-gray-900'

                            }`}

                            placeholder="项目名称..."

                        />

                    ) : (

                        <button

                            onClick={() => setIsEditingProjectName(true)}

                            className={`text-sm font-medium max-w-[140px] truncate transition-colors ${

                                isDark ? 'text-gray-200 hover:text-white' : 'text-gray-800 hover:text-black'

                            }`}

                        >

                            {projectName}

                        </button>

                    )}

                </div>

            </div>



            {/* Bottom Left Canvas Controls */}

            <div className="absolute bottom-4 left-4 z-50 flex flex-col gap-2 items-start">

                {showMinimap && (

                    <MiniMap

                        nodes={nodes}

                        transform={transform}

                        viewportSize={viewportSize}

                        onNavigate={handleNavigateTo}

                        isDark={isDark}

                    />

                )}

                <div className="surface-chip flex items-center gap-0.5 px-1.5 py-1 rounded-2xl transition-all ease-organic">



                    {/* 整理画布 */}

                    <button

                        type="button"

                        title="整理画布"

                        onClick={handleArrangeCanvas}

                        className={`p-2 rounded-xl transition-all ${

                            isDark ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'

                        }`}

                    >

                        <Icons.LayoutGrid size={16} />

                    </button>



                    {/* 画布小地图 */}

                    <button

                        type="button"

                        title="画布小地图"

                        onClick={() => setShowMinimap(v => !v)}

                        className={`p-2 rounded-xl transition-all ${

                            showMinimap

                                ? (isDark ? 'bg-white/10 text-white' : 'bg-gray-900/10 text-gray-900')

                                : (isDark ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100')

                        }`}

                    >

                        <Icons.MapPin size={16} />

                    </button>



                    {/* 网格吸附 */}

                    <button

                        type="button"

                        title={`网格吸附（${gridSnap ? '已开启' : '已关闭'}）`}

                        onClick={() => setGridSnap(v => !v)}

                        className={`p-2 rounded-xl transition-all ${

                            gridSnap

                                ? (isDark ? 'bg-white/10 text-white' : 'bg-gray-900/10 text-gray-900')

                                : (isDark ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100')

                        }`}

                    >

                        <Icons.Magnet size={16} />

                    </button>



                    <div className={`w-px h-5 mx-1 ${isDark ? 'bg-zinc-700' : 'bg-gray-200'}`} />



                    {/* 缩小 */}

                    <button

                        type="button"

                        title="缩小"

                        onClick={() => handleZoomBy(-ZOOM_STEP)}

                        disabled={transform.k <= ZOOM_MIN + 1e-6}

                        className={`p-2 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed ${

                            isDark ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'

                        }`}

                    >

                        <Icons.Minus size={16} />

                    </button>



                    {/* 缩放百分比 */}

                    <span className={`px-2 text-xs font-medium tabular-nums select-none min-w-[42px] text-center ${

                        isDark ? 'text-gray-300' : 'text-gray-700'

                    }`}>

                        {Math.round((transform.k / ZOOM_BASE_SCALE) * 100)}%

                    </span>



                    {/* 放大 */}

                    <button

                        type="button"

                        title="放大"

                        onClick={() => handleZoomBy(ZOOM_STEP)}

                        disabled={transform.k >= ZOOM_MAX - 1e-6}

                        className={`p-2 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed ${

                            isDark ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'

                        }`}

                    >

                        <Icons.Plus size={16} />

                    </button>

                </div>

            </div>



            {renderContextMenu()}

            {renderQuickAddMenu()}

            {renderNewWorkflowDialog()}

            {renderClearCanvasDialog()}

            {previewMedia && (

                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-lg animate-in fade-in duration-200 ease-organic" onClick={() => setPreviewMedia(null)}>

                    <div className="relative max-w-[92vw] max-h-[92vh] bg-black/40 rounded-2xl shadow-2xl overflow-hidden ring-1 ring-white/10 animate-in zoom-in-95 fade-in duration-300 ease-organic" onClick={(e) => e.stopPropagation()}>

                         <button className="press absolute top-3 right-3 bg-black/55 backdrop-blur-md text-white p-2 rounded-full hover:bg-red-500 transition-colors duration-150 z-10 ring-1 ring-inset ring-white/15 shadow-md" onClick={() => setPreviewMedia(null)}><Icons.X size={20} /></button>

                         {previewMedia.type === 'video' ? <video src={previewMedia.url} controls autoPlay className="max-w-full max-h-[92vh]" /> : <img src={previewMedia.url} alt="Preview" className="max-w-full max-h-[92vh] object-contain" />}

                    </div>

                </div>

            )}

        </div>

    </div>

  );

};



export default App;

