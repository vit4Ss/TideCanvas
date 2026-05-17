/**
 * 把一张图按 rows x cols 网格切成 rows*cols 张子图。
 * 返回每张子图的 dataURL 数组，按"从左到右、从上到下"顺序。
 */
export const cropImageToGrid = async (
    src: string,
    rows: number,
    cols: number,
    outFormat: 'image/png' | 'image/jpeg' = 'image/png',
    jpegQuality = 0.92
): Promise<string[]> => {
    if (rows < 1 || cols < 1) throw new Error('rows / cols 必须 ≥ 1');

    const img = await loadImageRobust(src);
    const cellW = Math.floor(img.naturalWidth / cols);
    const cellH = Math.floor(img.naturalHeight / rows);
    if (cellW < 4 || cellH < 4) throw new Error('图片太小或网格太密，每格不到 4 像素');

    const canvas = document.createElement('canvas');
    canvas.width = cellW;
    canvas.height = cellH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建 canvas 上下文');

    const results: string[] = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            ctx.clearRect(0, 0, cellW, cellH);
            ctx.drawImage(
                img,
                c * cellW, r * cellH, cellW, cellH,   // source rect
                0, 0, cellW, cellH                     // dest rect
            );
            const url = outFormat === 'image/jpeg'
                ? canvas.toDataURL('image/jpeg', jpegQuality)
                : canvas.toDataURL('image/png');
            results.push(url);
        }
    }
    return results;
};

const loadImage = (src: string, withCors: boolean): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const img = new Image();
        if (withCors) img.crossOrigin = 'anonymous';
        img.onload = () => {
            console.log('[ImageCrop] ✓ image loaded:', { withCors, w: img.naturalWidth, h: img.naturalHeight });
            resolve(img);
        };
        img.onerror = (e) => {
            console.error('[ImageCrop] ✗ image load FAILED:', {
                withCors,
                srcLength: src.length,
                srcPreview: src.slice(0, 200),
                errorEvent: String(e),
            });
            reject(new Error(`图片加载失败 (withCors=${withCors})`));
        };
        img.src = src;
    });

// 尝试多种策略加载图片：
//   1) data:/blob: → 直接加载
//   2) 远程 URL → 先 fetch 成 blob，转 dataURL 再加载（彻底绕开 CORS taint）
//   3) 实在不行用 crossOrigin
export const loadImageRobust = async (src: string): Promise<HTMLImageElement> => {
    if (!src || typeof src !== 'string') {
        throw new Error(`图片 src 无效（src=${JSON.stringify(src)?.slice(0, 100)}）`);
    }
    console.log('[ImageCrop] === loadImageRobust ===', { srcLength: src.length, srcPreview: src.slice(0, 80), isDataUrl: src.startsWith('data:'), isBlobUrl: src.startsWith('blob:'), isHttp: /^https?:/.test(src) });

    if (src.startsWith('data:') || src.startsWith('blob:')) {
        console.log('[ImageCrop] strategy 1: direct load (data/blob)');
        return loadImage(src, false);
    }

    // 远程 URL 优先策略：通过 Electron 主进程取图（绕开 CORS），转 dataURL
    const electronFetch = (window as any).electronAPI?.fetchImageAsDataUrl;
    if (typeof electronFetch === 'function') {
        console.log('[ImageCrop] strategy 2: Electron IPC fetch as dataURL');
        try {
            const result = await electronFetch(src);
            if (result?.ok && result?.dataUrl) {
                console.log('[ImageCrop] IPC fetch OK:', { size: result.size, contentType: result.contentType });
                return await loadImage(result.dataUrl, false);
            }
            console.warn('[ImageCrop] strategy 2 IPC returned:', result?.error || result);
        } catch (e: any) {
            console.warn('[ImageCrop] strategy 2 IPC threw:', e?.message);
        }
    }

    // 兜底 a：渲染进程 fetch → blob → dataURL（同源或开了 CORS 头时可用）
    console.log('[ImageCrop] strategy 3: renderer fetch → blob → dataURL');
    try {
        const res = await fetch(src);
        if (!res.ok) throw new Error(`fetch HTTP ${res.status}`);
        const blob = await res.blob();
        console.log('[ImageCrop] renderer fetch blob:', { size: blob.size, type: blob.type });
        const dataUrl: string = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('FileReader 失败'));
            reader.readAsDataURL(blob);
        });
        return await loadImage(dataUrl, false);
    } catch (e: any) {
        console.warn('[ImageCrop] strategy 3 failed:', e?.message);
    }

    // 兜底 b：试 crossOrigin='anonymous'
    console.log('[ImageCrop] strategy 3: crossOrigin');
    try {
        return await loadImage(src, true);
    } catch (e: any) {
        console.warn('[ImageCrop] strategy 3 failed:', e?.message);
    }

    // 兜底 2：不带 crossOrigin 直接加载（canvas 会 taint，toDataURL 后续会再失败）
    console.log('[ImageCrop] strategy 4: naked load (canvas will be tainted)');
    return loadImage(src, false);
};

/**
 * 按图片宽高比智能猜一个 grid 布局，给定总格数 total。
 * 32 → 4×8（宽图）或 8×4（高图）
 * 16 → 4×4
 * 9 → 3×3
 * 等等
 */
export const suggestGrid = (imgWidth: number, imgHeight: number, total: number): { rows: number; cols: number } => {
    const isLandscape = imgWidth >= imgHeight;
    // 先列出 total 的所有因子对
    const pairs: [number, number][] = [];
    for (let r = 1; r <= total; r++) {
        if (total % r === 0) pairs.push([r, total / r]);
    }
    // 按图片方向：宽图取 cols >= rows，高图取 rows >= cols
    if (isLandscape) {
        pairs.sort((a, b) => Math.abs(a[1] - 2 * a[0]) - Math.abs(b[1] - 2 * b[0]));
        for (const [r, c] of pairs) if (c >= r) return { rows: r, cols: c };
        return { rows: pairs[0][0], cols: pairs[0][1] };
    }
    pairs.sort((a, b) => Math.abs(a[0] - 2 * a[1]) - Math.abs(b[0] - 2 * b[1]));
    for (const [r, c] of pairs) if (r >= c) return { rows: r, cols: c };
    return { rows: pairs[0][0], cols: pairs[0][1] };
};

/**
 * 从分镜脚本文本中按 "镜头N:" 切割出每个镜头的描述。
 */
export const parseStoryboardShots = (text: string): { id: number; content: string }[] => {
    if (!text) return [];
    const shots: { id: number; content: string }[] = [];
    const re = /(?:^|\n)\s*(?:镜头|分镜|Shot|镜)\s*(\d+)\s*[：:]\s*/g;
    const matches = Array.from(text.matchAll(re));
    if (matches.length === 0) return [];
    for (let i = 0; i < matches.length; i++) {
        const m = matches[i];
        const id = parseInt(m[1], 10);
        const start = m.index! + m[0].length;
        const end = i + 1 < matches.length ? matches[i + 1].index! : text.length;
        const content = text.slice(start, end).trim();
        shots.push({ id, content });
    }
    return shots;
};
