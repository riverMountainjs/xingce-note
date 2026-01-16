import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getQuestions, saveSession, saveQuestion, hydrateQuestion } from '../services/storageService';
import { Question, QuestionCategory, PracticeSession, SessionDetail } from '../types';
import { SUB_CATEGORY_MAP } from '../constants';
import DrawingCanvas, { DrawingCanvasRef } from '../components/DrawingCanvas';
import { ChevronRight, ChevronLeft, PenTool, Timer, X, Check, GripHorizontal, Filter, GraduationCap, Loader2, ImageIcon, ChevronDown, ChevronUp, PieChart as PieChartIcon, Clock, CheckCircle2, XCircle, HelpCircle } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const checkDate = (timestamp: number, type: 'all' | 'today' | 'yesterday' | '3days' | 'week' | 'month') => {
    if (type === 'all') return true;
    
    // Normalize to Beijing Time Midnight for comparison
    const getBJMidnight = (ts: number) => {
        // Create date object from timestamp treated as Beijing time string
        const dateStr = new Date(ts).toLocaleString('en-US', {timeZone: 'Asia/Shanghai'});
        const d = new Date(dateStr);
        d.setHours(0,0,0,0);
        return d;
    };

    const today = getBJMidnight(Date.now());
    const target = getBJMidnight(timestamp);
    
    const diffTime = today.getTime() - target.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (type === 'today') return diffDays === 0;
    if (type === 'yesterday') return diffDays === 1;
    if (type === '3days') return diffDays <= 2; 
    if (type === 'week') return diffDays <= 6; // Last 7 days
    if (type === 'month') return diffDays <= 29; // Last 30 days
    return true;
};

type ViewMode = 'setup' | 'quiz' | 'sheet_confirm' | 'sheet_result' | 'review';

const Practice = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [viewMode, setViewMode] = useState<ViewMode>('setup');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // State
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [excludedOptions, setExcludedOptions] = useState<Record<string, number[]>>({});
  const [showScratchpad, setShowScratchpad] = useState(false);
  const [showNotesInReview, setShowNotesInReview] = useState(false); // Lazy load toggle for review
  
  // Action States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStarting, setIsStarting] = useState(false); 
  const [isTogglingMastered, setIsTogglingMastered] = useState(false);
  const [loadingCurrentQ, setLoadingCurrentQ] = useState(false); 
  const [isRestoring, setIsRestoring] = useState(!!location.state?.session);
  
  // Timing
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [questionDurations, setQuestionDurations] = useState<Record<string, number>>({});
  const lastSwitchTimeRef = useRef<number>(Date.now());
  const timerRef = useRef<number | null>(null);

  // Setup Filters
  const [selectedCount, setSelectedCount] = useState<number | 'ALL'>(10);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('All');
  const [accRange, setAccRange] = useState({ min: 0, max: 100 });
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'yesterday' | '3days' | 'week' | 'month'>('all');

  // Report States
  const [expandedReportCat, setExpandedReportCat] = useState<string | null>(null);

  // Canvas
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<DrawingCanvasRef>(null);
  const [canvasDims, setCanvasDims] = useState({ width: 0, height: 0 });

  // Handle restoring a session for review
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
                          q = {
                              id: detail.questionId,
                              stem: '[该题目已被删除]',
                              options: [],
                              correctAnswer: -1,
                              category: QuestionCategory.COMMON_SENSE,
                              accuracy: 0,
                              mistakeCount: 0,
                              createdAt: 0,
                              materials: []
                          } as Question;
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
    if (containerRef.current) {
        setCanvasDims({
            width: containerRef.current.offsetWidth,
            height: containerRef.current.offsetHeight
        });
    }
  }, [viewMode, showScratchpad]);

  useEffect(() => {
    if (canvasRef.current) {
        canvasRef.current.clear();
    }
  }, [currentIndex]);

  useEffect(() => {
      setShowNotesInReview(false); // Reset notes visibility when changing question in review
      const hydrateCurrent = async () => {
          if (questions.length === 0) return;
          const currentQ = questions[currentIndex];
          
          if (currentQ.materials.includes('__IMAGE_REF__') || currentQ.notesImage === '__IMAGE_REF__') {
              setLoadingCurrentQ(true);
              try {
                  const fullQ = await hydrateQuestion(currentQ);
                  setQuestions(prev => {
                      const newQs = [...prev];
                      newQs[currentIndex] = fullQ;
                      return newQs;
                  });
              } finally {
                  setLoadingCurrentQ(false);
              }
          }
      };
      
      if (viewMode === 'quiz' || viewMode === 'review') {
          hydrateCurrent();
      }
  }, [currentIndex, viewMode, questions.length]);

  useEffect(() => {
    const tick = () => {
        if (viewMode === 'quiz') {
            const now = Date.now();
            setTotalSeconds(s => s + 1);
            if (questions.length > 0) {
                const currentQId = questions[currentIndex].id;
                const diff = (now - lastSwitchTimeRef.current) / 1000;
                setQuestionDurations(prev => ({
                    ...prev,
                    [currentQId]: (prev[currentQId] || 0) + diff
                }));
                lastSwitchTimeRef.current = now;
            }
        }
    };

    if (viewMode === 'quiz') {
        lastSwitchTimeRef.current = Date.now();
        timerRef.current = window.setInterval(tick, 1000);
    } else {
        if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [viewMode, currentIndex, questions]);

  const startPractice = async () => {
    if (isStarting) return;
    setIsStarting(true);
    
    setTimeout(async () => {
        try {
            const all = await getQuestions();
            let filtered = all.filter(q => selectedCategory === 'All' || q.category === selectedCategory);
            
            if (selectedSubCategory !== 'All') {
                filtered = filtered.filter(q => q.subCategory === selectedSubCategory);
            }
            
            filtered = filtered.filter(q => !q.isMastered);
            filtered = filtered.filter(q => q.accuracy >= accRange.min && q.accuracy <= accRange.max);
            filtered = filtered.filter(q => checkDate(q.createdAt, timeFilter));
            
            const count = selectedCount === 'ALL' ? filtered.length : selectedCount;
            filtered = filtered.sort(() => 0.5 - Math.random()).slice(0, count);
            
            if (filtered.length === 0) {
                alert("该条件下没有找到可练习的错题（已掌握的题目不会出现在练习中）。");
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

    if (currentIndex < questions.length - 1) {
        setTimeout(() => {
            setCurrentIndex(prev => prev + 1);
        }, 300);
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
      } finally {
          setIsTogglingMastered(false);
      }
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

  const changeQuestion = (delta: number) => {
      const newIndex = currentIndex + delta;
      if (newIndex >= 0 && newIndex < questions.length) {
          setCurrentIndex(newIndex);
      }
  };

  const goToSheet = () => {
      if(viewMode === 'review') setViewMode('sheet_result');
      else setViewMode('sheet_confirm');
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
              return {
                  questionId: q.id,
                  userAnswer: uAns !== undefined ? uAns : -1,
                  isCorrect,
                  duration: questionDurations[q.id] || 0
              };
          });

          const session: PracticeSession = {
              id: Date.now().toString(),
              date: Date.now(),
              questionIds: questions.map(q => q.id),
              score: Math.round((score / questions.length) * 100),
              totalDuration: totalSeconds,
              details
          };
          
          await saveSession(session);
          setViewMode('sheet_result');
      } finally {
          setIsSubmitting(false);
      }
  };

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Wait for hydration
  if (isRestoring) {
      return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-slate-400">
          <Loader2 className="animate-spin mr-2" /> 加载记录中...
      </div>;
  }

  if (viewMode === 'setup') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center p-6">
        <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-lg border border-gray-100 mt-10">
           <div className="flex justify-between items-center mb-8">
             <h1 className="text-2xl font-bold text-slate-800">开始刷题</h1>
             <button onClick={() => navigate('/')} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
             </button>
           </div>
           <div className="space-y-6">
               <div>
                   <label className="text-sm font-medium text-slate-700 block mb-2">选择模块</label>
                   <select 
                        className="w-full border-gray-200 rounded-xl p-3 bg-gray-50 focus:ring-blue-500 focus:border-blue-500" 
                        value={selectedCategory} 
                        onChange={e => {
                            setSelectedCategory(e.target.value);
                            setSelectedSubCategory('All');
                        }}
                    >
                       <option value="All">全部模块</option>
                       {Object.values(QuestionCategory).map(c => <option key={c} value={c}>{c}</option>)}
                   </select>
               </div>

               {selectedCategory !== 'All' && (
                   <div className="animate-fade-in">
                        <label className="text-sm font-medium text-slate-700 block mb-2">选择题型</label>
                        <select 
                            className="w-full border-gray-200 rounded-xl p-3 bg-gray-50 focus:ring-blue-500 focus:border-blue-500" 
                            value={selectedSubCategory} 
                            onChange={e => setSelectedSubCategory(e.target.value)}
                        >
                            <option value="All">全部题型</option>
                            {SUB_CATEGORY_MAP[selectedCategory as QuestionCategory]?.map(sc => (
                                <option key={sc} value={sc}>{sc}</option>
                            ))}
                        </select>
                   </div>
               )}

               <div>
                   <label className="text-sm font-medium text-slate-700 block mb-2">题目数量</label>
                   <div className="flex gap-2">
                       {[5, 10, 20, 50].map(n => (
                           <button key={n} onClick={() => setSelectedCount(n)} className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-all ${selectedCount === n ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white border-gray-200 text-slate-600'}`}>{n}</button>
                       ))}
                       <button onClick={() => setSelectedCount('ALL')} className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-all ${selectedCount === 'ALL' ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white border-gray-200 text-slate-600'}`}>全部</button>
                   </div>
               </div>
               
               <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-4">
                  <div className="flex items-center text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    <Filter size={12} className="mr-1"/> 筛选
                  </div>
                  <div>
                    <div className="flex flex-wrap gap-2">
                        {[
                            {k: 'all', l: '全部'}, {k: 'today', l: '今天'}, {k: 'yesterday', l: '昨天'},
                            {k: '3days', l: '近3天'}, {k: 'week', l: '近7天'}, {k: 'month', l: '近30天'}
                        ].map(opt => (
                            <button key={opt.k} onClick={() => setTimeFilter(opt.k as any)} className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${timeFilter === opt.k ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-white border-gray-200 text-slate-500'}`}>{opt.l}</button>
                        ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-2">正确率: <span className="text-slate-700">{accRange.min}% - {accRange.max}%</span></label>
                    <div className="flex items-center gap-4 px-2">
                         <div className="relative flex-1 h-8 flex items-center select-none touch-none">
                            <div className="absolute left-0 right-0 h-1.5 bg-gray-200 rounded-full"></div>
                            <div className="absolute h-1.5 bg-blue-500 rounded-full" style={{ left: `${accRange.min}%`, right: `${100 - accRange.max}%` }}></div>
                            <input type="range" min="0" max="100" value={accRange.min} onChange={e => setAccRange(p => ({...p, min: Math.min(Number(e.target.value), p.max - 1)}))} className="range-input z-30" />
                            <input type="range" min="0" max="100" value={accRange.max} onChange={e => setAccRange(p => ({...p, max: Math.max(Number(e.target.value), p.min + 1)}))} className="range-input z-40" />
                         </div>
                    </div>
                  </div>
               </div>

               <button 
                  onClick={startPractice} 
                  disabled={isStarting}
                  className={`w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95 flex justify-center items-center ${isStarting ? 'opacity-75 cursor-not-allowed' : ''}`}
               >
                 {isStarting ? <Loader2 size={24} className="animate-spin mr-2" /> : null}
                 {isStarting ? '准备题库中...' : '开始练习'}
               </button>
           </div>
        </div>
      </div>
    );
  }

  const renderQuizUI = (isReview: boolean) => {
    const currentQ = questions[currentIndex];
    const userAnswer = answers[currentQ.id];
    const excluded = excludedOptions[currentQ.id] || [];

    return (
      <div className="fixed inset-0 bg-white z-50 flex flex-col">
        <div className="h-16 px-4 flex items-center justify-between border-b border-gray-100 flex-shrink-0 bg-white shadow-sm z-30">
            <div className="flex items-center gap-4">
                {isReview ? (
                   <button onClick={goToSheet} className="p-2 -ml-2 text-slate-500 font-bold flex items-center">
                       <GripHorizontal size={20} className="mr-1"/> 答题卡
                   </button>
                ) : (
                   <button onClick={() => {
                        if (window.confirm("退出后进度将丢失，确定退出吗？")) navigate('/');
                    }} className="p-2 -ml-2 text-slate-400 hover:text-slate-600">
                        <X size={24} />
                    </button>
                )}
                
                {!isReview && (
                    <div className="flex items-center text-slate-700 font-mono font-bold text-lg">
                        <Timer size={18} className="mr-2 text-blue-500" /> {formatTime(totalSeconds)}
                    </div>
                )}
            </div>

            <div className="flex items-center gap-1 md:gap-3">
                <button onClick={() => changeQuestion(-1)} disabled={currentIndex === 0} className="p-2 text-slate-400 disabled:opacity-20 hover:text-blue-600">
                    <ChevronLeft size={28} />
                </button>
                
                <button onClick={() => setShowScratchpad(!showScratchpad)} className={`p-2.5 rounded-full transition-all mx-1 ${showScratchpad ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-slate-400 hover:bg-gray-200'}`}>
                    <PenTool size={20} />
                </button>

                <button onClick={() => changeQuestion(1)} disabled={currentIndex === questions.length - 1} className="p-2 text-slate-400 disabled:opacity-20 hover:text-blue-600">
                    <ChevronRight size={28} />
                </button>

                {!isReview && (
                    <button onClick={goToSheet} className="ml-2 bg-blue-600 text-white p-2 px-3 rounded-lg font-bold text-sm flex items-center shadow-md active:scale-95 transition-transform">
                        <Check size={18} className="mr-1" /> 提交
                    </button>
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

                {loadingCurrentQ ? (
                    <div className="w-full h-40 flex items-center justify-center bg-gray-50 rounded-lg mb-4">
                        <Loader2 className="animate-spin text-blue-400" size={32} />
                    </div>
                ) : (
                    currentQ.materials.length > 0 && (
                         <div className="mb-4 grid gap-2">
                            {currentQ.materials.map((m, i) => (
                                m === '__IMAGE_REF__' ? (
                                    <div key={i} className="w-full h-40 flex items-center justify-center bg-gray-100 rounded-lg animate-pulse">
                                        <ImageIcon className="text-gray-300" />
                                    </div>
                                ) : (
                                    <img key={i} src={m} className="w-full h-auto rounded-lg border border-gray-100 max-h-60 object-contain mx-auto" alt="material" />
                                )
                            ))}
                         </div>
                    )
                )}

                {currentQ.materialText && (
                    <div className="mb-4 p-4 bg-gray-50 rounded-xl text-slate-800 text-lg leading-relaxed border-l-4 border-blue-200 whitespace-pre-wrap">
                        {currentQ.materialText}
                    </div>
                )}
                
                {/* Modified: Added whitespace-pre-wrap to handle newlines in stem */}
                <h2 className="text-xl font-medium text-slate-800 leading-relaxed mb-6 whitespace-pre-wrap">{currentQ.stem}</h2>

                <div className="space-y-3">
                    {currentQ.options.map((opt, idx) => {
                        let btnClass = "border-gray-200 bg-white hover:bg-gray-50";
                        let markerClass = "bg-gray-100 text-slate-500";
                        const isExcluded = excluded.includes(idx);
                        
                        if (isReview) {
                            if (idx === currentQ.correctAnswer) {
                                btnClass = "border-green-500 bg-green-50 text-green-700";
                                markerClass = "bg-green-500 text-white";
                            } else if (idx === userAnswer) {
                                btnClass = "border-red-500 bg-red-50 text-red-700";
                                markerClass = "bg-red-500 text-white";
                            } else {
                                btnClass = "border-gray-100 opacity-50";
                            }
                        } else {
                            if (idx === userAnswer) {
                                btnClass = "border-blue-500 bg-blue-50 text-blue-700 font-medium shadow-sm";
                                markerClass = "bg-blue-500 text-white";
                            } else if (isExcluded) {
                                btnClass = "border-gray-100 bg-gray-50 text-gray-400 line-through opacity-60";
                            }
                        }
                        
                        return (
                            <button
                                key={idx}
                                disabled={isReview}
                                onClick={() => handleAnswer(idx)}
                                onContextMenu={(e) => handleExclude(e, idx)}
                                className={`w-full p-4 rounded-xl border text-left flex items-start transition-all relative ${btnClass}`}
                            >
                                <span className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold mr-3 mt-0.5 flex-shrink-0 ${markerClass}`}>
                                    {String.fromCharCode(65 + idx)}
                                </span>
                                <span className="leading-relaxed text-lg">{opt}</span>
                                {!isReview && <span className="absolute right-2 top-2 text-[10px] text-gray-300 opacity-0 group-hover:opacity-100">长按排除</span>}
                            </button>
                        );
                    })}
                </div>

                {isReview && (
                    <div className="mt-8 animate-fade-in space-y-4">
                        <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                             <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-4 text-sm font-bold">
                                    <span className="text-green-600">正确答案: {String.fromCharCode(65 + currentQ.correctAnswer)}</span>
                                    <span className={userAnswer === currentQ.correctAnswer ? 'text-green-600' : 'text-red-500'}>
                                        你的答案: {userAnswer !== undefined ? String.fromCharCode(65 + userAnswer) : '未做'}
                                    </span>
                                </div>
                                <div className="h-px bg-gray-100 w-full my-1"></div>
                                <div className="flex items-center justify-between text-xs text-slate-500">
                                   <span>本题耗时: {Math.round(questionDurations[currentQ.id] || 0)}s</span>
                                   <span>历史数据: 做对 {currentQ.correctCount || 0} 次 / 做错 <span className="text-red-500">{currentQ.mistakeCount}</span> 次</span>
                                </div>
                             </div>
                        </div>

                        <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                            <span className="text-sm text-slate-700 font-medium">是否已掌握该题？</span>
                            <button 
                                onClick={toggleMastered}
                                disabled={isTogglingMastered}
                                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center ${currentQ.isMastered ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-slate-500 hover:bg-gray-200'} disabled:opacity-50`}
                            >
                                {isTogglingMastered ? <Loader2 size={16} className="animate-spin mr-2" /> : <GraduationCap size={16} className="mr-2" />}
                                {currentQ.isMastered ? '已掌握 (移除出题库)' : '标记为已掌握'}
                            </button>
                        </div>

                        {(currentQ.noteText || currentQ.notesImage) && (
                            <div className="bg-amber-50 p-6 rounded-xl border border-amber-100">
                                <div className="flex items-center mb-4 text-amber-800 font-bold">
                                    <PenTool size={16} className="mr-2"/> 我的笔记
                                </div>
                                {currentQ.noteText && (
                                    <div 
                                        className="mb-4 bg-white p-4 rounded-xl border border-amber-100 text-sm whitespace-pre-wrap prose prose-sm max-w-none"
                                        dangerouslySetInnerHTML={{ __html: currentQ.noteText }}
                                    ></div>
                                )}
                                {/* Keep rendering notesImage for backward compatibility if noteText is empty */}
                                {!currentQ.noteText && currentQ.notesImage && (
                                    <div className="rounded-xl border border-amber-100 overflow-hidden bg-white">
                                        {!showNotesInReview ? (
                                            <button 
                                                onClick={() => setShowNotesInReview(true)}
                                                className="w-full py-8 flex items-center justify-center text-amber-600 hover:bg-amber-50 transition-colors"
                                            >
                                                <ImageIcon size={20} className="mr-2" /> 点击查看手写笔记
                                            </button>
                                        ) : currentQ.notesImage === '__IMAGE_REF__' ? (
                                            <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-amber-400"/></div>
                                        ) : (
                                            <img src={currentQ.notesImage} alt="Notes" className="w-full" />
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
      </div>
    );
  };

  if (viewMode === 'sheet_confirm' || viewMode === 'sheet_result') {
      const isResult = viewMode === 'sheet_result';
      const correctCount = questions.filter(q => answers[q.id] === q.correctAnswer).length;
      const incorrectCount = questions.length - correctCount;
      const accuracy = Math.round((correctCount/questions.length)*100);

      // Category Analysis Calculation
      type SubStat = { total: number; correct: number; time: number };
      type CatStat = { total: number; correct: number; time: number; subs: Record<string, SubStat> };

      const statsByCategory = questions.reduce((acc, q) => {
          const cat = q.category;
          const sub = q.subCategory || '其他';
          if (!acc[cat]) acc[cat] = { total: 0, correct: 0, time: 0, subs: {} };
          
          acc[cat].total++;
          acc[cat].time += (questionDurations[q.id] || 0);
          if (answers[q.id] === q.correctAnswer) acc[cat].correct++;

          if (!acc[cat].subs[sub]) acc[cat].subs[sub] = { total: 0, correct: 0, time: 0 };
          acc[cat].subs[sub].total++;
          acc[cat].subs[sub].time += (questionDurations[q.id] || 0);
          if (answers[q.id] === q.correctAnswer) acc[cat].subs[sub].correct++;

          return acc;
      }, {} as Record<string, CatStat>);

      const chartData = [
          { name: 'Correct', value: correctCount, color: '#22c55e' },
          { name: 'Wrong', value: incorrectCount, color: '#ef4444' }
      ];
      
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <div className="bg-white p-4 shadow-sm border-b border-gray-200 flex justify-between items-center sticky top-0 z-10">
                <button onClick={() => isResult ? navigate('/') : setViewMode('quiz')} className="text-slate-500 font-bold flex items-center">
                    <X size={20} className="mr-1" /> {isResult ? '返回首页' : '继续答题'}
                </button>
                <h1 className="font-bold text-lg">{isResult ? '练习报告' : '答题卡'}</h1>
                <div className="w-16"></div> 
            </div>

            <div className="flex-1 p-4 md:p-6 overflow-y-auto">
                {isResult && (
                    <div className="space-y-6">
                        {/* 1. Dashboard Chart */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center">
                             <div className="relative w-48 h-48">
                                 <ResponsiveContainer width="100%" height="100%">
                                     <PieChart>
                                         <Pie
                                            data={chartData}
                                            innerRadius={60}
                                            outerRadius={80}
                                            startAngle={90}
                                            endAngle={-270}
                                            paddingAngle={5}
                                            dataKey="value"
                                         >
                                            {chartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                                            ))}
                                         </Pie>
                                     </PieChart>
                                 </ResponsiveContainer>
                                 <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                     <span className="text-4xl font-bold text-slate-800">{accuracy}%</span>
                                     <span className="text-xs text-slate-400 uppercase tracking-wide">正确率</span>
                                 </div>
                             </div>
                        </div>

                        {/* 2. Key Metrics */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                             <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                                 <div className="text-slate-400 text-xs mb-1 flex items-center"><HelpCircle size={12} className="mr-1"/> 总题数</div>
                                 <div className="text-2xl font-bold text-slate-800">{questions.length}</div>
                             </div>
                             <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                                 <div className="text-green-500 text-xs mb-1 flex items-center"><CheckCircle2 size={12} className="mr-1"/> 答对</div>
                                 <div className="text-2xl font-bold text-green-600">{correctCount}</div>
                             </div>
                             <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                                 <div className="text-red-500 text-xs mb-1 flex items-center"><XCircle size={12} className="mr-1"/> 答错</div>
                                 <div className="text-2xl font-bold text-red-600">{incorrectCount}</div>
                             </div>
                             <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                                 <div className="text-blue-500 text-xs mb-1 flex items-center"><Clock size={12} className="mr-1"/> 总耗时</div>
                                 <div className="text-2xl font-bold text-blue-600">{formatTime(totalSeconds)}</div>
                             </div>
                        </div>

                        {/* 3. Category Breakdown */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                             <div className="p-4 border-b border-gray-50 font-bold text-slate-700 bg-gray-50/50">能力维度分析</div>
                             <div className="divide-y divide-gray-50">
                                 {/* Fix: Explicitly typecast statsByCategory to [string, CatStat][] to avoid 'unknown' type error */}
                                 {(Object.entries(statsByCategory) as [string, CatStat][]).map(([cat, stat]) => (
                                     <div key={cat} className="bg-white">
                                         <button 
                                            onClick={() => setExpandedReportCat(expandedReportCat === cat ? null : cat)}
                                            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                                         >
                                             <div className="flex items-center gap-3">
                                                 <span className="font-bold text-slate-700">{cat}</span>
                                                 <span className="text-xs bg-gray-100 text-slate-500 px-2 py-0.5 rounded-full">{stat.total}题</span>
                                             </div>
                                             <div className="flex items-center gap-4 text-sm">
                                                 <span className="text-slate-500">{Math.round((stat.correct/stat.total)*100)}% 正确</span>
                                                 {expandedReportCat === cat ? <ChevronUp size={16} className="text-slate-400"/> : <ChevronDown size={16} className="text-slate-400"/>}
                                             </div>
                                         </button>
                                         
                                         {expandedReportCat === cat && (
                                             <div className="bg-gray-50 p-3 pl-8 pr-4 space-y-2 border-t border-gray-100">
                                                 {/* Fix: Explicitly typecast stat.subs to [string, SubStat][] to avoid 'unknown' type error */}
                                                 {(Object.entries(stat.subs) as [string, SubStat][]).map(([sub, subStat]) => (
                                                     <div key={sub} className="flex justify-between items-center text-sm">
                                                         <span className="text-slate-600">{sub}</span>
                                                         <div className="flex gap-4 text-xs text-slate-500">
                                                             <span>{subStat.total}题</span>
                                                             <span className={`${subStat.correct === subStat.total ? 'text-green-600' : 'text-slate-500'}`}>{Math.round((subStat.correct/subStat.total)*100)}%</span>
                                                             <span>{Math.round(subStat.time)}s</span>
                                                         </div>
                                                     </div>
                                                 ))}
                                             </div>
                                         )}
                                     </div>
                                 ))}
                             </div>
                        </div>
                    </div>
                )}

                {/* 4. Answer Sheet */}
                <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-6 ${isResult ? 'mt-6' : ''}`}>
                    <div className="font-bold text-slate-700 mb-4 flex items-center justify-between">
                        <span>答题卡</span>
                        {isResult && (
                            <div className="flex gap-3 text-xs">
                                <span className="flex items-center"><div className="w-3 h-3 rounded-full bg-green-500 mr-1"></div> 正确</span>
                                <span className="flex items-center"><div className="w-3 h-3 rounded-full bg-red-500 mr-1"></div> 错误</span>
                                <span className="flex items-center"><div className="w-3 h-3 rounded-full bg-gray-200 mr-1"></div> 未做/删</span>
                            </div>
                        )}
                    </div>
                    
                    <div className="flex flex-wrap gap-3 justify-start">
                        {questions.map((q, idx) => {
                            const isAnswered = answers[q.id] !== undefined;
                            const isCorrect = answers[q.id] === q.correctAnswer;
                            
                            let bg = 'bg-white border-gray-200 text-slate-600';
                            if (isResult) {
                                if (q.stem === '[该题目已被删除]') {
                                    bg = 'bg-gray-200 text-gray-400 border-gray-200 cursor-not-allowed';
                                } else {
                                    bg = isCorrect ? 'bg-green-500 text-white border-green-500' : 'bg-red-500 text-white border-red-500';
                                }
                            } else {
                                if (isAnswered) bg = 'bg-blue-100 text-blue-700 border-blue-200';
                            }

                            return (
                                <button 
                                    key={q.id}
                                    disabled={isResult && q.stem === '[该题目已被删除]'}
                                    onClick={() => {
                                        setCurrentIndex(idx);
                                        if (isResult) setViewMode('review');
                                        else setViewMode('quiz');
                                    }}
                                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border shadow-sm transition-transform active:scale-95 ${bg}`}
                                >
                                    {idx + 1}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {!isResult && (
                    <div className="mt-6">
                         <button 
                            onClick={confirmSubmit}
                            disabled={isSubmitting}
                            className={`w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 shadow-lg flex justify-center items-center ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                            {isSubmitting && <Loader2 size={24} className="animate-spin mr-2" />}
                            {isSubmitting ? '提交中...' : '确认交卷'}
                        </button>
                    </div>
                )}
            </div>
        </div>
      );
  }

  if (viewMode === 'quiz') return renderQuizUI(false);
  if (viewMode === 'review') return renderQuizUI(true);

  return null;
};

export default Practice;