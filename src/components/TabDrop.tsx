import React, { useEffect, useState } from 'react';
import { UploadCloud, File, Trash2, Image, Film, FileText, Archive, Music, Eye, X } from 'lucide-react';
import { getTranslation, Language } from '../utils/i18n';

export interface StashedFile {
  name: string;
  size: number;
  path: string;
}

interface TabDropProps {
  stashedFiles: StashedFile[];
  setStashedFiles: React.Dispatch<React.SetStateAction<StashedFile[]>>;
  onCountChange: (count: number) => void;
  isDragOver?: boolean;
  language: Language;
}

/* ── helpers ───────────────────────────────────────────── */
const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const getExt = (name: string) => {
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
};

type FileCategory = 'image' | 'video' | 'audio' | 'document' | 'archive' | 'other';

const getCategory = (ext: string): FileCategory => {
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext)) return 'audio';
  if (['pdf', 'doc', 'docx', 'txt', 'md', 'xls', 'xlsx', 'ppt', 'pptx', 'csv'].includes(ext)) return 'document';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
  return 'other';
};

const categoryMeta: Record<
  FileCategory,
  { icon: React.ReactNode; color: string; bg: string; border: string }
> = {
  image:    { icon: <Image    className="w-5 h-5" />, color: 'text-purple-300', bg: 'bg-purple-500/10',  border: 'border-purple-500/25'  },
  video:    { icon: <Film     className="w-5 h-5" />, color: 'text-pink-300',   bg: 'bg-pink-500/10',    border: 'border-pink-500/25'    },
  audio:    { icon: <Music    className="w-5 h-5" />, color: 'text-green-300',  bg: 'bg-green-500/10',   border: 'border-green-500/25'   },
  document: { icon: <FileText className="w-5 h-5" />, color: 'text-blue-300',   bg: 'bg-blue-500/10',    border: 'border-blue-500/25'    },
  archive:  { icon: <Archive  className="w-5 h-5" />, color: 'text-yellow-300', bg: 'bg-yellow-500/10',  border: 'border-yellow-500/25'  },
  other:    { icon: <File     className="w-5 h-5" />, color: 'text-cyan-300',   bg: 'bg-cyan-500/10',    border: 'border-cyan-500/25'    },
};

/* ── track newly added cards for drop-in animation ─────── */
const useNewItems = (list: StashedFile[]) => {
  const [newPaths, setNewPaths] = useState<Set<string>>(new Set());
  const prevLen = React.useRef(list.length);

  useEffect(() => {
    if (list.length > prevLen.current) {
      const added = list.slice(prevLen.current).map((f) => f.path);
      setNewPaths(new Set(added));
      const t = setTimeout(() => setNewPaths(new Set()), 800);
      prevLen.current = list.length;
      return () => clearTimeout(t);
    }
    prevLen.current = list.length;
  }, [list]);

  return newPaths;
};

/* ── image thumbnail (tries convertFileSrc in Tauri) ────── */
const FileThumbnail: React.FC<{
  file: StashedFile;
  meta: (typeof categoryMeta)[FileCategory];
}> = ({ file, meta }) => {
  const [imgOk, setImgOk] = useState(false);
  const ext = getExt(file.name);
  const isImg = getCategory(ext) === 'image';
  const [src, setSrc] = useState('');

  useEffect(() => {
    if (!isImg || !file.path) return;
    if ((window as any).__TAURI__) {
      import('@tauri-apps/api/core')
        .then(({ convertFileSrc }) => setSrc(convertFileSrc(file.path)))
        .catch(() => setSrc(''));
    } else {
      setSrc(file.path);
    }
  }, [file.path, isImg]);

  if (isImg && src) {
    return (
      <div className="w-10 h-10 rounded-lg overflow-hidden relative border border-island/10">
        <img
          src={src}
          alt={file.name}
          className={`w-full h-full object-cover transition-opacity duration-300 ${imgOk ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setImgOk(true)}
          onError={() => { setImgOk(false); setSrc(''); }}
        />
        {!imgOk && (
          <div className={`absolute inset-0 flex items-center justify-center border ${meta.bg} ${meta.border}`}>
            <span className={meta.color}>{meta.icon}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${meta.bg} ${meta.border}`}>
      <span className={meta.color}>{meta.icon}</span>
    </div>
  );
};

/* ── main component ─────────────────────────────────────── */
export const TabDrop: React.FC<TabDropProps> = ({
  stashedFiles,
  setStashedFiles,
  onCountChange,
  isDragOver = false,
  language,
}) => {
  const newPaths = useNewItems(stashedFiles);
  const t = getTranslation(language);

  // Preview Modal States
  const [previewFile, setPreviewFile] = useState<StashedFile | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewImgSrc, setPreviewImgSrc] = useState<string>('');

  useEffect(() => {
    onCountChange(stashedFiles.length);
  }, [stashedFiles]);

  // Load preview image URL safely via convertFileSrc
  useEffect(() => {
    if (!previewFile) {
      setPreviewImgSrc('');
      return;
    }
    const ext = getExt(previewFile.name);
    const isImg = getCategory(ext) === 'image';
    if (!isImg) return;

    if ((window as any).__TAURI__) {
      import('@tauri-apps/api/core')
        .then(({ convertFileSrc }) => setPreviewImgSrc(convertFileSrc(previewFile.path)))
        .catch(() => setPreviewImgSrc(''));
    } else {
      setPreviewImgSrc(previewFile.path);
    }
  }, [previewFile]);

  const removeFile = async (index: number, path: string) => {
    try {
      if ((window as any).__TAURI__ && path) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('delete_stashed_file', { path });
      }
    } catch (err) {
      console.error('Failed to delete stashed file:', err);
    }
    setStashedFiles((prev) => prev.filter((_, i) => i !== index));
    if (previewFile?.path === path) {
      setPreviewFile(null);
    }
  };

  const handleOpenFile = async (file: StashedFile) => {
    if ((window as any).__TAURI__ && file.path) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('open_file', { path: file.path });
      } catch (err) {
        console.error('Failed to open file via Tauri:', err);
      }
    }
  };

  const handlePreviewFile = async (file: StashedFile) => {
    setPreviewFile(file);
    setPreviewContent(null);
    setPreviewError(null);
    const ext = getExt(file.name);
    const isText = ['txt', 'md', 'js', 'ts', 'tsx', 'jsx', 'json', 'css', 'html', 'rs', 'py', 'java', 'c', 'cpp', 'h', 'go', 'toml', 'yaml', 'yml', 'ini', 'cfg', 'log'].includes(ext);

    if (isText && file.path) {
      setLoadingPreview(true);
      try {
        if ((window as any).__TAURI__) {
          const { readTextFile } = await import('@tauri-apps/plugin-fs');
          const text = await readTextFile(file.path);
          // Limit preview text length to prevent lag in DOM
          const truncated = text.length > 5000 ? text.substring(0, 5000) + '\n\n... (content truncated) ...' : text;
          setPreviewContent(truncated);
        } else {
          // Web Mock text preview
          setPreviewContent(`// Web Mock Content for ${file.name}\n\nconsole.log("Hello from Vibe Island!");\nconst data = {\n  status: "success",\n  code: 200\n};`);
        }
      } catch (err) {
        console.error('Failed to read text file:', err);
        setPreviewError('Cannot read file content. Please check permissions.');
      } finally {
        setLoadingPreview(false);
      }
    }
  };

  const handleNativeDrag = async (file: StashedFile, index: number) => {
    if (!(window as any).__TAURI__ || !file.path) return;
    try {
      const { startDrag } = await import('@crabnebula/tauri-plugin-drag');
      await startDrag(
        { item: [file.path], icon: file.path },
        (result) => {
          const resStr = typeof result === 'string' ? result : (result as any)?.event || '';
          const resLower = resStr.toLowerCase();
          console.log("Native drag result:", resStr);
          // Remove from list if drop was successful and not canceled
          if (resLower.includes('drop') || resLower.includes('success') || (resLower !== 'cancelled' && resLower !== 'cancel')) {
            setStashedFiles((prev) => prev.filter((_, i) => i !== index));
          }
        }
      );
    } catch (err) {
      console.error('Native drag failed:', err);
    }
  };

  // Detect real drag gesture (mouse moved > 4px before mouseup)
  const setupDragGesture = (e: React.MouseEvent, file: StashedFile, index: number) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;

    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;

    const onMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (!dragging && Math.sqrt(dx * dx + dy * dy) > 4) {
        dragging = true;
        cleanup();
        handleNativeDrag(file, index);
      }
    };

    const cleanup = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', cleanup);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', cleanup);
  };

  return (
    <div className="relative flex flex-col gap-3 w-full" style={{ minHeight: 180 }}>

      {/* ── Drag-over overlay (only when actively dragging into island) ── */}
      {isDragOver && (
        <div className="absolute inset-0 z-20 rounded-xl border border-dashed border-cyan-400/50 bg-cyan-500/[0.05] flex flex-col items-center justify-center gap-2 backdrop-blur-[2px] pointer-events-none">
          <span className="drop-zone-scan-line" />
          <UploadCloud className="w-7 h-7 text-cyan-300 drop-icon-float" />
          <span className="text-[12px] font-semibold text-cyan-300 tracking-wide">{t.dropRelease}</span>
          <span className="text-[10px] text-cyan-500/60">{t.dropMoveIsland}</span>
        </div>
      )}

      {/* ── File grid ── */}
      <div className="overflow-y-auto custom-scrollbar flex-grow pr-0.5" style={{ maxHeight: 260 }}>
        {stashedFiles.length === 0 ? (
          <div className="text-center text-[12px] text-island/20 py-8 flex flex-col items-center gap-2">
            <UploadCloud className="w-8 h-8 opacity-20" />
            <span>{t.dropNoFiles}</span>
            <span className="text-[10px] text-island/10">{t.dropDragFiles}</span>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 pb-2">
            {stashedFiles.map((file, index) => {
              const ext = getExt(file.name);
              const cat = getCategory(ext);
              const meta = categoryMeta[cat];
              const isNew = newPaths.has(file.path);

              return (
                <div
                  key={`${file.path}-${index}`}
                  onDoubleClick={() => handleOpenFile(file)}
                  onMouseDown={(e) => setupDragGesture(e, file, index)}
                  className={`group relative flex flex-col items-center justify-between p-2.5 rounded-xl border transition-all duration-200 cursor-grab aspect-square w-full
                    bg-island/[0.025] border-island/[0.05]
                    hover:bg-island/[0.055] hover:border-island/[0.12] hover:shadow-lg
                    active:cursor-grabbing active:scale-95
                    ${isNew ? 'file-drop-in' : ''}`}
                  title={t.dropTooltipDrag}
                >
                  {/* Extension badge */}
                  {ext && (
                    <div className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[7px] font-bold uppercase tracking-wider z-10 ${meta.bg} ${meta.color} border ${meta.border}`}>
                      {ext}
                    </div>
                  )}

                  {/* Actions overlay buttons */}
                  <div className="absolute top-1.5 right-1.5 flex gap-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    {/* Preview Button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handlePreviewFile(file); }}
                      className="p-1 rounded-md text-island/40 hover:text-island hover:bg-island/10 hover:!text-cyan-400 transition-all duration-150"
                      title="Quick Look"
                    >
                      <Eye className="w-3 h-3" />
                    </button>
                    {/* Delete button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFile(index, file.path); }}
                      className="p-1 rounded-md text-island/40 hover:text-island hover:bg-island/10 hover:!text-red-400 transition-all duration-150"
                      title={t.dropDeletePermanent}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Thumbnail or icon (centered area) */}
                  <div className="w-full flex items-center justify-center flex-grow mt-4 mb-2">
                    <FileThumbnail file={file} meta={meta} />
                  </div>

                  {/* Info footer */}
                  <div className="w-full flex flex-col items-center gap-0.5 leading-none">
                    <span className="text-[10px] text-island/80 font-medium truncate w-full text-center leading-tight px-0.5">
                      {file.name}
                    </span>
                    <span className="text-[8.5px] text-island/30 font-mono tracking-wider">
                      {formatBytes(file.size)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Preview Modal Overlay ── */}
      {previewFile && (
        <div className="absolute inset-0 z-30 bg-island-surface/98 rounded-xl border border-island/[0.08] p-3 flex flex-col gap-2.5 animate-content-reveal">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-island/[0.04] pb-1.5">
            <span className="text-[11.5px] font-bold text-island/95 truncate max-w-[340px]" title={previewFile.name}>
              {previewFile.name}
            </span>
            <button
              onClick={() => { setPreviewFile(null); setPreviewContent(null); }}
              className="p-1 rounded-md text-island/40 hover:text-island hover:bg-island/5 transition-all"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-grow overflow-y-auto custom-scrollbar flex flex-col justify-center items-center w-full">
            {loadingPreview ? (
              <div className="flex flex-col items-center gap-2 text-island/40 text-xs">
                <span className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                <span>Loading preview...</span>
              </div>
            ) : previewError ? (
              <span className="text-red-400 text-xs text-center">{previewError}</span>
            ) : getCategory(getExt(previewFile.name)) === 'image' ? (
              <div className="w-full h-[130px] flex items-center justify-center overflow-hidden rounded-lg border border-island/[0.05] bg-island/[0.06]">
                {previewImgSrc ? (
                  <img
                    src={previewImgSrc}
                    alt={previewFile.name}
                    className="max-w-full max-h-full object-contain rounded"
                  />
                ) : (
                  <span className="text-island/20 text-[10px]">Loading Image...</span>
                )}
              </div>
            ) : previewContent !== null ? (
              <pre className="w-full text-left text-[10px] font-mono bg-island/[0.08] p-2 rounded-lg border border-island/[0.05] overflow-auto h-[130px] text-island/80 whitespace-pre select-text custom-scrollbar">
                {previewContent}
              </pre>
            ) : (
              /* Non-previewable metadata card */
              <div className="flex flex-col items-center gap-2 p-2.5 rounded-lg border border-island/[0.03] bg-island/[0.01] w-full">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${categoryMeta[getCategory(getExt(previewFile.name))].bg} ${categoryMeta[getCategory(getExt(previewFile.name))].border}`}>
                  <span className={categoryMeta[getCategory(getExt(previewFile.name))].color}>
                    {categoryMeta[getCategory(getExt(previewFile.name))].icon}
                  </span>
                </div>
                <div className="flex flex-col gap-1 w-full text-center">
                  <span className="text-[9px] text-island/30 font-bold uppercase tracking-wider">File Path</span>
                  <span className="text-[9px] text-island/60 font-mono break-all select-all px-1.5 py-0.5 rounded bg-island/[0.04] border border-island/[0.02]">{previewFile.path}</span>
                </div>
                <div className="flex justify-around w-full mt-1 border-t border-island/[0.04] pt-2">
                  <div className="flex flex-col items-center">
                    <span className="text-[9px] text-island/30 font-bold uppercase">Size</span>
                    <span className="text-[10px] text-island/80 font-mono font-bold">{formatBytes(previewFile.size)}</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-[9px] text-island/30 font-bold uppercase">Type</span>
                    <span className="text-[10px] text-island/80 font-bold uppercase">{getExt(previewFile.name) || 'Unknown'}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
