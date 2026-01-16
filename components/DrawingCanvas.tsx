import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import { Eraser, Pencil, Trash2, Undo, Type as TypeIcon, Move } from 'lucide-react';

interface DrawingCanvasProps {
  initialImage?: string;
  backgroundImage?: string;
  width?: number;
  height?: number;
  readOnly?: boolean;
}

export interface DrawingCanvasRef {
  exportImage: () => string;
  clear: () => void;
}

interface TextElement {
  id: string;
  x: number;
  y: number;
  text: string;
}

const DrawingCanvas = forwardRef<DrawingCanvasRef, DrawingCanvasProps>(({ 
  initialImage, 
  backgroundImage, 
  width = 600, 
  height = 400,
  readOnly = false
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // State for logic
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<'pen' | 'eraser' | 'text'>('pen');
  const [history, setHistory] = useState<ImageData[]>([]);
  const [textElements, setTextElements] = useState<TextElement[]>([]);
  const [draggedTextId, setDraggedTextId] = useState<string | null>(null);

  // Refs for drawing loop to avoid state closure issues in event listeners
  const isDrawingRef = useRef(false);
  const toolRef = useRef(tool);

  useEffect(() => { toolRef.current = tool; }, [tool]);

  // Initialize Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI displays for crisp drawing
    const dpr = window.devicePixelRatio || 1;
    // We set internal dimensions scaled by DPR
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    
    // Scale context to match
    ctx.scale(dpr, dpr);
    
    // CSS Style dimensions remain logical
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    if (initialImage) {
      const img = new Image();
      img.onload = () => {
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
      };
      img.src = initialImage;
    }
  }, [width, height, initialImage]);

  // Native Event Listeners for smooth drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || readOnly) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const getPos = (e: MouseEvent | TouchEvent) => {
        const rect = canvas.getBoundingClientRect();
        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = (e as MouseEvent).clientX;
            clientY = (e as MouseEvent).clientY;
        }
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    const start = (e: MouseEvent | TouchEvent) => {
        if (toolRef.current === 'text') return;
        if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;
        
        // Prevent scrolling on touch
        if(e.type === 'touchstart') e.preventDefault();

        isDrawingRef.current = true;
        setIsDrawing(true);
        saveState();

        const { x, y } = getPos(e);
        ctx.beginPath();
        ctx.moveTo(x, y);
        
        // Styles
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = toolRef.current === 'pen' ? 2 : 20;
        ctx.globalCompositeOperation = toolRef.current === 'eraser' ? 'destination-out' : 'source-over';
        if (toolRef.current === 'pen') ctx.strokeStyle = '#dc2626';
    };

    const move = (e: MouseEvent | TouchEvent) => {
        if (!isDrawingRef.current || toolRef.current === 'text') return;
        // Prevent scrolling on touch
        if(e.type === 'touchmove') e.preventDefault();

        const { x, y } = getPos(e);
        ctx.lineTo(x, y);
        ctx.stroke();
    };

    const end = () => {
        if (isDrawingRef.current) {
            isDrawingRef.current = false;
            setIsDrawing(false);
            ctx.closePath();
            ctx.globalCompositeOperation = 'source-over';
        }
    };

    // Attach native listeners with { passive: false } to prevent scrolling
    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('touchstart', start, { passive: false });
    
    window.addEventListener('mousemove', move);
    window.addEventListener('touchmove', move, { passive: false });
    
    window.addEventListener('mouseup', end);
    window.addEventListener('touchend', end);

    return () => {
        canvas.removeEventListener('mousedown', start);
        canvas.removeEventListener('touchstart', start);
        window.removeEventListener('mousemove', move);
        window.removeEventListener('touchmove', move);
        window.removeEventListener('mouseup', end);
        window.removeEventListener('touchend', end);
    };
  }, [readOnly, width, height]); // Re-bind if dimensions change

  useImperativeHandle(ref, () => ({
    exportImage: () => {
      const canvas = canvasRef.current;
      if (!canvas) return '';
      
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const ctx = tempCanvas.getContext('2d');
      if (!ctx) return '';

      // Draw stroke layer
      ctx.drawImage(canvas, 0, 0, width, height);

      // Draw Text Elements
      ctx.font = '16px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = '#dc2626';
      ctx.textBaseline = 'top';
      
      textElements.forEach(el => {
        const lines = el.text.split('\n');
        lines.forEach((line, i) => {
             ctx.fillText(line, el.x + 4, el.y + 4 + (i * 24)); 
        });
      });

      return tempCanvas.toDataURL('image/png');
    },
    clear: () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        saveState();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setTextElements([]); 
      }
    }
  }));

  const saveState = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      setHistory(prev => [...prev.slice(-10), ctx.getImageData(0, 0, canvas.width, canvas.height)]);
    }
  };

  const undo = () => {
    if (history.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      const lastState = history[history.length - 1];
      ctx.putImageData(lastState, 0, 0);
      setHistory(prev => prev.slice(0, -1));
    }
  };

  // --- Text Logic ---
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (readOnly || tool !== 'text') return;
    if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    const newText: TextElement = {
      id: Date.now().toString(),
      x: offsetX,
      y: offsetY,
      text: ''
    };
    setTextElements(prev => [...prev, newText]);
  };

  const updateText = (id: string, newText: string) => {
    setTextElements(prev => prev.map(t => t.id === id ? { ...t, text: newText } : t));
  };

  const deleteText = (id: string) => {
    setTextElements(prev => prev.filter(t => t.id !== id));
  };

  const startDragText = (e: React.MouseEvent | React.TouchEvent, id: string) => {
    e.stopPropagation(); 
    if(readOnly) return;
    setDraggedTextId(id);
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
        if (!draggedTextId || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = (e as MouseEvent).clientX;
            clientY = (e as MouseEvent).clientY;
        }
        setTextElements(prev => prev.map(t => t.id === draggedTextId ? { ...t, x: clientX - rect.left, y: clientY - rect.top } : t));
    };
    const handleUp = () => setDraggedTextId(null);

    if (draggedTextId) {
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('touchmove', handleMove);
        window.addEventListener('mouseup', handleUp);
        window.addEventListener('touchend', handleUp);
    }
    return () => {
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('touchmove', handleMove);
        window.removeEventListener('mouseup', handleUp);
        window.removeEventListener('touchend', handleUp);
    };
  }, [draggedTextId]);

  return (
    <div 
      className="relative group select-none overflow-hidden bg-transparent" 
      style={{ width, height, touchAction: 'none' }}
    >
      {backgroundImage && (
        <img 
          src={backgroundImage} 
          alt="background" 
          className="absolute top-0 left-0 w-full h-full object-contain -z-10 pointer-events-none opacity-80"
        />
      )}

      {textElements.map(el => (
         <div
           key={el.id}
           className="absolute z-10"
           style={{ left: el.x, top: el.y }}
         >
           <div className="relative group/text">
             {!readOnly && (
               <div 
                  className="text-dragger absolute -top-6 -left-2 bg-white/90 shadow rounded px-2 py-0.5 cursor-move flex items-center gap-2 border border-gray-200"
                  onMouseDown={(e) => startDragText(e, el.id)}
                  onTouchStart={(e) => startDragText(e, el.id)}
               >
                  <Move size={12} className="text-gray-500" />
                  <Trash2 size={12} className="text-red-500 cursor-pointer hover:scale-110" onClick={(e) => { e.stopPropagation(); deleteText(el.id); }} />
               </div>
             )}
             <textarea
               value={el.text}
               placeholder="输入"
               onChange={(e) => updateText(el.id, e.target.value)}
               readOnly={readOnly}
               className={`bg-transparent text-red-600 font-sans text-base p-1 outline-none resize-none overflow-hidden border border-transparent ${!readOnly ? 'hover:border-dashed hover:border-red-300 focus:border-red-500 bg-white/50' : ''}`}
               style={{ 
                   width: Math.max(120, el.text.length * 16) + 'px', 
                   minHeight: '30px',
                   height: 'auto',
                   lineHeight: '24px'
               }}
               rows={Math.max(1, el.text.split('\n').length)}
               onClick={(e) => e.stopPropagation()} 
               onMouseDown={(e) => e.stopPropagation()} // Prevent firing canvas mousedown
               onTouchStart={(e) => e.stopPropagation()}
             />
           </div>
         </div>
      ))}

      <canvas
        ref={canvasRef}
        className={`absolute inset-0 z-0 ${readOnly ? 'cursor-default' : tool === 'text' ? 'cursor-text' : 'cursor-crosshair'}`}
        onClick={handleCanvasClick}
      />

      {!readOnly && (
        <div className="fixed bottom-10 right-4 flex flex-col gap-2 bg-white p-2 rounded-xl shadow-2xl border border-gray-200 z-[9999]">
          <button 
            onClick={() => setTool('pen')}
            className={`p-3 rounded-xl transition-colors ${tool === 'pen' ? 'bg-blue-100 text-blue-600 shadow-inner' : 'hover:bg-gray-100 text-gray-500'}`}
            title="画笔"
          >
            <Pencil size={20} />
          </button>
          <button 
            onClick={() => setTool('text')}
            className={`p-3 rounded-xl transition-colors ${tool === 'text' ? 'bg-blue-100 text-blue-600 shadow-inner' : 'hover:bg-gray-100 text-gray-500'}`}
            title="文本框"
          >
            <TypeIcon size={20} />
          </button>
          <button 
            onClick={() => setTool('eraser')}
            className={`p-3 rounded-xl transition-colors ${tool === 'eraser' ? 'bg-gray-200 text-gray-800 shadow-inner' : 'hover:bg-gray-100 text-gray-500'}`}
            title="橡皮擦"
          >
            <Eraser size={20} />
          </button>
          <div className="h-px bg-gray-200 my-1"></div>
          <button 
            onClick={undo}
            className="p-3 rounded-xl hover:bg-gray-100 text-gray-500"
            title="撤销"
          >
            <Undo size={20} />
          </button>
          <button 
            onClick={() => {
               const ctx = canvasRef.current?.getContext('2d');
               if (ctx && canvasRef.current) {
                 saveState();
                 ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                 setTextElements([]);
               }
            }}
            className="p-3 rounded-xl hover:bg-red-50 text-red-500"
            title="清空"
          >
            <Trash2 size={20} />
          </button>
        </div>
      )}
    </div>
  );
});

export default DrawingCanvas;