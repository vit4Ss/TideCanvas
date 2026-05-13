import React, { useMemo, useRef, useCallback } from 'react';
import { NodeData, NodeType, CanvasTransform } from '../types';

interface MiniMapProps {
  nodes: NodeData[];
  transform: CanvasTransform;
  viewportSize: { width: number; height: number };
  onNavigate: (worldX: number, worldY: number) => void;
  isDark: boolean;
}

const MINI_WIDTH = 220;
const MINI_HEIGHT = 150;
const PADDING = 12;

const nodeColor = (type: NodeType, isDark: boolean) => {
  switch (type) {
    case NodeType.ORIGINAL_IMAGE:
      return isDark ? '#10b981' : '#34d399';
    case NodeType.ORIGINAL_VIDEO:
      return isDark ? '#f97316' : '#fb923c';
    case NodeType.PANORAMA_360:
      return isDark ? '#38bdf8' : '#0ea5e9';
    case NodeType.TEXT_TO_IMAGE:
      return isDark ? '#06b6d4' : '#22d3ee';
    case NodeType.TEXT_TO_VIDEO:
      return isDark ? '#a855f7' : '#c084fc';
    case NodeType.CREATIVE_DESC:
      return isDark ? '#f59e0b' : '#fbbf24';
    default:
      return isDark ? '#71717a' : '#a1a1aa';
  }
};

const MiniMap: React.FC<MiniMapProps> = ({ nodes, transform, viewportSize, onNavigate, isDark }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);

  // Compute world-space bounding box that includes all nodes AND the visible viewport
  const bounds = useMemo(() => {
    const viewMinX = -transform.x / transform.k;
    const viewMinY = -transform.y / transform.k;
    const viewMaxX = viewMinX + viewportSize.width / transform.k;
    const viewMaxY = viewMinY + viewportSize.height / transform.k;

    let minX = viewMinX;
    let minY = viewMinY;
    let maxX = viewMaxX;
    let maxY = viewMaxY;

    nodes.forEach(n => {
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x + n.width > maxX) maxX = n.x + n.width;
      if (n.y + n.height > maxY) maxY = n.y + n.height;
    });

    // Add small world-space padding so things never touch edges
    const pad = 200;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;

    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);

    // Fit into available drawable area
    const drawW = MINI_WIDTH - PADDING * 2;
    const drawH = MINI_HEIGHT - PADDING * 2;
    const scale = Math.min(drawW / w, drawH / h);

    // Center the content within the drawable area
    const offsetX = PADDING + (drawW - w * scale) / 2;
    const offsetY = PADDING + (drawH - h * scale) / 2;

    return { minX, minY, w, h, scale, offsetX, offsetY };
  }, [nodes, transform, viewportSize]);

  const worldToMini = useCallback(
    (wx: number, wy: number) => ({
      x: bounds.offsetX + (wx - bounds.minX) * bounds.scale,
      y: bounds.offsetY + (wy - bounds.minY) * bounds.scale,
    }),
    [bounds]
  );

  const miniToWorld = useCallback(
    (mx: number, my: number) => ({
      x: bounds.minX + (mx - bounds.offsetX) / bounds.scale,
      y: bounds.minY + (my - bounds.offsetY) / bounds.scale,
    }),
    [bounds]
  );

  const handleMouseEvent = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * MINI_WIDTH;
      const my = ((e.clientY - rect.top) / rect.height) * MINI_HEIGHT;
      const world = miniToWorld(mx, my);
      onNavigate(world.x, world.y);
    },
    [miniToWorld, onNavigate]
  );

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    e.stopPropagation();
    e.preventDefault();
    draggingRef.current = true;
    handleMouseEvent(e);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!draggingRef.current) return;
    e.stopPropagation();
    handleMouseEvent(e);
  };

  const handleMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
    draggingRef.current = false;
    e.stopPropagation();
  };

  const handleMouseLeave = () => {
    draggingRef.current = false;
  };

  // Viewport rectangle in mini coordinates
  const viewMinX = -transform.x / transform.k;
  const viewMinY = -transform.y / transform.k;
  const viewW = viewportSize.width / transform.k;
  const viewH = viewportSize.height / transform.k;
  const vp = worldToMini(viewMinX, viewMinY);
  const vpW = viewW * bounds.scale;
  const vpH = viewH * bounds.scale;

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      className={`rounded-2xl overflow-hidden backdrop-blur-xl border shadow-lg ${
        isDark
          ? 'bg-[#18181b]/90 border-zinc-800'
          : 'bg-white/95 border-gray-200'
      }`}
      style={{ width: MINI_WIDTH, height: MINI_HEIGHT }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${MINI_WIDTH} ${MINI_HEIGHT}`}
        width={MINI_WIDTH}
        height={MINI_HEIGHT}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        className="cursor-pointer block"
      >
        <rect
          x={0}
          y={0}
          width={MINI_WIDTH}
          height={MINI_HEIGHT}
          fill={isDark ? '#0B0C0E' : '#F5F7FA'}
        />
        {nodes.map(n => {
          const tl = worldToMini(n.x, n.y);
          const w = Math.max(2, n.width * bounds.scale);
          const h = Math.max(2, n.height * bounds.scale);
          return (
            <rect
              key={n.id}
              x={tl.x}
              y={tl.y}
              width={w}
              height={h}
              rx={1.5}
              fill={nodeColor(n.type, isDark)}
              opacity={0.85}
            />
          );
        })}
        {/* Viewport rectangle */}
        <rect
          x={vp.x}
          y={vp.y}
          width={vpW}
          height={vpH}
          fill={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}
          stroke={isDark ? '#e4e4e7' : '#27272a'}
          strokeWidth={1}
          rx={2}
          pointerEvents="none"
        />
      </svg>
    </div>
  );
};

export default MiniMap;
