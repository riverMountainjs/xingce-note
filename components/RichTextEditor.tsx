
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Bold, Italic, List, ListOrdered, Image as ImageIcon, Loader2, Indent, Outdent, Palette, Trash2, Type } from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800;
                let width = img.width;
                let height = img.height;
                if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) { resolve(img.src); return; }
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
};

const ImageResizer = ({ img, editorRef, onResize, onDeselect }: {
    img: HTMLImageElement; editorRef: React.RefObject<HTMLDivElement>; onResize: () => void; onDeselect: () => void;
}) => {
    const [dim, setDim] = useState({ w: 0, h: 0, t: 0, l: 0 });
    const updateOverlay = useCallback(() => {
        if (!img || !editorRef.current || !img.isConnected) { onDeselect(); return; }
        const editorRect = editorRef.current.getBoundingClientRect();
        const imgRect = img.getBoundingClientRect();
        setDim({ w: imgRect.width, h: imgRect.height, t: imgRect.top - editorRect.top + editorRef.current.scrollTop, l: imgRect.left - editorRect.left + editorRef.current.scrollLeft });
    }, [img, editorRef, onDeselect]);

    useEffect(() => {
        updateOverlay();
        const editor = editorRef.current;
        if (!editor) return;
        const resizeObs = new ResizeObserver(updateOverlay);
        resizeObs.observe(editor);
        try { resizeObs.observe(img); } catch(e){}
        editor.addEventListener('scroll', updateOverlay);
        window.addEventListener('resize', updateOverlay);
        return () => { resizeObs.disconnect(); editor.removeEventListener('scroll', updateOverlay); window.removeEventListener('resize', updateOverlay); };
    }, [updateOverlay, editorRef, img]);

    const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault(); e.stopPropagation();
        const startX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const startW = dim.w;
        const move = (ev: MouseEvent | TouchEvent) => {
            const clientX = 'touches' in ev ? ev.touches[0].clientX : (ev as MouseEvent).clientX;
            let newW = Math.max(50, startW + (clientX - startX));
            img.style.width = `${newW}px`; img.style.height = 'auto'; updateOverlay();
        };
        const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); window.removeEventListener('touchmove', move); window.removeEventListener('touchend', up); onResize(); };
        window.addEventListener('mousemove', move, { passive: false }); window.addEventListener('mouseup', up); window.addEventListener('touchmove', move, { passive: false }); window.addEventListener('touchend', up);
    };

    return (
        <div className="absolute border-2 border-blue-500 z-10 pointer-events-none" style={{ top: dim.t, left: dim.l, width: dim.w, height: dim.h }}>
            <button className="absolute -top-3 -right-3 w-7 h-7 bg-white text-red-500 shadow-md rounded-full flex items-center justify-center pointer-events-auto border border-gray-100" onClick={(e) => { e.stopPropagation(); img.remove(); onResize(); onDeselect(); }}><Trash2 size={14} /></button>
            <div className="absolute -bottom-2 -right-2 w-6 h-6 bg-blue-500 border-2 border-white rounded-full cursor-se-resize pointer-events-auto" onMouseDown={handleStart} onTouchStart={handleStart}></div>
        </div>
    );
};

const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, placeholder }) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const [isProcessingImg, setIsProcessingImg] = useState(false);
    const [selectedImg, setSelectedImg] = useState<HTMLImageElement | null>(null);
    const isComposing = useRef(false);
    const savedSelection = useRef<Range | null>(null);

    useEffect(() => {
        if (editorRef.current && document.activeElement !== editorRef.current && editorRef.current.innerHTML !== value) {
            editorRef.current.innerHTML = value;
        }
    }, [value]);

    const handleInput = () => {
        if (editorRef.current && !isComposing.current) {
            const html = editorRef.current.innerHTML;
            onChange(html === '<br>' ? '' : html);
        }
    };

    const execCmd = (command: string, value: string | undefined = undefined) => {
        if (document.activeElement !== editorRef.current) {
            if (savedSelection.current) {
                const sel = window.getSelection();
                if (sel) { sel.removeAllRanges(); sel.addRange(savedSelection.current); }
            } else { editorRef.current?.focus(); }
        }
        document.execCommand(command, false, value);
        handleInput();
    };

    const insertImage = async (file: File) => {
        setIsProcessingImg(true);
        try {
            const compressedBase64 = await compressImage(file);
            const imgHtml = `<img src="${compressedBase64}" loading="lazy" class="rich-img-inline" />`;
            editorRef.current?.focus();
            document.execCommand('insertHTML', false, imgHtml);
            handleInput();
        } finally { setIsProcessingImg(false); }
    };

    const saveRange = () => {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) savedSelection.current = sel.getRangeAt(0);
    };

    const restoreRange = () => {
        if (savedSelection.current) {
             const sel = window.getSelection();
             sel?.removeAllRanges();
             sel?.addRange(savedSelection.current);
        }
    };

    const ToolbarButton = ({ icon: Icon, cmd, arg, title }: any) => (
        <button onMouseDown={(e) => e.preventDefault()} onClick={() => execCmd(cmd, arg)} className="p-2 hover:bg-gray-200 rounded text-slate-600 min-w-[32px]" title={title} type="button">
            {Icon && <Icon size={16}/>}
        </button>
    );

    return (
        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white flex flex-col focus-within:ring-2 focus-within:ring-blue-500 relative">
            <div className="flex items-center gap-1 p-2 border-b border-gray-100 bg-gray-50 overflow-x-auto flex-wrap">
                <ToolbarButton icon={Bold} cmd="bold" title="加粗" />
                <ToolbarButton icon={Italic} cmd="italic" title="斜体" />
                
                {/* Color Picker */}
                <div className="relative flex items-center justify-center p-2 hover:bg-gray-200 rounded text-slate-600" title="字体颜色">
                    <Palette size={16} />
                    <input type="color" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                        onMouseDown={saveRange} 
                        onChange={(e) => { restoreRange(); execCmd('foreColor', e.target.value); }} 
                    />
                </div>

                {/* Font Size Selector */}
                <div className="relative flex items-center justify-center p-2 hover:bg-gray-200 rounded text-slate-600 group w-10" title="字号大小">
                    <Type size={16} />
                    <select 
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                        defaultValue="3"
                        onMouseDown={saveRange}
                        onChange={(e) => { restoreRange(); execCmd('fontSize', e.target.value); }}
                    >
                        <option value="1">极小 (10px)</option>
                        <option value="2">小 (13px)</option>
                        <option value="3">默认 (16px)</option>
                        <option value="4">中等 (18px)</option>
                        <option value="5">大 (24px)</option>
                        <option value="6">超大 (32px)</option>
                        <option value="7">特大 (48px)</option>
                    </select>
                    <span className="text-[9px] absolute bottom-0.5 right-0.5 font-bold text-slate-400 pointer-events-none">T</span>
                </div>

                <div className="w-px h-4 bg-gray-300 mx-1"></div>
                <ToolbarButton icon={List} cmd="insertUnorderedList" title="列表" />
                <ToolbarButton icon={ListOrdered} cmd="insertOrderedList" title="有序列表" />
                <ToolbarButton icon={Outdent} cmd="outdent" title="缩进-" />
                <ToolbarButton icon={Indent} cmd="indent" title="缩进+" />
                <div className="w-px h-4 bg-gray-300 mx-1"></div>
                <label className={`p-2 hover:bg-gray-200 rounded text-slate-600 cursor-pointer flex items-center ${isProcessingImg ? 'opacity-50' : ''}`} title="插入图片">
                    {isProcessingImg ? <Loader2 size={16} className="animate-spin"/> : <ImageIcon size={16}/>}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { if(e.target.files?.[0]) { insertImage(e.target.files[0]); e.target.value = ''; } }} />
                </label>
            </div>
            
            <style>{`
                .rich-editor-content { 
                    font-family: ui-sans-serif, system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", sans-serif;
                    font-size: 16px; 
                    color: #334155;
                    line-height: 1.5;
                }
                /* 修复：将段落间距设为0，减少空白 */
                .rich-editor-content p, .rich-editor-content div { 
                    margin: 0; 
                    padding: 1px 0;
                }
                /* 修复：强制图片行内显示，并垂直居中 */
                .rich-editor-content img, .rich-img-inline { 
                    display: inline-block !important; 
                    vertical-align: middle !important;
                    margin: 0 2px;
                    max-width: 100%;
                    border-radius: 4px;
                }
                .rich-editor-content ul { list-style-type: disc; padding-left: 1.5rem; margin: 0.25rem 0; }
                .rich-editor-content ol { list-style-type: decimal; padding-left: 1.5rem; margin: 0.25rem 0; }
                .rich-editor-content li { margin-bottom: 0.1rem; }
                .rich-editor-placeholder {
                    font-size: 16px;
                }
            `}</style>
            
            <div className="relative flex-1 flex flex-col min-h-[250px]">
                <div 
                    ref={editorRef}
                    className="flex-1 p-4 outline-none overflow-y-auto rich-editor-content"
                    contentEditable
                    onInput={handleInput}
                    onCompositionStart={() => isComposing.current = true}
                    onCompositionEnd={() => { isComposing.current = false; handleInput(); }}
                    onPaste={async (e) => {
                        const items = e.clipboardData.items;
                        for (let i = 0; i < items.length; i++) {
                            if (items[i].type.indexOf('image') !== -1) {
                                e.preventDefault(); const file = items[i].getAsFile(); if (file) await insertImage(file);
                            }
                        }
                    }}
                    onClick={(e) => setSelectedImg(e.target instanceof HTMLImageElement ? e.target : null)}
                    style={{ whiteSpace: 'pre-wrap' }}
                />
                {selectedImg && <ImageResizer img={selectedImg} editorRef={editorRef} onResize={handleInput} onDeselect={() => setSelectedImg(null)} />}
            </div>
            {(!value && !editorRef.current?.innerText.trim()) && <div className="absolute top-[60px] left-4 text-slate-300 pointer-events-none rich-editor-placeholder">{placeholder || "在此记录您的学习心得或手打解析..."}</div>}
        </div>
    );
};

export default RichTextEditor;
