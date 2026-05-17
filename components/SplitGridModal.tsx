import React, { useEffect, useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icons } from './Icons';
import { cropImageToGrid, loadImageRobust } from '../services/imageCrop';

export interface SplitShot {
    id: number;
    content: string;
}

export interface SplitGridConfirmPayload {
    pieces: { dataUrl: string; index: number; row: number; col: number; title: string; prompt: string }[];
    rows: number;
    cols: number;
}

interface SplitGridModalProps {
    isOpen: boolean;
    sourceImageSrc: string;
    sourceTitle: string;
    shots: SplitShot[];
    presetRows?: number;
    presetCols?: number;
    onClose: () => void;
    onConfirm: (payload: SplitGridConfirmPayload) => void;
    isDark?: boolean;
}

export const SplitGridModal: React.FC<SplitGridModalProps> = ({
    isOpen, sourceImageSrc, sourceTitle, shots, presetRows, presetCols, onClose, onConfirm, isDark = true,
}) => {
    const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
    const [imgDataUrl, setImgDataUrl] = useState<string>('');
    const [rows, setRows] = useState(presetRows || 4);
    const [cols, setCols] = useState(presetCols || 8);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [hoveredCell, setHoveredCell] = useState<number | null>(null);
    const [error, setError] = useState<string>('');
    const [working, setWorking] = useState(false);
    const imageContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        setError('');
        setSelected(new Set());
        setImgDataUrl('');
        setImgSize(null);
        if (typeof presetRows === 'number') setRows(presetRows);
        if (typeof presetCols === 'number') setCols(presetCols);

        loadImageRobust(sourceImageSrc).then(img => {
            setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
            setImgDataUrl(img.src);
        }).catch(e => setError(e?.message || String(e)));
    }, [isOpen, sourceImageSrc, presetRows, presetCols]);

    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            // Ctrl/Cmd + A 全选
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
                e.preventDefault();
                setSelected(new Set(Array.from({ length: rows * cols }, (_, i) => i)));
            }
            // Ctrl/Cmd + Enter 直接确认
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && selected.size > 0) {
                e.preventDefault();
                handleConfirm();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen, onClose, rows, cols, selected.size]);

    const total = rows * cols;

    const toggleCell = (i: number) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(i)) next.delete(i); else next.add(i);
            return next;
        });
    };
    const handleSelectAll = () => setSelected(new Set(Array.from({ length: total }, (_, i) => i)));
    const handleSelectNone = () => setSelected(new Set());
    const handleInvert = () => {
        const next = new Set<number>();
        for (let i = 0; i < total; i++) if (!selected.has(i)) next.add(i);
        setSelected(next);
    };

    const handleConfirm = async () => {
        if (selected.size === 0) { setError('请至少选择一个格子'); return; }
        setError('');
        setWorking(true);
        try {
            const allPieces = await cropImageToGrid(imgDataUrl || sourceImageSrc, rows, cols);
            const picked: SplitGridConfirmPayload['pieces'] = [];
            allPieces.forEach((dataUrl, i) => {
                if (!selected.has(i)) return;
                const r = Math.floor(i / cols);
                const c = i % cols;
                const shot = shots[i];
                picked.push({
                    dataUrl, index: i, row: r, col: c,
                    title: shot ? `镜头 ${shot.id} · 高清` : `分镜 ${i + 1} · 高清`,
                    prompt: shot?.content || '',
                });
            });
            onConfirm({ pieces: picked, rows, cols });
        } catch (e: any) {
            setError(e?.message || String(e));
        } finally {
            setWorking(false);
        }
    };

    const displaySize = useMemo(() => {
        if (!imgSize) return { w: 0, h: 0 };
        const maxW = Math.min(window.innerWidth - 80, 1000);
        const maxH = Math.min(window.innerHeight - 320, 640);
        const ratio = imgSize.w / imgSize.h;
        let w = Math.min(imgSize.w, maxW);
        let h = w / ratio;
        if (h > maxH) { h = maxH; w = h * ratio; }
        return { w: Math.round(w), h: Math.round(h) };
    }, [imgSize]);

    if (!isOpen) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                className={`relative flex flex-col rounded-3xl border overflow-hidden glass-card animate-in zoom-in-95 duration-200 ${
                    isDark ? 'bg-[#0e0e0f]/95 border-white/[0.08]' : 'bg-white/95 border-zinc-200'
                }`}
                style={{ width: 'min(1180px, 95vw)', maxHeight: '94vh' }}
                onMouseDown={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className={`flex items-center justify-between px-6 py-3.5 border-b ${isDark ? 'border-white/[0.06] bg-gradient-to-r from-blue-500/[0.06] via-transparent to-transparent' : 'border-zinc-100 bg-gradient-to-r from-blue-50/40 via-transparent to-transparent'}`}>
                    <div className="flex items-center gap-3">
                        <div className={`flex items-center justify-center w-10 h-10 rounded-xl ${isDark ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-400/20' : 'bg-blue-100 text-blue-600 ring-1 ring-blue-200'}`}>
                            <Icons.Scissors size={18} />
                        </div>
                        <div>
                            <h3 className={`text-[15px] font-bold leading-tight ${isDark ? 'text-zinc-50' : 'text-gray-900'}`}>拆分网格 &amp; 生成高清</h3>
                            <p className={`text-[11px] mt-0.5 ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>
                                {sourceTitle}
                                {shots.length > 0 && (
                                    <span className={`ml-2 px-1.5 py-px rounded ${isDark ? 'bg-amber-500/15 text-amber-300' : 'bg-amber-100 text-amber-700'}`}>
                                        已匹配 {shots.length} 个镜头脚本
                                    </span>
                                )}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className={`p-2 rounded-xl transition-colors ${isDark ? 'text-zinc-400 hover:text-white hover:bg-white/[0.06]' : 'text-gray-500 hover:text-gray-900 hover:bg-zinc-100'}`}>
                        <Icons.X size={18} />
                    </button>
                </div>

                {/* Toolbar */}
                <div className={`flex items-center gap-3 px-6 py-3 border-b ${isDark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-zinc-100 bg-zinc-50/60'}`}>
                    <div className="flex items-center gap-1.5">
                        <span className={`text-[11px] uppercase tracking-wider font-bold ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>网格</span>
                        <input
                            type="number" min={1} max={20} value={rows}
                            onChange={(e) => setRows(Math.max(1, parseInt(e.target.value, 10) || 1))}
                            className={`w-14 h-8 text-center text-sm tabular-nums rounded-lg border focus:outline-none focus:ring-2 transition-all ${isDark ? 'bg-white/[0.04] border-white/[0.08] text-zinc-100 focus:ring-blue-500/30 focus:border-blue-400' : 'bg-white border-zinc-300 text-gray-900 focus:ring-blue-100 focus:border-blue-400'}`}
                        />
                        <span className={`text-sm font-bold ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>×</span>
                        <input
                            type="number" min={1} max={20} value={cols}
                            onChange={(e) => setCols(Math.max(1, parseInt(e.target.value, 10) || 1))}
                            className={`w-14 h-8 text-center text-sm tabular-nums rounded-lg border focus:outline-none focus:ring-2 transition-all ${isDark ? 'bg-white/[0.04] border-white/[0.08] text-zinc-100 focus:ring-blue-500/30 focus:border-blue-400' : 'bg-white border-zinc-300 text-gray-900 focus:ring-blue-100 focus:border-blue-400'}`}
                        />
                        <span className={`ml-2 text-[12px] tabular-nums ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>共 <b className={isDark ? 'text-zinc-200' : 'text-gray-900'}>{total}</b> 格</span>
                    </div>

                    <div className={`mx-2 h-5 w-px ${isDark ? 'bg-white/[0.06]' : 'bg-zinc-200'}`} />

                    <div className="flex items-center gap-1">
                        <button onClick={handleSelectAll} className={`px-2.5 h-8 rounded-lg text-[12px] font-medium transition-colors ${isDark ? 'text-zinc-300 hover:bg-white/[0.06]' : 'text-gray-600 hover:bg-zinc-100'}`}>
                            全选
                        </button>
                        <button onClick={handleSelectNone} className={`px-2.5 h-8 rounded-lg text-[12px] font-medium transition-colors ${isDark ? 'text-zinc-300 hover:bg-white/[0.06]' : 'text-gray-600 hover:bg-zinc-100'}`}>
                            全不选
                        </button>
                        <button onClick={handleInvert} className={`px-2.5 h-8 rounded-lg text-[12px] font-medium transition-colors ${isDark ? 'text-zinc-300 hover:bg-white/[0.06]' : 'text-gray-600 hover:bg-zinc-100'}`}>
                            反选
                        </button>
                    </div>

                    <div className="flex-1" />

                    <div className={`flex items-center gap-1 px-3 h-8 rounded-lg text-[12px] tabular-nums ${
                        selected.size > 0
                            ? (isDark ? 'bg-blue-500/15 text-blue-300 ring-1 ring-blue-400/20' : 'bg-blue-50 text-blue-700 ring-1 ring-blue-200')
                            : (isDark ? 'text-zinc-500' : 'text-gray-400')
                    }`}>
                        <Icons.Check size={13} />
                        已选 <b>{selected.size}</b> / {total}
                    </div>
                </div>

                {/* Image + Grid */}
                <div className={`flex-1 min-h-0 overflow-auto custom-scrollbar p-6 ${isDark ? 'bg-[#08080a]' : 'bg-zinc-100'}`}>
                    {error && (
                        <div className={`mb-4 max-w-3xl mx-auto px-4 py-2 rounded-lg text-[12px] flex items-center gap-2 ${isDark ? 'bg-red-500/15 text-red-300 border border-red-500/30' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                            <Icons.Info size={14} />
                            {error}
                        </div>
                    )}
                    {imgDataUrl ? (
                        <div className="flex justify-center">
                            <div
                                ref={imageContainerRef}
                                className={`relative inline-block rounded-2xl overflow-hidden ${isDark ? 'shadow-[0_24px_80px_-12px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.05)]' : 'shadow-[0_24px_80px_-12px_rgba(0,0,0,0.25)]'}`}
                                style={{ width: displaySize.w, height: displaySize.h }}
                            >
                                <img src={imgDataUrl} alt={sourceTitle} className="block w-full h-full object-cover select-none pointer-events-none" draggable={false} />

                                <div
                                    className="absolute inset-0 grid"
                                    style={{
                                        gridTemplateRows: `repeat(${rows}, 1fr)`,
                                        gridTemplateColumns: `repeat(${cols}, 1fr)`,
                                    }}
                                >
                                    {Array.from({ length: total }, (_, i) => {
                                        const isSel = selected.has(i);
                                        const isHover = hoveredCell === i;
                                        const shot = shots[i];
                                        return (
                                            <div
                                                key={i}
                                                onClick={() => toggleCell(i)}
                                                onMouseEnter={() => setHoveredCell(i)}
                                                onMouseLeave={() => setHoveredCell(prev => prev === i ? null : prev)}
                                                className={`relative cursor-pointer transition-all duration-150 ${
                                                    isSel
                                                        ? 'bg-blue-500/30'
                                                        : isHover
                                                            ? 'bg-white/10'
                                                            : 'bg-transparent'
                                                }`}
                                                style={{
                                                    boxShadow: isSel
                                                        ? 'inset 0 0 0 2px rgb(96 165 250), inset 0 0 0 4px rgba(59,130,246,0.25)'
                                                        : 'inset 0 0 0 1px rgba(255,255,255,0.18)',
                                                }}
                                            >
                                                {/* 编号 */}
                                                <div className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold backdrop-blur-sm leading-none ${
                                                    isSel ? 'bg-blue-500 text-white shadow-lg shadow-blue-900/40' : 'bg-black/60 text-white/90'
                                                }`}>
                                                    {shot ? `镜${shot.id}` : i + 1}
                                                </div>
                                                {/* 选中标记 */}
                                                {isSel && (
                                                    <div className="absolute top-1.5 right-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white shadow-lg shadow-blue-900/40 ring-2 ring-blue-400/30">
                                                        <Icons.Check size={11} strokeWidth={3} />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Hover 提示卡 */}
                                {hoveredCell !== null && shots[hoveredCell] && (
                                    <div
                                        className={`absolute z-10 px-3 py-2 rounded-lg pointer-events-none max-w-[280px] backdrop-blur-xl border shadow-2xl ${isDark ? 'bg-zinc-900/95 border-white/[0.08] text-zinc-200' : 'bg-white/95 border-zinc-200 text-gray-800'}`}
                                        style={{
                                            left: `${((hoveredCell % cols) + 0.5) * (100 / cols)}%`,
                                            top: `${(Math.floor(hoveredCell / cols) + 0.5) * (100 / rows)}%`,
                                            transform: 'translate(-50%, calc(-100% - 12px))',
                                        }}
                                    >
                                        <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>镜头 {shots[hoveredCell].id}</div>
                                        <div className="text-[11px] leading-relaxed line-clamp-4">
                                            {shots[hoveredCell].content.slice(0, 240)}
                                            {shots[hoveredCell].content.length > 240 ? '…' : ''}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className={`max-w-3xl mx-auto aspect-video flex items-center justify-center rounded-2xl ${isDark ? 'bg-zinc-900/60' : 'bg-zinc-200'}`}>
                            <div className="flex flex-col items-center gap-3">
                                <Icons.Loader2 size={28} className={`animate-spin ${isDark ? 'text-zinc-500' : 'text-gray-400'}`} />
                                <span className={`text-sm ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>图片加载中…</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className={`flex items-center justify-between gap-3 px-6 py-3 border-t ${isDark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-zinc-100 bg-zinc-50/60'}`}>
                    <div className={`flex items-center gap-2 text-[11px] ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>
                        <kbd className={`px-1.5 py-0.5 rounded border text-[10px] ${isDark ? 'border-zinc-700 bg-white/5' : 'border-gray-200 bg-white'}`}>⌘A</kbd>
                        <span>全选</span>
                        <span className={`mx-1 ${isDark ? 'text-zinc-700' : 'text-zinc-300'}`}>·</span>
                        <kbd className={`px-1.5 py-0.5 rounded border text-[10px] ${isDark ? 'border-zinc-700 bg-white/5' : 'border-gray-200 bg-white'}`}>⌘↵</kbd>
                        <span>确认</span>
                        <span className={`mx-1 ${isDark ? 'text-zinc-700' : 'text-zinc-300'}`}>·</span>
                        <kbd className={`px-1.5 py-0.5 rounded border text-[10px] ${isDark ? 'border-zinc-700 bg-white/5' : 'border-gray-200 bg-white'}`}>Esc</kbd>
                        <span>关闭</span>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={onClose}
                            className={`inline-flex h-9 items-center gap-1.5 px-4 rounded-lg text-[12px] font-medium transition-all border ${isDark ? 'bg-white/[0.04] border-white/[0.08] text-zinc-200 hover:bg-white/[0.08]' : 'bg-white border-zinc-300 text-gray-700 hover:bg-zinc-50'}`}
                        >
                            取消
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={selected.size === 0 || working || !imgDataUrl}
                            className="inline-flex h-9 items-center gap-1.5 pl-3 pr-4 rounded-lg text-[13px] font-semibold transition-all active:scale-[0.97] bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:shadow-none"
                        >
                            {working ? <Icons.Loader2 size={15} className="animate-spin" /> : <Icons.Sparkles size={15} />}
                            <span>{working ? '准备中…' : (selected.size > 0 ? `生成 ${selected.size} 张高清` : '请先选择格子')}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
