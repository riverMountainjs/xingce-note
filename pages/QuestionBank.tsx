
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getQuestions, deleteQuestion, saveQuestion, hydrateQuestion, restoreQuestion } from '../services/storageService';
import { Question, QuestionCategory } from '../types';
import { SUB_CATEGORY_MAP } from '../constants';
import { Edit2, Trash, Calendar, Search, Filter, Loader2, Hash, GraduationCap, ChevronLeft, ChevronRight, ImageIcon, BookMarked, Trash2, RotateCcw, AlertTriangle, BookOpen } from 'lucide-react';

const checkDate = (timestamp: number, type: 'today' | 'yesterday' | '3days' | 'week' | 'month' | 'all') => {
    if (type === 'all') return true;
    const getBJMidnight = (ts: number) => {
        const dateStr = new Date(ts).toLocaleString('en-US', {timeZone: 'Asia/Shanghai'});
        const d = new Date(dateStr);
        d.setHours(0,0,0,0);
        return d;
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

const ITEMS_PER_PAGE = 10;

const QuestionBank = () => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEmptying, setIsEmptying] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [filterSubCategory, setFilterSubCategory] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState('');
  // 修正：默认筛选改为 'today'
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'yesterday' | '3days' | 'week' | 'month'>('today');
  const [statusFilter, setStatusFilter] = useState<'all' | 'mastered' | 'not_mastered' | 'deleted'>('not_mastered');
  const [accRange, setAccRange] = useState({ min: 0, max: 100 });
  const [showFilters, setShowFilters] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    getQuestions().then(data => { setQuestions(data); setLoading(false); });
  }, []);

  useEffect(() => { setCurrentPage(1); }, [filterCategory, filterSubCategory, searchTerm, timeFilter, accRange, statusFilter]);

  const filteredQuestions = questions.filter(q => {
    if (statusFilter === 'deleted') {
        if (!q.deletedAt) return false;
    } else {
        if (q.deletedAt) return false;
    }

    const matchesCategory = filterCategory === 'All' || q.category === filterCategory;
    const matchesSubCategory = filterSubCategory === 'All' || q.subCategory === filterSubCategory;
    const matchesSearch = q.stem.toLowerCase().includes(searchTerm.toLowerCase()) || (q.tags && q.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase())));
    const matchesTime = checkDate(q.createdAt, timeFilter);
    const matchesAcc = q.accuracy >= accRange.min && q.accuracy <= accRange.max;
    
    let matchesStatus = true;
    if (statusFilter !== 'deleted') {
        matchesStatus = statusFilter === 'all' || (statusFilter === 'mastered' ? !!q.isMastered : !q.isMastered);
    }
    
    return matchesCategory && matchesSubCategory && matchesSearch && matchesTime && matchesAcc && matchesStatus;
  });

  const totalPages = Math.ceil(filteredQuestions.length / ITEMS_PER_PAGE);
  const paginatedQuestions = filteredQuestions.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  useEffect(() => {
      const toHydrate = paginatedQuestions.filter(q => q.materials.some(m => m === '__IMAGE_REF__') || q.notesImage === '__IMAGE_REF__');
      if (toHydrate.length > 0) {
          Promise.all(toHydrate.map(hydrateQuestion)).then(results => {
              setQuestions(prev => {
                  const next = [...prev];
                  results.forEach(hydrated => {
                      const idx = next.findIndex(q => q.id === hydrated.id);
                      if (idx !== -1) next[idx] = hydrated;
                  });
                  return next;
              });
          });
      }
  }, [paginatedQuestions]);

  const handleDelete = async (id: string, hard: boolean = false) => {
    const msg = hard ? "确定要物理删除此题吗？此操作不可逆，将从服务器永久抹除。" : "确定将此题移入回收站吗？";
    if (window.confirm(msg)) {
      setDeletingId(id);
      await deleteQuestion(id, hard);
      if (hard) {
          setQuestions(prev => prev.filter(q => q.id !== id));
      } else {
          setQuestions(prev => prev.map(q => q.id === id ? { ...q, deletedAt: Date.now() } : q));
      }
      setDeletingId(null);
    }
  };

  const handleEmptyTrash = async () => {
      const trashQuestions = questions.filter(q => q.deletedAt);
      const count = trashQuestions.length;
      if (count === 0) return;

      if (window.confirm(`⚠️ 高危操作警告\n\n确定要永久清空回收站中的 ${count} 道题目吗？\n此操作将彻底物理删除这些题目及其图片资源，无法恢复！`)) {
          setIsEmptying(true);
          try {
              const batchSize = 5;
              for (let i = 0; i < count; i += batchSize) {
                  const batch = trashQuestions.slice(i, i + batchSize);
                  await Promise.all(batch.map(q => deleteQuestion(q.id, true)));
              }
              setQuestions(prev => prev.filter(q => !q.deletedAt));
              alert("回收站已清空");
          } catch (e) {
              console.error(e);
              alert("清空过程中发生错误，可能部分题目未删除");
          } finally {
              setIsEmptying(false);
          }
      }
  };

  const handleRestore = async (id: string) => {
      setTogglingId(id);
      await restoreQuestion(id);
      setQuestions(prev => prev.map(q => q.id === id ? { ...q, deletedAt: undefined } : q));
      setTogglingId(null);
  };

  const toggleMastered = async (q: Question) => {
      setTogglingId(q.id);
      const updatedQ = { ...q, isMastered: !q.isMastered };
      let safeQ: Question = updatedQ;
      if (q.materials.includes('__IMAGE_REF__') || q.notesImage === '__IMAGE_REF__') {
          safeQ = await hydrateQuestion(updatedQ);
      }
      await saveQuestion(safeQ);
      setQuestions(prev => prev.map(item => item.id === q.id ? updatedQ : item));
      setTogglingId(null);
  };

  if (loading) return <div className="flex justify-center p-10 text-slate-400"><Loader2 className="animate-spin mr-2"/> 加载中...</div>;

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800">
                {statusFilter === 'deleted' ? '回收站' : '错题库'}
            </h1>
            {statusFilter === 'deleted' && (
                <span className="bg-amber-100 text-amber-600 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center">
                    <AlertTriangle size={10} className="mr-1"/> 30天内可恢复
                </span>
            )}
          </div>
          {statusFilter === 'deleted' ? (
              <button 
                onClick={handleEmptyTrash} 
                disabled={isEmptying || !questions.some(q => q.deletedAt)}
                className="bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-red-100 flex items-center disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isEmptying ? <Loader2 size={16} className="animate-spin mr-2"/> : <Trash2 size={16} className="mr-2"/>}
                一键清空
              </button>
          ) : (
              <Link to="/add" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow hover:bg-blue-700 transition-colors">新增错题</Link>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input type="text" placeholder="搜索题目..." className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <button onClick={() => setShowFilters(!showFilters)} className={`px-3 py-2 rounded-xl border ${showFilters ? 'bg-blue-50 text-blue-600' : 'bg-white text-slate-600'}`}><Filter size={18} /></button>
          </div>

          {showFilters && (
             <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm space-y-5 animate-fade-in">
                <div><label className="text-xs font-bold text-slate-400 uppercase mb-2 block">查看模式</label>
                    <div className="flex flex-wrap bg-gray-100 p-1 rounded-lg w-max">
                        {[
                            {k: 'not_mastered', l: '未掌握'}, 
                            {k: 'mastered', l: '已掌握'}, 
                            {k: 'all', l: '全部活跃'},
                            {k: 'deleted', l: '回收站'}
                        ].map(opt => (
                            <button key={opt.k} onClick={() => setStatusFilter(opt.k as any)} className={`px-4 py-1.5 rounded-md text-sm font-medium ${statusFilter === opt.k ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>{opt.l}</button>
                        ))}
                    </div>
                </div>
                <div><label className="text-xs font-bold text-slate-400 uppercase mb-2 block">录入时间</label>
                    <div className="flex flex-wrap gap-2">
                        {[{k: 'today', l: '今天'}, {k: 'yesterday', l: '昨天'}, {k: '3days', l: '近3天'}, {k: 'week', l: '近1周'}, {k: 'month', l: '近30天'}, {k: 'all', l: '全部'}].map(opt => (
                            <button key={opt.k} onClick={() => setTimeFilter(opt.k as any)} className={`text-xs px-3 py-1.5 rounded-full border ${timeFilter === opt.k ? 'bg-blue-500 text-white' : 'bg-white text-slate-600'}`}>{opt.l}</button>
                        ))}
                    </div>
                </div>
                <div><label className="text-xs font-bold text-slate-400 uppercase mb-2 block">正确率筛选: {accRange.min}% - {accRange.max}%</label>
                    <div className="relative h-10 flex items-center px-2">
                        <div className="absolute left-0 right-0 h-1.5 bg-gray-200 rounded-full mx-2"></div>
                        <div className="absolute h-1.5 bg-blue-500 rounded-full" style={{ left: `${accRange.min}%`, right: `${100 - accRange.max}%` }}></div>
                        <input type="range" min="0" max="100" value={accRange.min} onChange={e => setAccRange(p => ({...p, min: Math.min(Number(e.target.value), p.max - 1)}))} className="range-input z-30" />
                        <input type="range" min="0" max="100" value={accRange.max} onChange={e => setAccRange(p => ({...p, max: Math.max(Number(e.target.value), p.min + 1)}))} className="range-input z-40" />
                    </div>
                </div>
             </div>
          )}
          
          <div className="flex flex-col gap-2 bg-white p-2 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
                <button className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filterCategory === 'All' ? 'bg-blue-500 text-white' : 'text-slate-600'}`} onClick={() => { setFilterCategory('All'); setFilterSubCategory('All'); }}>全部</button>
                {Object.values(QuestionCategory).map(cat => (
                  <button key={cat} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${filterCategory === cat ? 'bg-blue-500 text-white' : 'text-slate-600'}`} onClick={() => { setFilterCategory(cat); setFilterSubCategory('All'); }}>{cat}</button>
                ))}
            </div>
            {filterCategory !== 'All' && (
                <div className="flex gap-2 flex-wrap animate-fade-in pl-1 pt-1 border-t border-gray-100">
                     <button onClick={() => setFilterSubCategory('All')} className={`px-3 py-1 rounded-lg text-xs border ${filterSubCategory === 'All' ? 'bg-blue-50 text-blue-600 border-blue-200 font-bold' : 'bg-white text-slate-500 border-gray-200'}`}>全部题型</button>
                     {SUB_CATEGORY_MAP[filterCategory as QuestionCategory]?.map(sub => (
                         <button key={sub} onClick={() => setFilterSubCategory(sub)} className={`px-3 py-1 rounded-lg text-xs border ${filterSubCategory === sub ? 'bg-blue-50 text-blue-600 border-blue-200 font-bold' : 'bg-white text-slate-500 border-gray-200'}`}>{sub}</button>
                     ))}
                </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {filteredQuestions.length === 0 ? (
           <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-300">
               <p className="text-slate-400">{statusFilter === 'deleted' ? '回收站空空如也。' : '没有找到匹配的题目。'}</p>
               {timeFilter === 'today' && statusFilter !== 'deleted' && <button onClick={() => setTimeFilter('all')} className="mt-4 text-blue-500 text-sm font-bold hover:underline">查看全部题目</button>}
           </div>
        ) : (
            <>
            {paginatedQuestions.map(q => (
                <div key={q.id} className={`bg-white rounded-2xl shadow-sm border ${q.isMastered ? 'border-green-100 bg-green-50/20' : q.deletedAt ? 'border-amber-100 bg-amber-50/10 opacity-75' : 'border-gray-100'} overflow-hidden`}>
                   <div className="bg-gray-50 px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                            <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded text-xs font-bold uppercase">{q.category}</span>
                            {q.subCategory && <span className="bg-cyan-50 text-cyan-700 px-2 py-1 rounded text-xs font-medium border border-cyan-100">{q.subCategory}</span>}
                            <span className="text-xs text-slate-400 flex items-center ml-2"><Calendar size={12} className="mr-1" /> {new Date(q.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {q.isMastered && <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold flex items-center border border-green-200"><GraduationCap size={12} className="mr-1"/> 已掌握</span>}
                            {q.deletedAt && <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded text-xs font-bold flex items-center border border-amber-200"><Trash2 size={12} className="mr-1"/> 待永久清理</span>}
                            {q.tags?.map(tag => <span key={tag} className="text-xs text-slate-500 bg-white px-1.5 py-0.5 rounded border border-gray-200 flex items-center"><Hash size={10} className="mr-0.5 text-slate-300"/> {tag}</span>)}
                        </div>
                   </div>

                   <div className="p-6 space-y-5">
                        {q.materials.length > 0 && (
                            <div className={`grid gap-2 ${q.materials.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                {q.materials.map((m, midx) => m === '__IMAGE_REF__' ? <div key={midx} className="h-40 bg-gray-100 rounded-lg animate-pulse"></div> : <img key={midx} src={m} className="w-full object-contain rounded-lg border border-gray-100 max-h-80" alt="Material" />)}
                            </div>
                        )}
                        
                        {q.materialText && (
                            <div 
                                className="p-4 bg-gray-50 rounded-lg border-l-4 border-blue-200 text-lg leading-relaxed text-slate-800 rich-text-display"
                                dangerouslySetInnerHTML={{ __html: q.materialText.replace(/\n/g, '<br/>') }}
                            ></div>
                        )}
                        
                        <h2 className="font-bold text-slate-800 text-lg leading-relaxed whitespace-pre-wrap">{q.stem}</h2>
                        
                        <div className="space-y-2">
                            {q.options.map((opt, idx) => (
                            <div key={idx} className={`flex items-start p-3 rounded-lg border ${idx === q.correctAnswer ? 'border-green-200 bg-green-50/50' : 'border-transparent'}`}>
                                <span className={`w-6 h-6 rounded-full flex items-center justify-center mr-3 text-xs font-bold flex-shrink-0 ${idx === q.correctAnswer ? 'bg-green-500 text-white' : 'bg-gray-100 text-slate-500'}`}>{String.fromCharCode(65 + idx)}</span>
                                <span className={`text-lg ${idx === q.correctAnswer ? 'text-green-800 font-medium' : 'text-slate-600'}`}>{opt}</span>
                            </div>
                            ))}
                        </div>
                   </div>
                   
                   {/* Analysis Section */}
                   {q.analysis && (
                        <div className="bg-blue-50 p-6 border-t border-blue-100">
                             <div className="flex items-center mb-4 text-blue-800 font-bold"><BookOpen size={16} className="mr-2"/> 题目解析</div>
                             <div className="mb-4 bg-white p-4 rounded-xl border border-blue-100 text-slate-700 text-base leading-relaxed rich-text-display" dangerouslySetInnerHTML={{ __html: q.analysis }}></div>
                        </div>
                   )}

                   {(q.noteText || q.notesImage) && (
                        <div className="bg-amber-50 p-6 border-t border-amber-100">
                            <div className="flex items-center mb-4 text-amber-800 font-bold"><BookMarked size={16} className="mr-2"/> 我的笔记</div>
                            {q.noteText && <div className="mb-4 bg-white p-4 rounded-xl border border-amber-100 text-slate-700 text-base leading-relaxed rich-text-display" dangerouslySetInnerHTML={{ __html: q.noteText }}></div>}
                            {!q.noteText && q.notesImage && <img src={q.notesImage === '__IMAGE_REF__' ? '' : q.notesImage} className="max-w-full rounded border border-amber-200" alt="Note"/>}
                        </div>
                    )}

                    <div className="bg-white px-5 py-3 border-t border-gray-100 flex justify-between items-center">
                         <div className="text-xs text-slate-400">历史: 做对 <span className="text-green-600">{q.correctCount || 0}</span> / 做错 <span className="text-red-500">{q.mistakeCount}</span></div>
                        <div className="flex items-center gap-4">
                            {q.deletedAt ? (
                                <>
                                    <button onClick={() => handleRestore(q.id)} disabled={togglingId === q.id} className="text-sm font-medium flex items-center text-blue-600 hover:text-blue-700">
                                        {togglingId === q.id ? <Loader2 size={12} className="animate-spin mr-1"/> : <RotateCcw size={14} className="mr-1"/>} 恢复错题
                                    </button>
                                    <button onClick={() => handleDelete(q.id, true)} disabled={deletingId === q.id} className="text-sm font-medium flex items-center text-red-500 hover:text-red-600">
                                        {deletingId === q.id ? <Loader2 size={12} className="animate-spin mr-1"/> : <Trash2 size={14} className="mr-1"/>} 物理删除
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button onClick={() => toggleMastered(q)} disabled={togglingId === q.id} className={`text-sm font-medium flex items-center ${togglingId === q.id ? 'text-gray-400' : q.isMastered ? 'text-green-600' : 'text-slate-400 hover:text-green-600'}`}>
                                        {togglingId === q.id && <Loader2 size={12} className="animate-spin mr-1"/>}{q.isMastered ? '取消掌握' : '标记掌握'}
                                    </button>
                                    <div className="h-4 w-px bg-gray-200"></div>
                                    <Link to={`/edit/${q.id}`} className="text-slate-400 hover:text-blue-500 flex items-center gap-1 text-sm"><Edit2 size={14} /> 编辑</Link>
                                    <button onClick={() => handleDelete(q.id, false)} disabled={deletingId === q.id} className="text-slate-400 hover:text-red-500 flex items-center gap-1 text-sm">{deletingId === q.id ? <Loader2 size={14} className="animate-spin" /> : <Trash size={14} />} 移入回收站</button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            ))}
            {totalPages > 1 && (
                <div className="flex justify-center items-center gap-4 mt-6">
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-2 disabled:opacity-30"><ChevronLeft size={20} /></button>
                    <span className="text-sm font-medium text-slate-500">{currentPage} / {totalPages}</span>
                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-2 disabled:opacity-30"><ChevronRight size={20} /></button>
                </div>
            )}
            </>
        )}
      </div>
    </div>
  );
};

export default QuestionBank;
