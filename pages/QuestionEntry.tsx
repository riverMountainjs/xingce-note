
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Question, QuestionCategory } from '../types';
import { SUB_CATEGORY_MAP } from '../constants';
import { getQuestions, saveQuestion, hydrateQuestion } from '../services/storageService';
import { analyzeQuestionImage } from '../services/geminiService';
import RichTextEditor from '../components/RichTextEditor';
import { ArrowLeft, Loader2, Save, Sparkles, FileImage, AlignLeft, Calendar, Tag, Target, PenTool, Type, Plus, X, Image as ImageIcon, CheckCircle2, AlertCircle, Clipboard, Hash, BookMarked, Layers, Check, RefreshCw, Radio } from 'lucide-react';

// Helper to get local time string
const getLocalDateTimeString = (timestamp?: number) => {
    const date = timestamp ? new Date(timestamp) : new Date();
    const offset = date.getTimezoneOffset() * 60000;
    const localDate = new Date(date.getTime() - offset);
    return localDate.toISOString().slice(0, 16);
};

const QuestionEntry = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(false);
  const [loadingImages, setLoadingImages] = useState(false);
  const [aiStatus, setAiStatus] = useState<'idle' | 'analyzing' | 'success' | 'error'>('idle');
  const [aiErrorMessage, setAiErrorMessage] = useState('');
  const [tempAnalysisImage, setTempAnalysisImage] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  
  // UI States
  const [showSavedFeedback, setShowSavedFeedback] = useState(false);
  
  // Tags input state
  const [tagInput, setTagInput] = useState('');

  // 记录上一次处理的导入ID，防止重复处理
  const lastImportIdRef = useRef<number | null>(null);

  const [formData, setFormData] = useState<Partial<Question>>({
    category: QuestionCategory.COMMON_SENSE,
    subCategory: '',
    tags: [],
    options: ['', '', '', ''],
    accuracy: 60,
    stem: '',
    materialText: '',
    materials: [],
    correctAnswer: 0,
    noteText: '',
    notesImage: '',
    createdAt: Date.now(),
    mistakeCount: 0,
    correctCount: 0
  });

  const [dateString, setDateString] = useState(getLocalDateTimeString());

  // --- Listener for External Import (Tampermonkey/Fenbi) ---
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const { type, payload } = event.data || {};

      if (type === 'FENBI_IMPORT') {
        // 防抖：检查是否处理过这个 ID
        if (payload.importId && payload.importId === lastImportIdRef.current) {
            console.log("Ignored duplicate import:", payload.importId);
            return;
        }
        if (payload.importId) {
            lastImportIdRef.current = payload.importId;
        }

        console.log("收到粉笔导入数据:", payload);
        
        setFormData(prev => {
          // Merge logic: If stem has images (in materials), combine with existing
          const newMaterials = [...(prev.materials || [])];
          if (payload.materials && Array.isArray(payload.materials)) {
             payload.materials.forEach((m: string) => {
                 if (!newMaterials.includes(m)) newMaterials.push(m);
             });
          }

          return {
            ...prev,
            stem: payload.stem || prev.stem,
            options: (payload.options && payload.options.length === 4) ? payload.options : prev.options,
            correctAnswer: payload.correctAnswer !== undefined ? payload.correctAnswer : prev.correctAnswer,
            // 智能合并解析
            noteText: payload.analysis ? 
                (prev.noteText ? prev.noteText + `<br/><hr/><p><strong>【粉笔解析】</strong></p>${payload.analysis}` : `<p><strong>【粉笔解析】</strong></p>${payload.analysis}`) 
                : prev.noteText,
            category: Object.values(QuestionCategory).includes(payload.category) ? payload.category : QuestionCategory.COMMON_SENSE,
            subCategory: payload.subCategory || prev.subCategory,
            tags: payload.tags ? [...new Set([...(prev.tags || []), ...payload.tags])] : prev.tags,
            materials: newMaterials,
            materialText: payload.materialText ? (prev.materialText + '\n' + payload.materialText).trim() : prev.materialText,
            accuracy: payload.accuracy || prev.accuracy,
          };
        });

        // 稍微延迟一点弹窗，避免UI渲染竞争
        setTimeout(() => {
            alert("✅ 题目导入成功！\n请检查分类、选项和解析是否正确。");
        }, 100);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    const load = async () => {
        if (id) {
            setLoadingImages(true);
            try {
                const allQuestions = await getQuestions();
                let q = allQuestions.find(q => q.id === id);
                if (q) {
                    if (q.materials.includes('__IMAGE_REF__') || q.notesImage === '__IMAGE_REF__') {
                        q = await hydrateQuestion(q);
                    }
                    setFormData(q);
                    setDateString(getLocalDateTimeString(q.createdAt));
                }
            } finally {
                setLoadingImages(false);
            }
        } else if (location.state?.preserved) {
             const p = location.state.preserved;
             setFormData(prev => ({
                 ...prev,
                 category: p.category || prev.category,
                 subCategory: p.subCategory || prev.subCategory,
                 tags: p.tags || prev.tags,
                 accuracy: p.accuracy || prev.accuracy,
                 createdAt: Date.now()
             }));
             setDateString(getLocalDateTimeString());
        }
    };
    load();
  }, [id, location.state]);

  const processAnalysisImage = (file: File) => {
    setLastFile(file);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      setTempAnalysisImage(base64);
      setAiStatus('analyzing');
      setAiErrorMessage('');
      
      try {
        const base64Data = base64.split(',')[1];
        const result = await analyzeQuestionImage(base64Data, file.type);
        
        setFormData(prev => ({
            ...prev,
            stem: result.stem || prev.stem,
            materialText: result.materialText || prev.materialText,
            options: result.options && result.options.length === 4 ? result.options : prev.options,
            category: Object.values(QuestionCategory).includes(result.category as QuestionCategory) 
                    ? result.category as QuestionCategory 
                    : prev.category,
            subCategory: result.subCategory || prev.subCategory,
            tags: result.tags || prev.tags,
            accuracy: result.accuracySuggestion || prev.accuracy,
            correctAnswer: result.answerIndex >= 0 ? result.answerIndex : prev.correctAnswer
        }));
        setAiStatus('success');
      } catch (err: any) {
        setAiStatus('error');
        setAiErrorMessage(err.message || "解析失败，请检查网络或 API 配额");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRetry = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (lastFile) processAnalysisImage(lastFile);
  };

  const handleSave = async (redirect: boolean = true) => {
    if (!formData.stem?.trim()) { alert("请填写题干内容"); return; }
    if (formData.options?.some(opt => !opt.trim())) { alert("请完整填写4个选项"); return; }

    setLoading(true);
    try {
        const newQuestion: Question = {
            id: (redirect && id) ? id : Date.now().toString(),
            createdAt: formData.createdAt || Date.now(),
            materials: formData.materials || [],
            materialText: formData.materialText || '',
            stem: formData.stem || '',
            options: formData.options || [],
            correctAnswer: formData.correctAnswer || 0,
            accuracy: formData.accuracy || 60,
            category: formData.category || QuestionCategory.COMMON_SENSE,
            subCategory: formData.subCategory || '',
            tags: formData.tags || [],
            mistakeCount: formData.mistakeCount || 0,
            correctCount: formData.correctCount || 0,
            noteText: formData.noteText || '', 
            notesImage: ''
        };

        await saveQuestion(newQuestion);
        
        if (redirect) {
            navigate('/questions');
        } else {
            if (id) {
                navigate('/add', { 
                    replace: true, 
                    state: { 
                        preserved: { 
                            category: formData.category,
                            subCategory: formData.subCategory,
                            tags: formData.tags,
                            accuracy: formData.accuracy
                        }
                    } 
                });
            } else {
                setFormData(prev => ({
                    ...prev,
                    stem: '',
                    options: ['', '', '', ''],
                    materials: [],
                    materialText: '', 
                    correctAnswer: 0,
                    noteText: '',
                    mistakeCount: 0,
                    correctCount: 0,
                    notesImage: '',
                    createdAt: Date.now()
                }));
                setTempAnalysisImage(null);
                setAiStatus('idle');
                setAiErrorMessage('');
                setDateString(getLocalDateTimeString());
                setShowSavedFeedback(true);
                setTimeout(() => setShowSavedFeedback(false), 2000);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
    } catch (e) {
        alert("保存失败");
    } finally {
        setLoading(false);
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
            if (item.types.some(type => type.startsWith('image/'))) {
                const blob = await item.getType(item.types.find(type => type.startsWith('image/'))!);
                const file = new File([blob], "pasted-image.png", { type: blob.type });
                processAnalysisImage(file);
                return;
            }
        }
    } catch (err) { alert("无法访问剪贴板"); }
  };

  const handlePasteToMaterials = async () => {
    try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
            if (item.types.some(type => type.startsWith('image/'))) {
                const blob = await item.getType(item.types.find(type => type.startsWith('image/'))!);
                const file = new File([blob], "pasted-material.png", { type: blob.type });
                addReferenceImage(file);
                return;
            }
        }
    } catch (err) { alert("无法访问剪贴板"); }
  };

  const addReferenceImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setFormData(prev => ({ ...prev, materials: [...(prev.materials || []), base64] }));
    };
    reader.readAsDataURL(file);
  };

  const removeReferenceImage = (index: number) => {
      setFormData(prev => ({ ...prev, materials: (prev.materials || []).filter((_, i) => i !== index) }));
  };

  const addTag = () => {
      if (tagInput.trim() && !formData.tags?.includes(tagInput.trim())) {
          setFormData(prev => ({ ...prev, tags: [...(prev.tags || []), tagInput.trim()] }));
          setTagInput('');
      }
  };

  const removeTag = (tag: string) => {
      setFormData(prev => ({ ...prev, tags: (prev.tags || []).filter(t => t !== tag) }));
  };

  if (loadingImages) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-blue-500" /></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
       <div className="flex items-center justify-between sticky top-0 bg-gray-50 z-20 py-4 border-b border-gray-200 gap-2">
        <button onClick={() => navigate(-1)} className="flex items-center text-slate-500 hover:text-slate-800 flex-shrink-0">
          <ArrowLeft className="mr-1 sm:mr-2" size={20} /> <span className="hidden sm:inline">返回</span>
        </button>
        <div className="flex flex-col items-center flex-1 overflow-hidden">
            <h1 className="text-lg sm:text-xl font-bold text-slate-800 truncate w-full text-center">{id ? '编辑错题' : '录入新错题'}</h1>
            {!id && <span className="text-[10px] text-blue-500 font-medium animate-pulse">支持从粉笔插件一键导入</span>}
        </div>
        
        <div className="flex gap-2">
            <button 
              onClick={() => handleSave(false)}
              disabled={loading}
              className={`border border-blue-200 px-3 sm:px-4 py-2 rounded-xl flex items-center shadow-sm transition-all disabled:opacity-50 text-sm font-bold ${showSavedFeedback ? 'bg-green-600 text-white border-green-600' : 'bg-white text-blue-600 hover:bg-blue-50'}`}
              title="保存当前题目并清空内容，保留分类信息以便继续录入"
            >
              {loading ? <Loader2 className="animate-spin sm:mr-2" size={16} /> : showSavedFeedback ? <Check size={16} className="sm:mr-2" /> : <Layers size={16} className="sm:mr-2" />}
              <span className="hidden sm:inline">{showSavedFeedback ? '已保存！' : '保存并录下一题'}</span>
              <span className="inline sm:hidden">{showSavedFeedback ? '已存' : '存&录'}</span>
            </button>
            <button 
              onClick={() => handleSave(true)}
              disabled={loading}
              className="bg-blue-600 text-white px-3 sm:px-6 py-2 rounded-xl flex items-center shadow-lg hover:bg-blue-700 transition-all disabled:opacity-50 text-sm font-bold"
            >
              {loading ? <Loader2 className="animate-spin sm:mr-2" size={18} /> : <Save size={18} className="sm:mr-2" />}
              <span className="hidden sm:inline">保存</span>
            </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
             <h3 className="font-bold text-slate-700 flex items-center">
                <span className="flex items-center text-blue-600"><Sparkles size={18} className="mr-2" /> 智能识别区</span>
            </h3>
            <button onClick={handlePasteFromClipboard} className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-lg flex items-center hover:bg-blue-100">
                <Clipboard size={14} className="mr-1" /> 从剪贴板粘贴
            </button>
        </div>
        
        <div 
            className={`border-2 border-dashed rounded-xl min-h-[160px] flex flex-col items-center justify-center transition-colors relative cursor-pointer overflow-hidden group 
                ${aiStatus === 'error' ? 'border-red-200 bg-red-50' : 'border-blue-200 bg-blue-50/50 hover:bg-blue-50'}
            `}
            onPaste={(e) => {
                const items = e.clipboardData.items;
                for (let i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf('image') !== -1) {
                        const file = items[i].getAsFile();
                        if(file) processAnalysisImage(file);
                        e.preventDefault();
                    }
                }
            }}
        >
            {tempAnalysisImage && aiStatus !== 'analyzing' ? (
                <div className="relative w-full h-auto min-h-[200px] flex flex-col justify-center items-center bg-gray-100 p-4">
                    <img src={tempAnalysisImage} className="max-h-64 object-contain transition-opacity opacity-60" alt="Analyzed" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                        {aiStatus === 'success' && (
                            <span className="bg-green-100 text-green-700 px-4 py-2 rounded-full text-sm font-bold shadow-md flex items-center">
                                <CheckCircle2 size={16} className="mr-2"/> 识别并填充成功
                            </span>
                        )}
                        {aiStatus === 'error' && (
                            <div className="flex flex-col items-center gap-3">
                                <span className="bg-red-100 text-red-700 px-4 py-2 rounded-xl text-sm font-bold shadow-md flex items-center flex-wrap justify-center">
                                    <AlertCircle size={16} className="mr-2 flex-shrink-0"/> {aiErrorMessage}
                                </span>
                                <button 
                                    onClick={handleRetry}
                                    className="bg-white text-slate-700 border border-gray-200 px-4 py-2 rounded-full text-xs font-bold shadow-sm hover:bg-gray-50 flex items-center transition-all active:scale-95"
                                >
                                    <RefreshCw size={14} className="mr-2" /> 重新识别
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            ) : aiStatus === 'analyzing' ? (
                <div className="flex flex-col items-center text-blue-600">
                     <Loader2 className="animate-spin mb-2" size={32} />
                     <span className="font-bold">AI 正在深度分析题目...</span>
                     <span className="text-xs text-blue-400 mt-1">预计需要 3-5 秒</span>
                </div>
            ) : (
                <>
                <FileImage size={48} className="text-blue-200 mb-2 group-hover:scale-110 transition-transform"/>
                <p className="font-medium text-blue-400">点击、拖拽或粘贴题目截图</p>
                <p className="text-xs text-blue-300 mt-1">自动识别题干、选项、分类与考点</p>
                </>
            )}
            <input type="file" onChange={(e) => e.target.files?.[0] && processAnalysisImage(e.target.files[0])} className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" />
        </div>
      </div>

      <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-100 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">大类</label>
                <select 
                  className="w-full border-gray-200 rounded-lg focus:ring-blue-500 focus:border-blue-500 py-2.5 bg-gray-50"
                  value={formData.category}
                  onChange={(e) => {
                      const newCat = e.target.value as QuestionCategory;
                      setFormData({...formData, category: newCat, subCategory: SUB_CATEGORY_MAP[newCat][0]});
                  }}
                >
                  {Object.values(QuestionCategory).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
             </div>
             <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">小类</label>
                <select 
                  className="w-full border-gray-200 rounded-lg focus:ring-blue-500 focus:border-blue-500 py-2.5 bg-gray-50"
                  value={formData.subCategory}
                  onChange={(e) => setFormData({...formData, subCategory: e.target.value})}
                >
                  <option value="">请选择...</option>
                  {formData.category && SUB_CATEGORY_MAP[formData.category]?.map(sc => <option key={sc} value={sc}>{sc}</option>)}
                </select>
             </div>
             <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center"><Tag size={14} className="mr-1" /> 考点标签</label>
                <div className="flex flex-wrap gap-2 mb-2">
                    {formData.tags?.map(tag => (
                        <span key={tag} className="bg-blue-50 text-blue-600 px-2 py-1 rounded text-sm flex items-center">{tag}<button onClick={() => removeTag(tag)} className="ml-1 hover:text-red-500"><X size={12}/></button></span>
                    ))}
                </div>
                <div className="flex gap-2">
                    <input type="text" className="flex-1 border-gray-200 rounded-lg focus:ring-blue-500 focus:border-blue-500 py-2 px-3" placeholder="输入考点后回车" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTag()} />
                    <button onClick={addTag} className="bg-gray-100 text-slate-600 px-3 py-2 rounded-lg hover:bg-gray-200"><Plus size={18} /></button>
                </div>
             </div>
             <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center"><Calendar size={14} className="mr-1" /> 录入时间</label>
                <input type="datetime-local" className="w-full border-gray-200 rounded-lg focus:ring-blue-500 focus:border-blue-500 py-2 px-3 text-sm" value={dateString} onChange={(e) => { setDateString(e.target.value); const date = new Date(e.target.value); if (!isNaN(date.getTime())) setFormData({...formData, createdAt: date.getTime()}); }} />
             </div>
             <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center"><Target size={14} className="mr-1" /> 全站正确率 (%)</label>
                <input type="number" min="0" max="100" className="w-full border-gray-200 rounded-lg focus:ring-blue-500 focus:border-blue-500 py-2 px-3" value={formData.accuracy} onChange={(e) => setFormData({...formData, accuracy: parseInt(e.target.value) || 0})} />
             </div>
          </div>

          <hr className="border-gray-100" />

          <div>
            <h4 className="font-bold text-slate-700 mb-4 flex items-center"><AlignLeft size={18} className="mr-2" /> 题目材料</h4>
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">文本材料</label>
                    <textarea className="w-full border-gray-200 rounded-lg h-24 focus:ring-blue-500 focus:border-blue-500 p-3 text-sm" value={formData.materialText} onChange={(e) => setFormData({...formData, materialText: e.target.value})} placeholder="例如资料分析的长篇材料..." />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-2 flex justify-between items-center"><span>图片材料</span><button onClick={handlePasteToMaterials} className="text-xs text-blue-600 flex items-center hover:bg-blue-50 px-2 py-1 rounded"><Clipboard size={12} className="mr-1"/> 粘贴</button></label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {formData.materials?.map((img, idx) => (
                            <div key={idx} className="relative group rounded-lg border border-gray-200 overflow-hidden bg-gray-50 aspect-square flex items-center justify-center">
                                {img === '__IMAGE_REF__' ? <Loader2 className="animate-spin text-gray-300"/> : <img src={img} className="max-w-full max-h-full object-contain" alt="Ref" />}
                                <button onClick={() => removeReferenceImage(idx)} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"><X size={12} /></button>
                            </div>
                        ))}
                        <div className="aspect-square rounded-lg border-2 border-dashed border-gray-200 hover:border-blue-300 hover:bg-blue-50 flex flex-col items-center justify-center cursor-pointer relative"><Plus size={24} className="text-gray-400" /><input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => e.target.files?.[0] && addReferenceImage(e.target.files[0])} /></div>
                    </div>
                </div>
            </div>
          </div>

          <hr className="border-gray-100" />

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">题干内容</label>
            <textarea className="w-full border-gray-200 rounded-lg h-24 focus:ring-blue-500 focus:border-blue-500 p-3 text-lg" value={formData.stem} onChange={(e) => setFormData({...formData, stem: e.target.value})} placeholder="题目描述..." />
          </div>

          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">选项设置</label>
            {formData.options?.map((opt, idx) => (
              <div key={idx} className="flex items-center group">
                <span className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 font-bold transition-colors ${formData.correctAnswer === idx ? 'bg-green-500 text-white' : 'bg-gray-100 text-slate-500'}`}>{String.fromCharCode(65 + idx)}</span>
                
                <div className="flex-1 mr-2">
                    {opt.startsWith('http') || opt.startsWith('data:image') ? (
                        <div className="relative group/img w-full">
                           <img src={opt} className="h-12 object-contain border border-gray-200 rounded p-1 bg-white" alt={`Option ${idx}`} />
                           <input 
                              type="text" 
                              className="absolute inset-0 opacity-0 group-hover/img:opacity-100 bg-white/90 border-blue-500 px-2 text-sm" 
                              value={opt}
                              onChange={(e) => { const newOpts = [...(formData.options || [])]; newOpts[idx] = e.target.value; setFormData({...formData, options: newOpts}); }}
                           />
                        </div>
                    ) : (
                        <input type="text" className="w-full border-gray-200 rounded-lg focus:ring-blue-500 focus:border-blue-500 py-2 px-3 text-lg" value={opt} placeholder={`选项 ${String.fromCharCode(65 + idx)}`} onChange={(e) => { const newOpts = [...(formData.options || [])]; newOpts[idx] = e.target.value; setFormData({...formData, options: newOpts}); }} />
                    )}
                </div>

                <label className="ml-3 flex items-center cursor-pointer text-sm text-slate-500 hover:text-green-600"><input type="radio" name="correctAnswer" className="mr-1 text-green-600" checked={formData.correctAnswer === idx} onChange={() => setFormData({...formData, correctAnswer: idx})} /> 正确答案</label>
              </div>
            ))}
          </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-100 px-6 py-3 flex items-center gap-4">
              <h3 className="font-bold text-slate-700 flex items-center"><BookMarked size={18} className="mr-2"/> 我的笔记</h3>
          </div>
          <div className="p-6">
              <RichTextEditor key={id || 'new'} value={formData.noteText || ''} onChange={(html) => setFormData({...formData, noteText: html})} />
          </div>
      </div>
    </div>
  );
};

export default QuestionEntry;
