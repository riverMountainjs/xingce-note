
import React, { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getQuestions, saveSession, saveQuestion, hydrateQuestion } from '../services/storageService';
import { Question, QuestionCategory, PracticeSession, SessionDetail } from '../types';
import { SUB_CATEGORY_MAP } from '../constants';
import DrawingCanvas, { DrawingCanvasRef } from '../components/DrawingCanvas';
import { ChevronRight, ChevronLeft, PenTool, Timer, X, Check, GripHorizontal, Filter, GraduationCap, Loader2, ImageIcon, ChevronDown, ChevronUp, Clock, CheckCircle2, XCircle, HelpCircle, BookOpen, Tag, BarChart2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

const checkDate = (timestamp: number, type: 'all' | 'today' | 'yesterday' | '3days' | 'week' | 'month') => {
    if (type === 'all') return true;
    const getBJMidnight = (ts: number) => {
        const dateStr = new Date(ts).toLocaleString('en-US', {timeZone: 'Asia/Shanghai'});
        const d = new Date(dateStr); d.setHours(0,0,0,0); return d;
    };
    const today = getBJMidnight(Date.now());
    const target = getBJMidnight(timestamp);
    const diffDays = Math.floor((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
    if (type === 'today') return diffDays === 0;
    if (type === 'yesterday') return diffDays === 1;
    if (type === '3days') return diffDays <= 2; 
    if (type === 'week') return diffDays <= 6;
    if (type === 'month') return diffDays <= 29;
    return true;
};

type ViewMode = 'setup' | 'quiz' | 'sheet_confirm' | 'sheet_result' | 'review';
type PracticeMode = 'standard' | 'recitation'; 

// Moved interface outside component to avoid scope/parsing issues
interface StatNode {
    total: number;
    correct: number;
    duration: number;
}
type StatNodeWithSubs = StatNode & { subs: Map<string, StatNode> };

const Practice = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [viewMode, setViewMode] = useState<ViewMode>('setup');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const [allQuestionsCache, setAllQuestionsCache] = useState<Question[]>([]);
  const [selectedCount, setSelectedCount] = useState<number | 'ALL'>(10);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('All');
  const [accRange, setAccRange] = useState({ min: 0, max: 100 });
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'yesterday' | '3days' | 'week' | 'month'>('today');
  const [practiceMode, setPracticeMode] = useState<PracticeMode>('standard');
  const [selectedTag, setSelectedTag] = useState<string>('');
  
  const allUniqueTags = useMemo(() => {
      const tags = new Set<string>();
      allQuestionsCache.forEach(q => q.tags?.forEach(t => tags.add(t)));
      return Array.from(tags);
  }, [allQuestionsCache]);

  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [excludedOptions, setExcludedOptions] = useState<Record<string, number[]>>({});
  const [showScratchpad, setShowScratchpad] = useState(false);
  const [showNotesInReview, setShowNotesInReview] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStarting, setIsStarting] = useState(false); 
  const [isTogglingMastered, setIsTogglingMastered] = useState(false);
  const [loadingCurrentQ, setLoadingCurrentQ] = useState(false); 
  const [isRestoring, setIsRestoring] = useState(!!location.state?.session);
  
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [questionDurations, setQuestionDurations] = useState<Record<string, number>>({});
  const lastSwitchTimeRef = useRef<number>(Date.now());
  const timerRef = useRef<number | null>(null);

  // Changed to Set to allow multiple expanded items
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<DrawingCanvasRef>(null);
  const [canvasDims, setCanvasDims] = useState({ width: 0, height: 0 });

  useEffect(() => {
      getQuestions().then(setAllQuestionsCache);
  }, []);

  useEffect(() => {
      const initSession = async () => {
          if (location.state?.session) {
              try {
                  const session = location.state.session as PracticeSession;
                  const allQuestions = await getQuestions();
                  const sessionQuestions: Question[] = [];
                  const sessionAnswers: Record<string, number> = {};
                  const sessionDurations: Record<string, number> = {};
                  
                  session.details.forEach(detail => {
                      let q = allQuestions.find(q => q.id === detail.questionId);
                      if (!q) {
                          q = { id: detail.questionId, stem: '[该题目已被删除]', options: [], correctAnswer: -1, category: QuestionCategory.COMMON_SENSE, accuracy: 0, mistakeCount: 0, createdAt: 0, materials: [] } as Question;
                      }
                      sessionQuestions.push(q);
                      sessionAnswers[q.id] = detail.userAnswer;
                      sessionDurations[q.id] = detail.duration;
                  });

                  setQuestions(sessionQuestions);
                  setAnswers(sessionAnswers);
                  setQuestionDurations(sessionDurations);
                  setTotalSeconds(session.totalDuration);
                  setViewMode('sheet_result');
              } finally {
                  setIsRestoring(false);
              }
          } else {
              setIsRestoring(false);
          }
      };
      initSession();
  }, [location.state]);

  useLayoutEffect(() => {
    if (containerRef.current) setCanvasDims({ width: containerRef.current.offsetWidth, height: containerRef.current.offsetHeight });
  }, [viewMode, showScratchpad]);

  useEffect(() => { if (canvasRef.current) canvasRef.current.clear(); }, [currentIndex]);

  useEffect(() => {
      setShowNotesInReview(false);
      const hydrateCurrent = async () => {
          if (questions.length === 0) return;
          const currentQ = questions[currentIndex];
          if (currentQ.materials.includes('__IMAGE_REF__') || currentQ.notesImage === '__IMAGE_REF__') {
              setLoadingCurrentQ(true);
              try {
                  const fullQ = await hydrateQuestion(currentQ);
                  setQuestions(prev => { const newQs = [...prev]; newQs[currentIndex] = fullQ; return newQs; });
              } finally { setLoadingCurrentQ(false); }
          }
      };
      if (viewMode === 'quiz' || viewMode === 'review') hydrateCurrent();
  }, [currentIndex, viewMode, questions.length]);

  useEffect(() => {
    const tick = () => {
        if (viewMode === 'quiz') {
            const now = Date.now();
            setTotalSeconds(s => s + 1);
            if (questions.length > 0) {
                const currentQId = questions[currentIndex].id;
                const diff = (now - lastSwitchTimeRef.current) / 1000;
                setQuestionDurations(prev => ({ ...prev, [currentQId]: (prev[currentQId] || 0) + diff }));
                lastSwitchTimeRef.current = now;
            }
        }
    };
    if (viewMode === 'quiz') { lastSwitchTimeRef.current = Date.now(); timerRef.current = window.setInterval(tick, 1000); }
    else if (timerRef.current) clearInterval(timerRef.current);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [viewMode, currentIndex, questions]);

  const startPractice = async () => {
    if (isStarting) return;
    setIsStarting(true);
    
    setTimeout(async () => {
        try {
            const all = allQuestionsCache.length > 0 ? allQuestionsCache : await getQuestions();
            let filtered = all.filter(q => selectedCategory === 'All' || q.category === selectedCategory);
            
            if (selectedSubCategory !== 'All') filtered = filtered.filter(q => q.subCategory === selectedSubCategory);
            if (selectedTag) filtered = filtered.filter(q => q.tags?.includes(selectedTag));
            
            filtered = filtered.filter(q => !q.isMastered);
            filtered = filtered.filter(q => q.accuracy >= accRange.min && q.accuracy <= accRange.max);
            filtered = filtered.filter(q => checkDate(q.createdAt, timeFilter));
            
            filtered.sort((a, b) => {
                const countA = (a.mistakeCount || 0) + (a.correctCount || 0);
                const countB = (b.mistakeCount || 0) + (b.correctCount || 0);
                return (countA - countB) || (0.5 - Math.random());
            });

            const count = selectedCount === 'ALL' ? filtered.length : selectedCount;
            filtered = filtered.slice(0, count);
            
            if (filtered.length === 0) {
                alert("该条件下没有找到可练习的错题。");
            } else {
                setQuestions(filtered);
                setCurrentIndex(0);
                setAnswers({});
                setExcludedOptions({});
                setTotalSeconds(0);
                setQuestionDurations({});
                setViewMode('quiz');
            }
        } catch(e) {
            console.error(e);
            alert("加载题库失败");
        } finally {
            setIsStarting(false);
        }
    }, 500);
  };

  const handleAnswer = (optionIdx: number) => {
    if (viewMode !== 'quiz') return; 
    setAnswers(prev => ({...prev, [questions[currentIndex].id]: optionIdx}));

    if (practiceMode === 'standard' && currentIndex < questions.length - 1) {
        setTimeout(() => { setCurrentIndex(prev => prev + 1); }, 300);
    }
  };

  const toggleMastered = async () => {
      if (isTogglingMastered) return;
      setIsTogglingMastered(true);
      try {
          const q = questions[currentIndex];
          const updatedQ = { ...q, isMastered: !q.isMastered };
          setQuestions(prev => prev.map(item => item.id === q.id ? updatedQ : item));
          await saveQuestion(updatedQ);
      } finally { setIsTogglingMastered(false); }
  };

  const handleExclude = (e: React.MouseEvent | React.TouchEvent, optionIdx: number) => {
      e.preventDefault();
      if (viewMode !== 'quiz') return;
      const qId = questions[currentIndex].id;
      const currentExcluded = excludedOptions[qId] || [];
      if (currentExcluded.includes(optionIdx)) {
          setExcludedOptions(prev => ({...prev, [qId]: currentExcluded.filter(i => i !== optionIdx)}));
      } else {
          setExcludedOptions(prev => ({...prev, [qId]: [...currentExcluded, optionIdx]}));
      }
  };

  const confirmSubmit = async () => {
      if (isSubmitting) return;
      setIsSubmitting(true);
      try {
          let score = 0;
          const details: SessionDetail[] = questions.map(q => {
              const uAns = answers[q.id];
              const isCorrect = uAns === q.correctAnswer;
              if (isCorrect) score++;
              return { questionId: q.id, userAnswer: uAns !== undefined ? uAns : -1, isCorrect, duration: questionDurations[q.id] || 0 };
          });
          const session: PracticeSession = { id: Date.now().toString(), date: Date.now(), questionIds: questions.map(q => q.id), score: Math.round((score / questions.length) * 100), totalDuration: totalSeconds, details };
          await saveSession(session);
          setViewMode('sheet_result');
      } finally { setIsSubmitting(false); }
  };

  const goToSheet = () => {
      if (viewMode === 'review') {
          setViewMode('sheet_result');
      } else if (practiceMode === 'recitation') {
          confirmSubmit();
      } else {
          setViewMode('sheet_confirm');
      }
  };

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // 仿粉笔风格的友好时间显示
  const formatTimeFriendly = (totalSeconds: number) => {
    if (totalSeconds < 60) return `${Math.floor(totalSeconds)}秒`;
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${m}分${s > 0 ? s + '秒' : ''}`;
  };

  if (isRestoring) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-slate-400"><Loader2 className="animate-spin mr-2" /> 加载记录中...</div>;

  if (viewMode === 'setup') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center p-6">
        <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-lg border border-gray-100 mt-4">
           <div className="flex justify-between items-center mb-6">
             <h1 className="text-2xl font-bold text-slate-800">开始刷题</h1>
             <button onClick={() => navigate('/')} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
           </div>
           
           <div className="bg-gray-100 p-1 rounded-xl flex mb-6">
               <button onClick={() => setPracticeMode('standard')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${practiceMode === 'standard' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>模拟考试</button>
               <button onClick={() => setPracticeMode('recitation')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${practiceMode === 'recitation' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}>背题模式</button>
           </div>

           <div className="space-y-5">
               <div>
                   <label className="text-sm font-medium text-slate-700 block mb-2">选择模块</label>
                   <select className="w-full border-gray-200 rounded-xl p-3 bg-gray-50 focus:ring-blue-500" value={selectedCategory} onChange={e => { setSelectedCategory(e.target.value); setSelectedSubCategory('All'); }}>
                       <option value="All">全部模块</option>
                       {Object.values(QuestionCategory).map(c => <option key={c} value={c}>{c}</option>)}
                   </select>
               </div>

               {selectedCategory !== 'All' && (
                   <div className="animate-fade-in">
                        <label className="text-sm font-medium text-slate-700 block mb-2">选择题型</label>
                        <select className="w-full border-gray-200 rounded-xl p-3 bg-gray-50 focus:ring-blue-500" value={selectedSubCategory} onChange={e => setSelectedSubCategory(e.target.value)}>
                            <option value="All">全部题型</option>
                            {SUB_CATEGORY_MAP[selectedCategory as QuestionCategory]?.map(sc => <option key={sc} value={sc}>{sc}</option>)}
                        </select>
                   </div>
               )}
               
               <div>
                   <label className="text-sm font-medium text-slate-700 block mb-2 flex items-center"><Tag size={14} className="mr-1"/> 按考点练习 (可选)</label>
                   <input list="tags-list" className="w-full border-gray-200 rounded-xl p-3 bg-gray-50 focus:ring-blue-500" placeholder="输入考点关键词..." value={selectedTag} onChange={(e) => setSelectedTag(e.target.value)} />
                   <datalist id="tags-list">{allUniqueTags.map(t => <option key={t} value={t} />)}</datalist>
               </div>

               <div>
                   <label className="text-sm font-medium text-slate-700 block mb-2">题目数量</label>
                   <div className="flex gap-2">
                       {[5, 10, 20, 50].map(n => (
                           <button key={n} onClick={() => setSelectedCount(n)} className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-all ${selectedCount === n ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-200 text-slate-600'}`}>{n}</button>
                       ))}
                       <button onClick={() => setSelectedCount('ALL')} className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-all ${selectedCount === 'ALL' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-200 text-slate-600'}`}>全部</button>
                   </div>
               </div>
               
               <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-4">
                  <div className="flex items-center text-xs font-bold text-slate-400 uppercase tracking-wider mb-2"><Filter size={12} className="mr-1"/> 筛选</div>
                  <div className="flex flex-wrap gap-2">
                        {[{k: 'all', l: '全部'}, {k: 'today', l: '今天'}, {k: 'yesterday', l: '昨天'}, {k: 'week', l: '近7天'}, {k: 'month', l: '近30天'}].map(opt => (
                            <button key={opt.k} onClick={() => setTimeFilter(opt.k as any)} className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${timeFilter === opt.k ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-white border-gray-200 text-slate-500'}`}>{opt.l}</button>
                        ))}
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-2">正确率: <span className="text-slate-700">{accRange.min}% - {accRange.max}%</span></label>
                    <div className="flex items-center gap-4 px-2 relative h-8">
                        <div className="absolute left-0 right-0 h-1.5 bg-gray-200 rounded-full"></div>
                        <div className="absolute h-1.5 bg-blue-500 rounded-full" style={{ left: `${accRange.min}%`, right: `${100 - accRange.max}%` }}></div>
                        <input type="range" min="0" max="100" value={accRange.min} onChange={e => setAccRange(p => ({...p, min: Math.min(Number(e.target.value), p.max - 1)}))} className="range-input z-30" />
                        <input type="range" min="0" max="100" value={accRange.max} onChange={e => setAccRange(p => ({...p, max: Math.max(Number(e.target.value), p.min + 1)}))} className="range-input z-40" />
                    </div>
                  </div>
               </div>

               <button onClick={startPractice} disabled={isStarting} className={`w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95 flex justify-center items-center ${isStarting ? 'opacity-75 cursor-not-allowed' : ''}`}>
                 {isStarting ? <Loader2 size={24} className="animate-spin mr-2" /> : practiceMode === 'recitation' ? <BookOpen size={20} className="mr-2"/> : null}
                 {isStarting ? '准备题库中...' : practiceMode === 'recitation' ? '开始背题' : '开始练习'}
               </button>
               <p className="text-center text-xs text-slate-400">系统将优先为您推送做题次数较少的题目</p>
           </div>
        </div>
      </div>
    );
  }

  const renderQuizUI = (isReviewMode: boolean) => {
    const currentQ = questions[currentIndex];
    const userAnswer = answers[currentQ.id];
    const excluded = excludedOptions[currentQ.id] || [];
    const duration = questionDurations[currentQ.id] || 0;
    
    const showAnswer = isReviewMode || (practiceMode === 'recitation' && userAnswer !== undefined);

    return (
      <div className="fixed inset-0 bg-white z-50 flex flex-col">
        <div className="h-16 px-4 flex items-center justify-between border-b border-gray-100 flex-shrink-0 bg-white shadow-sm z-30">
            <div className="flex items-center gap-4">
                {showAnswer ? (
                   <button onClick={goToSheet} disabled={isSubmitting} className="p-2 -ml-2 text-slate-500 font-bold flex items-center"><GripHorizontal size={20} className="mr-1"/> 答题卡</button>
                ) : (
                   <button onClick={() => { if (window.confirm("退出后进度将丢失，确定退出吗？")) navigate('/'); }} className="p-2 -ml-2 text-slate-400 hover:text-slate-600"><X size={24} /></button>
                )}
                {!showAnswer && <div className="flex items-center text-slate-700 font-mono font-bold text-lg"><Timer size={18} className="mr-2 text-blue-500" /> {formatTime(totalSeconds)}</div>}
            </div>

            <div className="flex items-center gap-1 md:gap-3">
                <button onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))} disabled={currentIndex === 0} className="p-2 text-slate-400 disabled:opacity-20 hover:text-blue-600"><ChevronLeft size={28} /></button>
                <button onClick={() => setShowScratchpad(!showScratchpad)} className={`p-2.5 rounded-full transition-all mx-1 ${showScratchpad ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-slate-400 hover:bg-gray-200'}`}><PenTool size={20} /></button>
                <button onClick={() => setCurrentIndex(Math.min(questions.length - 1, currentIndex + 1))} disabled={currentIndex === questions.length - 1} className="p-2 text-slate-400 disabled:opacity-20 hover:text-blue-600"><ChevronRight size={28} /></button>
                {!isReviewMode && practiceMode === 'standard' && (
                    <button onClick={goToSheet} className="ml-2 bg-blue-600 text-white p-2 px-3 rounded-lg font-bold text-sm flex items-center shadow-md active:scale-95 transition-transform"><Check size={18} className="mr-1" /> 提交</button>
                )}
            </div>
        </div>

        <div className="h-1 bg-gray-100 w-full flex-shrink-0">
            <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}></div>
        </div>

        <div ref={containerRef} className="flex-1 overflow-hidden relative">
            {showScratchpad && (
                <div className="absolute inset-0 z-20 pointer-events-auto bg-transparent">
                    <DrawingCanvas ref={canvasRef} width={canvasDims.width} height={canvasDims.height} />
                </div>
            )}
            
            <div className="h-full overflow-y-auto p-6 pb-24 max-w-5xl mx-auto">
                <div className="text-sm text-slate-400 mb-4 font-medium flex justify-between">
                    <span>Topic {currentIndex + 1} / {questions.length}</span>
                    <div className="flex gap-2">
                        <span className="text-blue-500 bg-blue-50 px-2 py-0.5 rounded text-xs">{currentQ.category}</span>
                        {currentQ.subCategory && <span className="text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded text-xs">{currentQ.subCategory}</span>}
                    </div>
                </div>

                {loadingCurrentQ ? <div className="w-full h-40 flex items-center justify-center bg-gray-50 rounded-lg mb-4"><Loader2 className="animate-spin text-blue-400" size={32} /></div> : (
                    currentQ.materials.length > 0 && <div className="mb-4 grid gap-2">{currentQ.materials.map((m, i) => m === '__IMAGE_REF__' ? <div key={i} className="h-40 bg-gray-100 rounded-lg animate-pulse"/> : <img key={i} src={m} className="w-full h-auto rounded-lg border border-gray-100 max-h-60 object-contain mx-auto" />)}</div>
                )}

                {currentQ.materialText && (
                    <div 
                        className="mb-4 p-4 bg-gray-50 rounded-xl text-slate-800 text-lg leading-relaxed border-l-4 border-blue-200 rich-text-display"
                        dangerouslySetInnerHTML={{ __html: currentQ.materialText.replace(/\n/g, '<br/>') }}
                    ></div>
                )}
                
                <h2 className="text-xl font-medium text-slate-800 leading-relaxed mb-6 whitespace-pre-wrap">{currentQ.stem}</h2>

                <div className="space-y-3">
                    {currentQ.options.map((opt, idx) => {
                        let btnClass = "border-gray-200 bg-white hover:bg-gray-50";
                        let markerClass = "bg-gray-100 text-slate-500";
                        const isExcluded = excluded.includes(idx);
                        
                        if (showAnswer) {
                            if (idx === currentQ.correctAnswer) {
                                btnClass = "border-green-500 bg-green-50 text-green-700"; markerClass = "bg-green-500 text-white";
                            } else if (idx === userAnswer) {
                                btnClass = "border-red-500 bg-red-50 text-red-700"; markerClass = "bg-red-500 text-white";
                            } else {
                                btnClass = "border-gray-100 opacity-50";
                            }
                        } else {
                            if (idx === userAnswer) {
                                btnClass = "border-blue-500 bg-blue-50 text-blue-700 font-medium shadow-sm"; markerClass = "bg-blue-500 text-white";
                            } else if (isExcluded) {
                                btnClass = "border-gray-100 bg-gray-50 text-gray-400 line-through opacity-60";
                            }
                        }
                        return (
                            <button key={idx} disabled={showAnswer} onClick={() => handleAnswer(idx)} onContextMenu={(e) => handleExclude(e, idx)} className={`w-full p-4 rounded-xl border text-left flex items-start transition-all relative ${btnClass}`}>
                                <span className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold mr-3 mt-0.5 flex-shrink-0 ${markerClass}`}>{String.fromCharCode(65 + idx)}</span>
                                <span className="leading-relaxed text-lg">{opt}</span>
                                {!showAnswer && <span className="absolute right-2 top-2 text-[10px] text-gray-300 opacity-0 group-hover:opacity-100">长按排除</span>}
                            </button>
                        );
                    })}
                </div>

                {showAnswer && (
                    <div className="mt-8 animate-fade-in space-y-4">
                        <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                             <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between text-sm font-bold">
                                    <div className="flex items-center gap-4">
                                        <span className="text-green-600">正确答案: {String.fromCharCode(65 + currentQ.correctAnswer)}</span>
                                        <span className={userAnswer === currentQ.correctAnswer ? 'text-green-600' : 'text-red-500'}>你的答案: {userAnswer !== undefined ? String.fromCharCode(65 + userAnswer) : '未做'}</span>
                                    </div>
                                    <div className="bg-orange-50 text-orange-700 px-3 py-1 rounded-lg text-sm font-bold flex items-center shadow-sm">
                                        <Clock size={14} className="mr-1.5"/> 
                                        用时: {formatTimeFriendly(duration)}
                                    </div>
                                </div>
                                <div className="h-px bg-gray-100 w-full my-1"></div>
                                <div className="flex items-center justify-between text-xs text-slate-500">
                                   <span>历史数据: 做对 {currentQ.correctCount || 0} 次 / 做错 <span className="text-red-500">{currentQ.mistakeCount}</span> 次</span>
                                </div>
                             </div>
                        </div>

                        <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                            <span className="text-sm text-slate-700 font-medium">是否已掌握该题？</span>
                            <button onClick={toggleMastered} disabled={isTogglingMastered} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center ${currentQ.isMastered ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-slate-500 hover:bg-gray-200'} disabled:opacity-50`}>
                                {isTogglingMastered ? <Loader2 size={16} className="animate-spin mr-2" /> : <GraduationCap size={16} className="mr-2" />}
                                {currentQ.isMastered ? '已掌握 (移除出题库)' : '标记为已掌握'}
                            </button>
                        </div>
                        
                        {/* New Analysis Section */}
                        {currentQ.analysis && (
                            <div className="bg-blue-50 p-6 rounded-xl border border-blue-100">
                                <div className="flex items-center mb-4 text-blue-800 font-bold"><BookOpen size={16} className="mr-2"/> 题目解析</div>
                                <div className="mb-4 bg-white p-4 rounded-xl border border-blue-100 text-slate-700 text-base leading-relaxed rich-text-display" dangerouslySetInnerHTML={{ __html: currentQ.analysis }}></div>
                            </div>
                        )}

                        {(currentQ.noteText || currentQ.notesImage) && (
                            <div className="bg-amber-50 p-6 rounded-xl border border-amber-100">
                                <div className="flex items-center mb-4 text-amber-800 font-bold"><PenTool size={16} className="mr-2"/> 个人笔记</div>
                                {currentQ.noteText && <div className="mb-4 bg-white p-4 rounded-xl border border-amber-100 text-slate-700 text-base leading-relaxed rich-text-display" dangerouslySetInnerHTML={{ __html: currentQ.noteText }}></div>}
                                {!currentQ.noteText && currentQ.notesImage && (
                                    <div className="rounded-xl border border-amber-100 overflow-hidden bg-white">
                                        {!showNotesInReview ? (
                                            <button onClick={() => setShowNotesInReview(true)} className="w-full py-8 flex items-center justify-center text-amber-600 hover:bg-amber-50 transition-colors"><ImageIcon size={20} className="mr-2" /> 点击查看手写笔记</button>
                                        ) : currentQ.notesImage === '__IMAGE_REF__' ? <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-amber-400"/></div> : <img src={currentQ.notesImage} alt="Notes" className="w-full" />}
                                    </div>
                                )}
                            </div>
                        )}
                        
                        {practiceMode === 'recitation' && currentIndex < questions.length - 1 && (
                            <button onClick={() => { setCurrentIndex(prev => prev + 1); setShowNotesInReview(false); }} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold shadow-md hover:bg-blue-700">下一题</button>
                        )}
                        {practiceMode === 'recitation' && currentIndex === questions.length - 1 && (
                            <button onClick={goToSheet} disabled={isSubmitting} className="w-full py-3 bg-green-600 text-white rounded-xl font-bold shadow-md hover:bg-green-700 flex justify-center items-center">
                                {isSubmitting ? <Loader2 size={18} className="animate-spin mr-2"/> : null}
                                {isSubmitting ? '保存进度中...' : '完成背题'}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
      </div>
    );
  };

  if (viewMode === 'quiz') return renderQuizUI(false);
  if (viewMode === 'review') return renderQuizUI(true);

  if (viewMode === 'sheet_confirm' || viewMode === 'sheet_result') {
      const isResult = viewMode === 'sheet_result';
      const correctCount = questions.filter(q => answers[q.id] === q.correctAnswer).length;
      const unansweredCount = questions.filter(q => answers[q.id] === undefined).length;
      const incorrectCount = questions.length - correctCount - unansweredCount;
      const accuracy = questions.length > 0 ? Math.round((correctCount/questions.length)*100) : 0;
      
      const chartData = [
          { name: 'Correct', value: correctCount, color: '#22c55e' }, 
          { name: 'Wrong', value: incorrectCount, color: '#ef4444' },
          { name: 'Unanswered', value: unansweredCount, color: '#e2e8f0' }
      ];

      // Calculate Tree-based Category Stats
      // Use explicit type to avoid TSX parsing ambiguity with angle brackets
      const treeStats: Map<string, StatNodeWithSubs> = new Map();

      questions.forEach(q => {
          // Initialize Parent Category
          if (!treeStats.has(q.category)) {
              treeStats.set(q.category, { total: 0, correct: 0, duration: 0, subs: new Map() });
          }
          const parent = treeStats.get(q.category)!;
          
          // Determine sub category name (fallback to '其他' if empty)
          const subName = q.subCategory || '其他';
          if (!parent.subs.has(subName)) {
              parent.subs.set(subName, { total: 0, correct: 0, duration: 0 });
          }
          const child = parent.subs.get(subName)!;

          // Stats Update Logic
          const isCorrect = answers[q.id] === q.correctAnswer;
          const dur = questionDurations[q.id] || 0;

          parent.total++;
          parent.duration += dur;
          if (isCorrect) parent.correct++;

          child.total++;
          child.duration += dur;
          if (isCorrect) child.correct++;
      });

      const toggleCategory = (cat: string) => {
          const newSet = new Set(expandedCategories);
          if (newSet.has(cat)) newSet.delete(cat);
          else newSet.add(cat);
          setExpandedCategories(newSet);
      };
      
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <div className="bg-white p-4 shadow-sm border-b border-gray-200 flex justify-between items-center sticky top-0 z-10">
                <button onClick={() => isResult ? navigate('/') : setViewMode('quiz')} className="text-slate-500 font-bold flex items-center"><X size={20} className="mr-1" /> {isResult ? '返回首页' : '继续答题'}</button>
                <h1 className="font-bold text-lg">{isResult ? '考试情况' : '答题卡'}</h1>
                <div className="w-16"></div> 
            </div>
            <div className="flex-1 p-4 md:p-6 overflow-y-auto max-w-4xl mx-auto w-full">
                {isResult && (
                    <div className="space-y-6 mb-8">
                        {/* Summary Card with Circle Chart */}
                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center relative overflow-hidden">
                             <div className="absolute top-4 right-4 text-xs font-mono text-slate-400 bg-gray-50 px-2 py-1 rounded">总用时 {formatTime(totalSeconds)}</div>
                             <div className="relative w-40 h-40 mb-4">
                                 <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={chartData} innerRadius={50} outerRadius={70} startAngle={90} endAngle={-270} paddingAngle={5} dataKey="value">{chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />)}</Pie></PieChart></ResponsiveContainer>
                                 <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"><span className="text-3xl font-bold text-slate-800">{accuracy}%</span><span className="text-[10px] text-slate-400 uppercase tracking-wide">正确率</span></div>
                             </div>
                             
                             <div className="grid grid-cols-3 gap-8 text-center w-full max-w-xs">
                                 <div><div className="text-2xl font-bold text-green-500">{correctCount}</div><div className="text-xs text-slate-400">答对</div></div>
                                 <div><div className="text-2xl font-bold text-red-500">{incorrectCount}</div><div className="text-xs text-slate-400">答错</div></div>
                                 <div><div className="text-2xl font-bold text-slate-400">{unansweredCount}</div><div className="text-xs text-slate-400">未答</div></div>
                             </div>
                        </div>

                        {/* Tree Stats List */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                             <div className="p-4 border-b border-gray-50 flex items-center gap-2">
                                <BarChart2 size={18} className="text-blue-500"/>
                                <span className="font-bold text-slate-700">模块详细报告</span>
                             </div>
                             <div className="divide-y divide-gray-50">
                                 {Array.from(treeStats.entries()).map(([cat, stat]) => {
                                     const isExpanded = expandedCategories.has(cat);
                                     const acc = Math.round((stat.correct / stat.total) * 100);
                                     return (
                                         <div key={cat} className="group">
                                             {/* Parent Row */}
                                             <div 
                                                onClick={() => toggleCategory(cat)}
                                                className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                                             >
                                                 <div className="flex items-center gap-3">
                                                     <span className={`p-1 rounded-full text-slate-400 transition-transform ${isExpanded ? 'rotate-90 bg-slate-200 text-slate-600' : ''}`}>
                                                        <ChevronRight size={16} />
                                                     </span>
                                                     <span className="font-bold text-slate-700 text-base">{cat}</span>
                                                 </div>
                                                 <div className="flex items-center gap-4 text-sm text-slate-500">
                                                     <div className="w-24 text-right">总题数 <strong className="text-slate-700">{stat.total}</strong> 题</div>
                                                     <div className="hidden sm:block w-px h-3 bg-gray-200"></div>
                                                     <div className="w-24 text-right">答对 <strong className="text-slate-700">{stat.correct}</strong> 道</div>
                                                     <div className="hidden sm:block w-px h-3 bg-gray-200"></div>
                                                     <div className="w-24 text-right">正确率 <strong className={`${acc >= 80 ? 'text-green-600' : acc >= 60 ? 'text-blue-600' : 'text-red-500'}`}>{acc}%</strong></div>
                                                     <div className="hidden sm:block w-px h-3 bg-gray-200"></div>
                                                     <div className="w-24 text-right">用时 <strong className="text-slate-700">{formatTimeFriendly(stat.duration)}</strong></div>
                                                 </div>
                                             </div>
                                             
                                             {/* Child Rows */}
                                             {isExpanded && (
                                                 <div className="bg-gray-50/50 border-t border-gray-100 animate-fade-in divide-y divide-gray-100/50">
                                                     {Array.from(stat.subs.entries()).map(([subName, subStat]) => {
                                                         const subAcc = Math.round((subStat.correct / subStat.total) * 100);
                                                         return (
                                                             <div key={subName} className="px-6 py-3 pl-14 flex items-center justify-between hover:bg-white transition-colors">
                                                                 <div className="flex items-center gap-2">
                                                                     <div className="w-1.5 h-1.5 rounded-full bg-gray-300"></div>
                                                                     <span className="text-slate-600 font-medium text-sm">{subName}</span>
                                                                 </div>
                                                                 <div className="flex items-center gap-4 text-xs text-slate-400">
                                                                    <div className="w-24 text-right">总题数 <strong className="text-slate-600">{subStat.total}</strong> 题</div>
                                                                    <div className="hidden sm:block w-px h-2 bg-gray-200"></div>
                                                                    <div className="w-24 text-right">答对 <strong className="text-slate-600">{subStat.correct}</strong> 道</div>
                                                                    <div className="hidden sm:block w-px h-2 bg-gray-200"></div>
                                                                    <div className="w-24 text-right">正确率 <strong className={`${subAcc >= 80 ? 'text-green-600' : subAcc >= 60 ? 'text-blue-600' : 'text-red-500'}`}>{subAcc}%</strong></div>
                                                                    <div className="hidden sm:block w-px h-2 bg-gray-200"></div>
                                                                    <div className="w-24 text-right">用时 <strong className="text-slate-600">{formatTimeFriendly(subStat.duration)}</strong></div>
                                                                 </div>
                                                             </div>
                                                         );
                                                     })}
                                                 </div>
                                             )}
                                         </div>
                                     );
                                 })}
                             </div>
                        </div>
                    </div>
                )}
                
                <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-6 ${isResult ? '' : 'mt-6'}`}>
                    <div className="font-bold text-slate-700 mb-4 flex items-center justify-between">
                        <span>答题卡</span>
                        {isResult && <div className="flex gap-3 text-xs"><span className="flex items-center"><div className="w-2 h-2 rounded-full bg-green-500 mr-1"></div> 正确</span><span className="flex items-center"><div className="w-2 h-2 rounded-full bg-red-500 mr-1"></div> 错误</span><span className="flex items-center"><div className="w-2 h-2 rounded-full bg-gray-200 mr-1"></div> 未答</span></div>}
                    </div>
                    <div className="flex flex-wrap gap-3 justify-start">
                        {questions.map((q, idx) => {
                            const isCorrect = answers[q.id] === q.correctAnswer;
                            const isAnswered = answers[q.id] !== undefined;
                            let bg = 'bg-white border-gray-200 text-slate-600';
                            
                            if (isResult) {
                                if (isCorrect) bg = 'bg-green-500 text-white border-green-500';
                                else if (isAnswered) bg = 'bg-red-500 text-white border-red-500';
                                else bg = 'bg-gray-100 text-slate-400 border-gray-200';
                            } else {
                                if (isAnswered) bg = 'bg-blue-100 text-blue-700 border-blue-200';
                            }

                            return <button key={q.id} onClick={() => { setCurrentIndex(idx); if (isResult) setViewMode('review'); else setViewMode('quiz'); }} className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border shadow-sm transition-transform active:scale-95 ${bg}`}>{idx + 1}</button>;
                        })}
                    </div>
                </div>
                {!isResult && <div className="mt-6"><button onClick={confirmSubmit} disabled={isSubmitting} className={`w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 shadow-lg flex justify-center items-center ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}>{isSubmitting && <Loader2 size={24} className="animate-spin mr-2" />}{isSubmitting ? '提交中...' : '确认交卷'}</button></div>}
            </div>
        </div>
      );
  }

  return null;
};

export default Practice;
