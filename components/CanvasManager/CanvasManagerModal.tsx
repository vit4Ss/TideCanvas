import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icons } from '../Icons';
import { storageService, WorkspaceMeta } from '../../services/storageService';

interface CanvasManagerModalProps {
    isOpen: boolean;
    isDark?: boolean;
    canClose: boolean;
    currentWorkspaceId: string | null;
    onClose: () => void;
    onCreate: () => Promise<void> | void;
    onOpen: (id: string) => Promise<void> | void;
    onDeleteCurrent?: () => void;
    onRenameCurrent?: (name: string) => void;
    refreshToken?: number;
}

const formatTimestamp = (ts: number) => {
    if (!ts) return '';
    const date = new Date(ts);
    const now = new Date();
    const sameDay =
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate();
    const pad = (n: number) => n.toString().padStart(2, '0');
    if (sameDay) return `今天 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const CanvasManagerModal: React.FC<CanvasManagerModalProps> = ({
    isOpen,
    isDark = false,
    canClose,
    currentWorkspaceId,
    onClose,
    onCreate,
    onOpen,
    onDeleteCurrent,
    onRenameCurrent,
    refreshToken,
}) => {
    const [workspaces, setWorkspaces] = useState<WorkspaceMeta[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameDraft, setRenameDraft] = useState('');
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const skipNextRenameCommitRef = useRef(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const list = await storageService.listWorkspaces();
            setWorkspaces(list);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) refresh();
    }, [isOpen, refresh, refreshToken]);

    useEffect(() => {
        if (!isOpen) {
            setRenamingId(null);
            setConfirmDeleteId(null);
            setSearch('');
            setErrorMessage(null);
        }
    }, [isOpen]);

    const filtered = useMemo(() => {
        const key = search.trim().toLowerCase();
        if (!key) return workspaces;
        return workspaces.filter(w => w.name.toLowerCase().includes(key));
    }, [workspaces, search]);

    const normalizedRenameDraft = renameDraft.trim().toLocaleLowerCase();
    const renameDuplicateWorkspace = normalizedRenameDraft
        ? workspaces.find(w => w.id !== renamingId && w.name.trim().toLocaleLowerCase() === normalizedRenameDraft)
        : undefined;
    const renameValidationMessage = renameDuplicateWorkspace ? '已存在同名画布' : null;

    const handleCreate = async () => {
        setBusyId('__create__');
        setErrorMessage(null);
        try {
            await onCreate();
        } catch (e: any) {
            setErrorMessage(e?.message || '新建画布失败');
        } finally {
            setBusyId(null);
        }
    };

    const handleOpen = async (id: string) => {
        if (renamingId === id) return;
        setBusyId(id);
        setErrorMessage(null);
        try {
            await onOpen(id);
        } catch (e: any) {
            setErrorMessage(e?.message || '打开画布失败');
        } finally {
            setBusyId(null);
        }
    };

    const handleStartRename = (id: string, currentName: string) => {
        skipNextRenameCommitRef.current = false;
        setRenamingId(id);
        setRenameDraft(currentName);
    };

    const handleCommitRename = async (id: string) => {
        if (skipNextRenameCommitRef.current) {
            skipNextRenameCommitRef.current = false;
            return;
        }
        if (busyId === id) return;
        const name = renameDraft.trim();
        if (!name) {
            setRenamingId(null);
            return;
        }
        if (renameDuplicateWorkspace) {
            setErrorMessage('已存在同名画布，请换一个名称');
            return;
        }
        setBusyId(id);
        setErrorMessage(null);
        try {
            const updated = await storageService.renameWorkspace(id, name);
            if (!updated) throw new Error('画布不存在，无法重命名');
            if (id === currentWorkspaceId) {
                onRenameCurrent?.(updated.name);
            }
            setRenamingId(null);
            await refresh();
        } catch (e: any) {
            setErrorMessage(e?.message || '重命名失败');
        } finally {
            setBusyId(null);
        }
    };

    const handleDelete = async (id: string) => {
        await storageService.deleteWorkspace(id);
        setConfirmDeleteId(null);
        if (id === currentWorkspaceId && onDeleteCurrent) {
            onDeleteCurrent();
        }
        await refresh();
    };

    if (!isOpen) return null;

    const overlayBg = isDark ? 'bg-black/70' : 'bg-slate-900/40';
    const panelBg = isDark ? 'bg-zinc-950 border-white/10' : 'bg-white border-gray-200';
    const textMain = isDark ? 'text-white' : 'text-gray-900';
    const textSub = isDark ? 'text-gray-400' : 'text-gray-500';
    const textMuted = isDark ? 'text-gray-500' : 'text-gray-400';
    const cardBg = isDark ? 'bg-zinc-900/70 hover:bg-zinc-900 border-white/10 hover:border-white/20' : 'bg-white hover:bg-slate-50 border-gray-200 hover:border-blue-300';
    const searchBg = isDark ? 'bg-zinc-900 border-white/10 text-white placeholder:text-gray-500' : 'bg-slate-50 border-gray-200 text-gray-900 placeholder:text-gray-400';
    const buttonGhost = isDark ? 'hover:bg-white/10 text-gray-300' : 'hover:bg-slate-100 text-gray-600';

    const modal = (
        <div className={`fixed inset-0 z-[1000] flex items-center justify-center ${overlayBg} backdrop-blur-md`}>
            <div className={`w-[min(1080px,92vw)] h-[min(720px,88vh)] ${panelBg} border rounded-3xl shadow-2xl flex flex-col overflow-hidden`}>
                {/* Header */}
                <div className={`flex items-center justify-between px-8 py-5 border-b ${isDark ? 'border-white/10' : 'border-gray-100'}`}>
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isDark ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-50 text-blue-600'}`}>
                            <Icons.LayoutGrid size={20} />
                        </div>
                        <div>
                            <div className={`text-lg font-bold ${textMain}`}>项目</div>
                            <div className={`text-xs ${textSub}`}>选择一个画布开始工作，或新建一个空白画布</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className={`relative`}>
                            <Icons.Search size={15} className={`absolute left-3 top-1/2 -translate-y-1/2 ${textMuted}`} />
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="搜索画布..."
                                className={`pl-9 pr-3 py-2 w-56 rounded-xl border text-sm outline-none transition-all ${searchBg} focus:border-blue-400`}
                            />
                        </div>
                        {canClose && (
                            <button
                                onClick={onClose}
                                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${buttonGhost}`}
                                aria-label="关闭"
                            >
                                <Icons.X size={18} />
                            </button>
                        )}
                    </div>
                </div>

                {errorMessage && (
                    <div className={`mx-8 mt-4 flex items-start gap-2 px-3 py-2 rounded-xl border text-xs ${isDark ? 'bg-red-500/10 border-red-500/20 text-red-300' : 'bg-red-50 border-red-200 text-red-700'}`}>
                        <Icons.AlertCircle size={14} className="mt-0.5 shrink-0" />
                        <div className="flex-1 leading-relaxed break-words">{errorMessage}</div>
                        <button
                            onClick={() => setErrorMessage(null)}
                            className={`p-0.5 rounded ${isDark ? 'hover:bg-white/10' : 'hover:bg-white/60'}`}
                            aria-label="关闭"
                        >
                            <Icons.X size={12} />
                        </button>
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-auto px-8 py-6">
                    {loading && workspaces.length === 0 ? (
                        <div className={`h-full flex items-center justify-center ${textSub}`}>
                            <Icons.Loader2 size={22} className="animate-spin" />
                        </div>
                    ) : (
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
                            {/* New canvas card */}
                            <button
                                onClick={handleCreate}
                                disabled={busyId === '__create__'}
                                className={`group h-[180px] rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 transition-all ${
                                    isDark
                                        ? 'border-white/15 hover:border-blue-400/70 bg-zinc-900/40 hover:bg-blue-500/5'
                                        : 'border-gray-300 hover:border-blue-400 bg-slate-50/50 hover:bg-blue-50/60'
                                } disabled:opacity-60`}
                            >
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${
                                    isDark ? 'bg-blue-500/20 text-blue-300 group-hover:bg-blue-500/30' : 'bg-blue-100 text-blue-600 group-hover:bg-blue-200'
                                }`}>
                                    {busyId === '__create__' ? (
                                        <Icons.Loader2 size={20} className="animate-spin" />
                                    ) : (
                                        <Icons.Plus size={22} strokeWidth={2.5} />
                                    )}
                                </div>
                                <div className="text-center">
                                    <div className={`text-sm font-semibold ${textMain}`}>新建画布</div>
                                    <div className={`text-xs mt-0.5 ${textSub}`}>创建一个空白画布</div>
                                </div>
                            </button>

                            {/* Canvas cards */}
                            {filtered.map(ws => {
                                const isCurrent = ws.id === currentWorkspaceId;
                                const isRenaming = renamingId === ws.id;
                                const isConfirmDelete = confirmDeleteId === ws.id;
                                return (
                                    <div
                                        key={ws.id}
                                        className={`group relative h-[180px] rounded-2xl border ${cardBg} transition-all flex flex-col ${
                                            isCurrent ? (isDark ? 'ring-2 ring-blue-400/60' : 'ring-2 ring-blue-400') : ''
                                        }`}
                                    >
                                        <button
                                            onClick={() => !isRenaming && handleOpen(ws.id)}
                                            disabled={busyId === ws.id && !isRenaming}
                                            className="flex-1 w-full px-4 pt-4 text-left flex flex-col items-start disabled:opacity-60"
                                        >
                                            {/* Thumbnail / placeholder */}
                                            <div className={`w-full h-20 rounded-xl mb-3 flex items-center justify-center overflow-hidden ${
                                                isDark ? 'bg-zinc-800' : 'bg-slate-100'
                                            }`}>
                                                {ws.thumbnail ? (
                                                    <img src={ws.thumbnail} className="w-full h-full object-cover" alt={ws.name} />
                                                ) : (
                                                    <Icons.LayoutGrid size={24} className={textMuted} />
                                                )}
                                            </div>

                                            {/* Name or rename input */}
                                            {isRenaming ? (
                                                <div className="w-full" onClick={e => e.stopPropagation()}>
                                                    <input
                                                        autoFocus
                                                        value={renameDraft}
                                                        onChange={e => setRenameDraft(e.target.value)}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                if (!renameValidationMessage) e.currentTarget.blur();
                                                            } else if (e.key === 'Escape') {
                                                                e.preventDefault();
                                                                skipNextRenameCommitRef.current = true;
                                                                setRenamingId(null);
                                                                e.currentTarget.blur();
                                                            }
                                                        }}
                                                        onBlur={() => handleCommitRename(ws.id)}
                                                        className={`w-full px-2 py-1 text-sm font-semibold rounded-lg border outline-none ${
                                                            renameValidationMessage
                                                                ? (isDark ? 'bg-zinc-800 border-red-400 text-white' : 'bg-white border-red-400 text-gray-900')
                                                                : (isDark ? 'bg-zinc-800 border-blue-400 text-white' : 'bg-white border-blue-400 text-gray-900')
                                                        }`}
                                                    />
                                                    {renameValidationMessage && (
                                                        <div className={`mt-1 text-[11px] ${isDark ? 'text-red-300' : 'text-red-500'}`}>
                                                            {renameValidationMessage}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className={`text-sm font-semibold truncate w-full ${textMain}`}>
                                                    {ws.name}
                                                </div>
                                            )}

                                            <div className={`mt-1 text-[11px] ${textSub} flex items-center gap-2`}>
                                                <span className="inline-flex items-center gap-1">
                                                    <Icons.Layers size={11} />
                                                    {ws.nodeCount} 节点
                                                </span>
                                                <span className={isDark ? 'text-gray-600' : 'text-gray-300'}>·</span>
                                                <span className="inline-flex items-center gap-1">
                                                    <Icons.Clock size={11} />
                                                    {formatTimestamp(ws.updatedAt)}
                                                </span>
                                            </div>
                                        </button>

                                        {/* Actions */}
                                        <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={e => { e.stopPropagation(); handleStartRename(ws.id, ws.name); }}
                                                className={`w-7 h-7 rounded-lg flex items-center justify-center ${isDark ? 'bg-zinc-800/90 hover:bg-zinc-700 text-gray-300' : 'bg-white/90 hover:bg-slate-100 text-gray-600 border border-gray-200'}`}
                                                title="重命名"
                                            >
                                                <Icons.Edit3 size={12} />
                                            </button>
                                            <button
                                                onClick={e => { e.stopPropagation(); setConfirmDeleteId(ws.id); }}
                                                className={`w-7 h-7 rounded-lg flex items-center justify-center ${isDark ? 'bg-zinc-800/90 hover:bg-red-500/80 text-gray-300 hover:text-white' : 'bg-white/90 hover:bg-red-500 text-gray-600 hover:text-white border border-gray-200 hover:border-red-500'}`}
                                                title="删除"
                                            >
                                                <Icons.Trash2 size={12} />
                                            </button>
                                        </div>

                                        {/* Confirm delete overlay */}
                                        {isConfirmDelete && (
                                            <div
                                                className={`absolute inset-0 rounded-2xl flex flex-col items-center justify-center gap-3 p-4 text-center ${
                                                    isDark ? 'bg-zinc-950/95' : 'bg-white/95'
                                                } backdrop-blur-sm`}
                                                onClick={e => e.stopPropagation()}
                                            >
                                                <Icons.AlertTriangle size={22} className="text-red-500" />
                                                <div className={`text-sm font-semibold ${textMain}`}>删除「{ws.name}」？</div>
                                                <div className={`text-xs ${textSub}`}>此操作无法撤销</div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => setConfirmDeleteId(null)}
                                                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${isDark ? 'bg-zinc-800 hover:bg-zinc-700 text-gray-200' : 'bg-slate-100 hover:bg-slate-200 text-gray-700'}`}
                                                    >取消</button>
                                                    <button
                                                        onClick={() => handleDelete(ws.id)}
                                                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-500 hover:bg-red-600 text-white"
                                                    >删除</button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {filtered.length === 0 && search && (
                                <div className={`col-span-full py-10 text-center text-sm ${textSub}`}>
                                    没有匹配的画布
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    return createPortal(modal, document.body);
};

export default CanvasManagerModal;
