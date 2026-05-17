import React, { useState } from 'react';
import { Icons } from '../../Icons';
import { CAMERA_PRESETS, CameraSelection, DEFAULT_CAMERA } from '../../../services/cameraPresets';

interface CameraPanelProps {
    initial?: CameraSelection;
    isDark?: boolean;
    onClose: () => void;
    onApply: (selection: CameraSelection) => void;
}

type FieldKey = 'body' | 'lens' | 'focal' | 'aperture';

const fieldMeta: { key: FieldKey; label: string; icon: any }[] = [
    { key: 'body', label: '相机', icon: Icons.Camera },
    { key: 'lens', label: '镜头', icon: Icons.Scan },
    { key: 'focal', label: '焦距', icon: Icons.Crop },
    { key: 'aperture', label: '光圈', icon: Icons.Sparkles },
];

export const CameraPanel: React.FC<CameraPanelProps> = ({ initial, isDark = true, onClose, onApply }) => {
    const [selection, setSelection] = useState<CameraSelection>(initial || DEFAULT_CAMERA);

    const optionsFor = (key: FieldKey): (string | number)[] => {
        switch (key) {
            case 'body': return CAMERA_PRESETS.bodies;
            case 'lens': return CAMERA_PRESETS.lenses;
            case 'focal': return CAMERA_PRESETS.focalLengths;
            case 'aperture': return CAMERA_PRESETS.apertures;
        }
    };

    const currentIndex = (key: FieldKey): number => {
        const opts = optionsFor(key);
        const value = key === 'body' ? selection.body
            : key === 'lens' ? selection.lens
            : key === 'focal' ? selection.focal
            : selection.aperture;
        const idx = opts.findIndex(o => o === value);
        return idx >= 0 ? idx : 0;
    };

    const setIndex = (key: FieldKey, idx: number) => {
        const opts = optionsFor(key);
        const wrapped = ((idx % opts.length) + opts.length) % opts.length;
        const next = opts[wrapped];
        setSelection(prev => ({
            ...prev,
            [key]: next,
        } as CameraSelection));
    };

    const step = (key: FieldKey, dir: 1 | -1) => setIndex(key, currentIndex(key) + dir);

    const panelBg = isDark ? 'bg-[#1a1a1a] border-zinc-700/60' : 'bg-white border-gray-200';
    const headerText = isDark ? 'text-zinc-100' : 'text-gray-900';
    const labelText = isDark ? 'text-zinc-400' : 'text-gray-500';
    const cardBg = isDark ? 'bg-zinc-900/80 border-zinc-700/60' : 'bg-gray-50 border-gray-200';
    const cardBgSelected = isDark ? 'bg-zinc-800 border-zinc-600 ring-1 ring-zinc-500' : 'bg-white border-gray-300 ring-1 ring-gray-200';
    const valueText = isDark ? 'text-zinc-200' : 'text-gray-800';
    const subValueText = isDark ? 'text-zinc-300' : 'text-gray-700';
    const arrowBtn = isDark ? 'text-zinc-500 hover:text-zinc-200 hover:bg-white/5' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100';
    const closeBtn = isDark ? 'text-zinc-400 hover:text-white hover:bg-white/10' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100';
    const dividerColor = isDark ? 'border-zinc-800' : 'border-gray-100';
    const useBtn = 'bg-blue-500 hover:bg-blue-600 text-white shadow-md shadow-blue-500/20';

    const valueOf = (key: FieldKey) => optionsFor(key)[currentIndex(key)];

    const renderCard = (key: FieldKey, label: string, Icon: any) => {
        const value = valueOf(key);
        const isFocal = key === 'focal';
        const isAperture = key === 'aperture';
        const big = isFocal ? `${value}` : isAperture ? `${value}` : '';
        const isSelected = true;
        return (
            <div key={key} className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); step(key, -1); }}
                    className={`inline-flex h-6 w-6 items-center justify-center rounded transition-all ${arrowBtn}`}
                    title="上一个"
                >
                    <Icons.ChevronRight size={14} className="-rotate-90" />
                </button>

                <div className={`relative w-full aspect-square rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${isSelected ? cardBgSelected : cardBg}`}>
                    <span className={`absolute top-2 text-[10px] font-medium uppercase tracking-wider ${labelText}`}>{label}</span>
                    {isFocal || isAperture ? (
                        <span className={`text-[26px] font-bold tabular-nums ${valueText}`}>{big}</span>
                    ) : (
                        <Icon size={36} strokeWidth={1.4} className={subValueText} />
                    )}
                </div>

                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); step(key, 1); }}
                    className={`inline-flex h-6 w-6 items-center justify-center rounded transition-all ${arrowBtn}`}
                    title="下一个"
                >
                    <Icons.ChevronRight size={14} className="rotate-90" />
                </button>

                <span className={`text-[11px] text-center truncate max-w-full ${subValueText}`} title={String(value)}>
                    {isFocal ? `${value} mm` : String(value)}
                </span>
            </div>
        );
    };

    return (
        <div
            className={`relative w-full rounded-2xl border ${panelBg} shadow-2xl flex flex-col`}
            onMouseDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
        >
            {/* Header */}
            <div className={`flex items-center justify-between px-4 py-2.5 border-b ${dividerColor}`}>
                <div className="flex items-center gap-2">
                    <Icons.Camera size={14} className={labelText} />
                    <span className={`text-[13px] font-medium ${headerText}`}>摄像机</span>
                </div>
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onClose(); }}
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-lg transition-all ${closeBtn}`}
                    title="关闭"
                >
                    <Icons.X size={14} />
                </button>
            </div>

            {/* Cards */}
            <div className="flex gap-3 px-4 py-4">
                {fieldMeta.map(f => renderCard(f.key, f.label, f.icon))}
            </div>

            {/* Footer */}
            <div className={`flex items-center justify-end px-4 py-2.5 border-t ${dividerColor}`}>
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onApply(selection); }}
                    className={`inline-flex h-8 items-center justify-center rounded-lg px-4 text-[12px] font-medium transition-all active:scale-[0.97] ${useBtn}`}
                >
                    使用
                </button>
            </div>
        </div>
    );
};
