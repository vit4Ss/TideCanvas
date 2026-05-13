import React, { useEffect, useRef, useState } from 'react';
import { NodeData } from '../../types';
import { Icons } from '../Icons';

interface PanoramaNodeProps {
  data: NodeData;
  selected?: boolean;
  showControls?: boolean;
  onMaximize?: (id: string) => void;
  onDownload?: (id: string) => void;
  isDark?: boolean;
  isSelecting?: boolean;
  canvasScale?: number;
}

const THREE_MODULE_URL = 'https://cdn.jsdelivr.net/npm/three@0.183.2/build/three.module.js';

let threeModulePromise: Promise<any> | null = null;

const loadThree = () => {
  if (!threeModulePromise) {
    threeModulePromise = import(/* @vite-ignore */ THREE_MODULE_URL);
  }
  return threeModulePromise;
};

export const PanoramaNode: React.FC<PanoramaNodeProps> = ({
  data,
  selected,
  showControls,
  onMaximize,
  onDownload,
  isDark = true,
  isSelecting,
  canvasScale = 1,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [hasError, setHasError] = useState(false);
  const textureSrc = data.imageSrc;
  const isSelectedAndStable = selected && !isSelecting;
  const titleScale = 1 / Math.max(canvasScale, 0.1);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !textureSrc) {
      setHasError(!textureSrc);
      return;
    }

    let cancelled = false;
    let cleanupScene: (() => void) | null = null;

    setIsReady(false);
    setHasError(false);

    loadThree()
      .then((THREE) => {
        if (cancelled || !mountRef.current) return;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, 1, 1, 1100);
        const cameraTarget = new THREE.Vector3(0, 0, 0);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        mount.appendChild(renderer.domElement);

        const geometry = new THREE.SphereGeometry(500, 96, 48);
        geometry.scale(-1, 1, 1);
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const sphere = new THREE.Mesh(geometry, material);
        scene.add(sphere);

        const textureLoader = new THREE.TextureLoader();
        textureLoader.setCrossOrigin('anonymous');
        const texture = textureLoader.load(
          textureSrc,
          () => {
            if (cancelled) return;
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.generateMipmaps = false;
            material.map = texture;
            material.needsUpdate = true;
            setIsReady(true);
          },
          undefined,
          () => {
            if (!cancelled) setHasError(true);
          }
        );

        let lon = 0;
        let lat = 0;
        let isPointerDown = false;
        let pointerDownX = 0;
        let pointerDownY = 0;
        let pointerDownLon = 0;
        let pointerDownLat = 0;
        let fov = 75;

        const resize = () => {
          const width = Math.max(1, mount.clientWidth);
          const height = Math.max(1, mount.clientHeight);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height, false);
        };

        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(mount);
        resize();

        const updateCamera = () => {
          lat = Math.max(-85, Math.min(85, lat));
          const phi = THREE.MathUtils.degToRad(90 - lat);
          const theta = THREE.MathUtils.degToRad(lon);
          cameraTarget.x = 500 * Math.sin(phi) * Math.cos(theta);
          cameraTarget.y = 500 * Math.cos(phi);
          cameraTarget.z = 500 * Math.sin(phi) * Math.sin(theta);
          camera.lookAt(cameraTarget);
        };

        const animate = () => {
          updateCamera();
          renderer.render(scene, camera);
          frameRef.current = requestAnimationFrame(animate);
        };

        const handlePointerDown = (event: PointerEvent) => {
          event.stopPropagation();
          isPointerDown = true;
          pointerDownX = event.clientX;
          pointerDownY = event.clientY;
          pointerDownLon = lon;
          pointerDownLat = lat;
          renderer.domElement.setPointerCapture(event.pointerId);
          renderer.domElement.style.cursor = 'grabbing';
        };

        const handlePointerMove = (event: PointerEvent) => {
          if (!isPointerDown) return;
          event.stopPropagation();
          lon = (pointerDownX - event.clientX) * 0.12 + pointerDownLon;
          lat = (event.clientY - pointerDownY) * 0.12 + pointerDownLat;
        };

        const handlePointerUp = (event: PointerEvent) => {
          if (!isPointerDown) return;
          event.stopPropagation();
          isPointerDown = false;
          renderer.domElement.releasePointerCapture(event.pointerId);
          renderer.domElement.style.cursor = 'grab';
        };

        const handleWheel = (event: WheelEvent) => {
          event.stopPropagation();
          event.preventDefault();
          fov = Math.max(35, Math.min(95, fov + event.deltaY * 0.03));
          camera.fov = fov;
          camera.updateProjectionMatrix();
        };

        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
        renderer.domElement.style.display = 'block';
        renderer.domElement.style.cursor = 'grab';
        renderer.domElement.addEventListener('pointerdown', handlePointerDown);
        renderer.domElement.addEventListener('pointermove', handlePointerMove);
        renderer.domElement.addEventListener('pointerup', handlePointerUp);
        renderer.domElement.addEventListener('pointercancel', handlePointerUp);
        renderer.domElement.addEventListener('wheel', handleWheel, { passive: false });
        animate();

        cleanupScene = () => {
          if (frameRef.current) cancelAnimationFrame(frameRef.current);
          resizeObserver.disconnect();
          renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
          renderer.domElement.removeEventListener('pointermove', handlePointerMove);
          renderer.domElement.removeEventListener('pointerup', handlePointerUp);
          renderer.domElement.removeEventListener('pointercancel', handlePointerUp);
          renderer.domElement.removeEventListener('wheel', handleWheel);
          texture.dispose();
          material.dispose();
          geometry.dispose();
          renderer.dispose();
          if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
        };
      })
      .catch(() => {
        if (!cancelled) setHasError(true);
      });

    return () => {
      cancelled = true;
      cleanupScene?.();
    };
  }, [textureSrc]);

  const containerBg = isDark ? 'bg-[#0f1115]' : 'bg-white';
  const containerBorder = selected
    ? (isDark ? 'border-zinc-500 ring-1 ring-zinc-600/40' : 'border-gray-300 ring-1 ring-gray-200/60')
    : (isDark ? 'border-zinc-700/50' : 'border-gray-200');
  const chipBtn = isDark
    ? 'bg-zinc-800/80 hover:bg-zinc-700 border-zinc-700 text-zinc-200'
    : 'bg-white hover:bg-gray-50 border-gray-200 text-gray-700 shadow-sm';
  const ghostIconBtn = isDark
    ? 'text-zinc-400 hover:text-white hover:bg-white/10 hover:shadow-md hover:shadow-black/20'
    : 'text-gray-500 hover:text-gray-900 hover:bg-white hover:shadow-md hover:shadow-gray-200/70';
  const titleColor = isDark ? 'text-zinc-200' : 'text-gray-700';

  return (
    <>
      {isSelectedAndStable && showControls && (
        <div
          className={`absolute left-1/2 z-[60] flex items-center gap-1 rounded-2xl border px-1.5 py-1 shadow-xl pointer-events-auto whitespace-nowrap ${chipBtn}`}
          style={{ top: -48 * titleScale, transform: `translateX(-50%) scale(${titleScale})`, transformOrigin: 'bottom center' }}
          onMouseDown={(e) => e.stopPropagation()}
        >
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

      {isSelectedAndStable && (
        <div
          className={`absolute left-0 z-[60] pointer-events-auto flex h-7 items-center gap-1.5 rounded-lg px-2 transition-all ${isDark ? 'bg-zinc-900/70 border border-zinc-800/80' : 'bg-white/85 border border-gray-200 shadow-sm'}`}
          style={{ top: -34 * titleScale, transform: `scale(${titleScale})`, transformOrigin: 'bottom left' }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Icons.Globe size={13} className={isDark ? 'text-sky-300' : 'text-sky-600'} />
          <span className={`max-w-[220px] truncate text-sm font-medium ${titleColor}`}>{data.title}</span>
        </div>
      )}

      <div
        className={`relative w-full h-full rounded-2xl border ${containerBorder} ${containerBg} overflow-hidden shadow-xl transition-[width,height,border-radius,box-shadow,border-color,background-color] transition-node-resize`}
        onMouseDown={(e) => {
          if (selected) e.stopPropagation();
        }}
      >
        <div ref={mountRef} className="absolute inset-0" />
        {(!isReady || hasError) && (
          <div className={`absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 ${isDark ? 'text-zinc-400 bg-[#0f1115]' : 'text-gray-500 bg-white'}`}>
            {hasError ? (
              <>
                <Icons.AlertTriangle size={28} className={isDark ? 'text-amber-300' : 'text-amber-600'} />
                <span className="text-sm font-medium">全景加载失败</span>
              </>
            ) : (
              <>
                <Icons.Loader2 size={28} className="animate-spin" />
                <span className="text-sm font-medium">加载 360 全景...</span>
              </>
            )}
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-20 bg-gradient-to-t from-black/40 to-transparent" />
        <div className="pointer-events-none absolute left-3 bottom-3 z-20 flex items-center gap-2 rounded-full bg-black/45 px-3 py-1.5 text-xs font-medium text-white/85 backdrop-blur-md">
          <Icons.MousePointer2 size={13} />
          <span>拖动查看 360°</span>
        </div>
      </div>
    </>
  );
};
