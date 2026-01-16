import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { analyzeBatchQuestions } from '../services/geminiService';
import { saveQuestion } from '../services/storageService';
import { Question, QuestionCategory } from '../types';
import { SUB_CATEGORY_MAP } from '../constants';
import { ArrowLeft, Upload, FileText, Loader2, CheckCircle2, AlertCircle, Save, Trash2, X, ChevronRight, ChevronLeft } from 'lucide-react';

const BatchImport = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<'upload' | 'review'>('upload');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Data
  const [parsedQuestions, setParsedQuestions] = useState<Partial<Question>[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fileInfo, setFileInfo] = useState<{name: string, type: string} | null>(null);

  // File Handler
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.includes('pdf') && !file.type.includes('image')) {
        setError('仅支持 PDF 文件或图片');
        return;
    }

    setLoading(true);
    setFileInfo({ name: file.name, type: file.type });
    setError('');

    const reader = new FileReader();
    reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        const base64Data = base64.split(',')[1];
        
        try {
            const results = await analyzeBatchQuestions(base64Data, file.type);
            if (results && results.length > 0) {
                // Initialize internal state for each
                const mapped = results.map((q: any) => ({
                    ...q,
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                    createdAt: Date.now(),
                    accuracy: q.accuracySuggestion || 60,
                    correctAnswer: q.answerIndex >= 0 ? q.answerIndex : 0,
                    options: q.options && q.options.length === 4 ? q.options : ["", "", "", ""],
                    materials: [], // Cannot easily crop from PDF client-side without libs
                    notesImage: '',
                    mistakeCount: 0, // Initialize to 0
                    correctCount: 0, // Initialize to 0
                    tags: q.tags || []
                }));
                setParsedQuestions(mapped);
                setStep('review');
            } else {
                setError('未能识别出有效题目，请确保文件清晰。');
            }
        } catch (err) {
            console.error(err);
            setError('识别过程发生错误，请重试。');
        } finally {
            setLoading(false);
        }
    };
    reader.readAsDataURL(file);
  };

  const updateCurrentQuestion = (field: string, value: any) => {
      setParsedQuestions(prev => {
          const clone = [...prev];
          clone[currentIndex] = { ...clone[currentIndex], [field]: value };
          return clone;
      });
  };

  const deleteCurrentQuestion = () => {
      if (window.confirm('确定要移除这道题吗？')) {
          setParsedQuestions(prev => {
              const clone = prev.filter((_, i) => i !== currentIndex);
              if (clone.length === 0) {
                  setStep('upload');
                  return [];
              }
              return clone;
          });
          if (currentIndex >= parsedQuestions.length - 1) {
              setCurrentIndex(Math.max(0, parsedQuestions.length - 2));
          }
      }
  };

  const handleSaveAll = async () => {
      if (window.confirm(`确定导入这 ${parsedQuestions.length} 道题目吗？`)) {
          setLoading(true);
          try {
              for (const q of parsedQuestions) {
                  // Ensure mandatory fields
                  const finalQ: Question = {
                      id: q.id!,
                      createdAt: Date.now(),
                      materials: q.materials || [],
                      materialText: q.materialText || '',
                      stem: q.stem || '未识别题干',
                      options: q.options || [],
                      correctAnswer: q.correctAnswer || 0,
                      accuracy: q.accuracy || 60,
                      category: q.category as QuestionCategory || QuestionCategory.COMMON_SENSE,
                      subCategory: q.subCategory || '',
                      tags: q.tags || [],
                      mistakeCount: 0,
                      correctCount: 0,
                      noteText: '',
                      notesImage: ''
                  };
                  await saveQuestion(finalQ);
              }
              navigate('/questions');
          } catch(e) {
              console.error(e);
              alert('导入部分失败，请查看控制台');
          } finally {
              setLoading(false);
          }
      }
  };

  const q = parsedQuestions[currentIndex];

  return (
    <div className="max-w-5xl mx-auto h-[calc(100vh-100px)] flex flex-col">
        <div className="flex items-center justify-between mb-6 flex-shrink-0">
            <button onClick={() => navigate('/questions')} className="flex items-center text-slate-500 hover:text-slate-800">
                <ArrowLeft className="mr-2" size={20} /> 返回题库
            </button>
            <h1 className="text-xl font-bold text-slate-800">批量导入 (PDF/长图)</h1>
            <div className="w-20"></div>
        </div>

        {step === 'upload' && (
            <div className="flex-1 flex items-center justify-center">
                <div className="bg-white p-10 rounded-3xl shadow-sm border border-dashed border-blue-200 text-center max-w-lg w-full hover:border-blue-400 transition-colors relative">
                    {loading ? (
                        <div className="py-12">
                            <Loader2 className="animate-spin mx-auto text-blue-500 mb-4" size={48} />
                            <p className="text-lg font-bold text-slate-700">正在智能识别中...</p>
                            <p className="text-sm text-slate-400 mt-2">AI 正在分析文件中的题目，请稍候</p>
                        </div>
                    ) : (
                        <>
                            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
                                <Upload size={32} className="text-blue-500" />
                            </div>
                            <h2 className="text-xl font-bold text-slate-800 mb-2">点击或拖拽上传文件</h2>
                            <p className="text-slate-500 mb-8">支持 PDF 文档或长图片，AI 将自动拆分识别</p>
                            
                            <label className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-blue-200 cursor-pointer hover:bg-blue-700 transition-transform active:scale-95 inline-block">
                                选择文件
                                <input type="file" className="hidden" accept=".pdf,image/*" onChange={handleFileChange} />
                            </label>
                            
                            {error && (
                                <div className="mt-6 p-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-center justify-center">
                                    <AlertCircle size={16} className="mr-2" /> {error}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        )}

        {step === 'review' && q && (
            <div className="flex-1 flex gap-6 overflow-hidden">
                {/* Left Sidebar - List */}
                <div className="w-64 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col flex-shrink-0">
                    <div className="p-4 border-b border-gray-50 font-bold text-slate-700 flex justify-between items-center">
                        <span>识别结果 ({parsedQuestions.length})</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {parsedQuestions.map((item, idx) => (
                            <button
                                key={idx}
                                onClick={() => setCurrentIndex(idx)}
                                className={`w-full text-left p-3 rounded-xl text-sm transition-colors border ${
                                    currentIndex === idx 
                                    ? 'bg-blue-50 border-blue-200 text-blue-700 font-medium' 
                                    : 'bg-white border-transparent hover:bg-gray-50 text-slate-600'
                                }`}
                            >
                                <div className="line-clamp-1 mb-1">题目 {idx + 1}</div>
                                <div className="line-clamp-1 text-xs text-slate-400">{item.category}</div>
                            </button>
                        ))}
                    </div>
                    <div className="p-4 border-t border-gray-50">
                        <button 
                            onClick={handleSaveAll}
                            disabled={loading}
                            className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-blue-700 flex items-center justify-center"
                        >
                            {loading ? <Loader2 className="animate-spin mr-2"/> : <Save size={18} className="mr-2" />}
                            全部导入
                        </button>
                    </div>
                </div>

                {/* Main Editor Area */}
                <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                        <span className="font-bold text-lg text-slate-700">编辑第 {currentIndex + 1} 题</span>
                        <div className="flex gap-2">
                            <button 
                                onClick={deleteCurrentQuestion}
                                className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                                title="删除此题"
                            >
                                <Trash2 size={18} />
                            </button>
                            <div className="h-6 w-px bg-gray-300 mx-2 self-center"></div>
                            <button 
                                onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                                disabled={currentIndex === 0}
                                className="p-2 text-slate-500 hover:bg-white rounded-lg disabled:opacity-30"
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <button 
                                onClick={() => setCurrentIndex(Math.min(parsedQuestions.length - 1, currentIndex + 1))}
                                disabled={currentIndex === parsedQuestions.length - 1}
                                className="p-2 text-slate-500 hover:bg-white rounded-lg disabled:opacity-30"
                            >
                                <ChevronRight size={20} />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-8 space-y-6">
                        {/* Meta */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1">大类</label>
                                <select 
                                    className="w-full border-gray-200 rounded-lg p-2 bg-gray-50"
                                    value={q.category}
                                    onChange={(e) => updateCurrentQuestion('category', e.target.value)}
                                >
                                    {Object.values(QuestionCategory).map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1">小类</label>
                                <select 
                                    className="w-full border-gray-200 rounded-lg p-2 bg-gray-50"
                                    value={q.subCategory}
                                    onChange={(e) => updateCurrentQuestion('subCategory', e.target.value)}
                                >
                                    <option value="">请选择...</option>
                                    {q.category && SUB_CATEGORY_MAP[q.category as QuestionCategory]?.map(sc => (
                                        <option key={sc} value={sc}>{sc}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Material Text */}
                        <div>
                            <label className="block text-xs font-bold text-slate-400 mb-1">材料文本 (可选)</label>
                            <textarea 
                                className="w-full border-gray-200 rounded-lg p-3 text-sm h-20 focus:ring-2 focus:ring-blue-500 outline-none"
                                value={q.materialText}
                                onChange={(e) => updateCurrentQuestion('materialText', e.target.value)}
                                placeholder="资料分析等长篇材料..."
                            />
                        </div>

                        {/* Stem */}
                        <div>
                            <label className="block text-xs font-bold text-slate-400 mb-1">题干</label>
                            <textarea 
                                className="w-full border-gray-200 rounded-lg p-3 text-base h-24 focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                                value={q.stem}
                                onChange={(e) => updateCurrentQuestion('stem', e.target.value)}
                            />
                        </div>

                        {/* Options */}
                        <div className="space-y-3">
                            <label className="block text-xs font-bold text-slate-400">选项</label>
                            {q.options?.map((opt, i) => (
                                <div key={i} className="flex items-center">
                                    <button 
                                        onClick={() => updateCurrentQuestion('correctAnswer', i)}
                                        className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 font-bold flex-shrink-0 transition-colors ${q.correctAnswer === i ? 'bg-green-500 text-white' : 'bg-gray-100 text-slate-400 hover:bg-gray-200'}`}
                                    >
                                        {String.fromCharCode(65 + i)}
                                    </button>
                                    <input 
                                        type="text" 
                                        className="flex-1 border-gray-200 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={opt}
                                        onChange={(e) => {
                                            const newOpts = [...(q.options || [])];
                                            newOpts[i] = e.target.value;
                                            updateCurrentQuestion('options', newOpts);
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                        
                        <div className="p-4 bg-amber-50 rounded-lg text-amber-800 text-sm flex items-start">
                            <AlertCircle size={16} className="mr-2 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="font-bold">注意</p>
                                <p>批量导入无法自动截取每道题的特定图片。如需添加图片，请在导入后进入单题编辑页面补充。</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default BatchImport;