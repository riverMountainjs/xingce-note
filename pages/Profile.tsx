
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUser, saveUser, getSessions, getQuestions, deleteSession, hydrateQuestion, restoreBackup, logoutUser } from '../services/storageService';
import { User, PracticeSession, Question } from '../types';
import { Save, Clock, Download, Upload, AlertTriangle, Lock, CheckCircle2, Trash2, Eye, ChevronLeft, ChevronRight, Loader2, RefreshCw, FileText, Sparkles, Info, Key, Copy, Check } from 'lucide-react';
import { jsPDF } from 'jspdf';

const ITEMS_PER_PAGE = 10;

const Profile = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [externalToken, setExternalToken] = useState(''); // New State for Token
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  
  // UI States
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshingAvatar, setIsRefreshingAvatar] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [isRestoring, setIsRestoring] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  const importInputRef = useRef<HTMLInputElement>(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const load = async () => {
        const u = getUser();
        if (u) {
            setUser(u);
            setNickname(u.nickname);
            setPassword(u.password || '');
            setExternalToken(u.externalToken || '');
            const sess = await getSessions();
            setSessions(sess);
        }
    };
    load();
  }, []);

  const handleSave = async () => {
    if (user && nickname && !isSaving) {
      setIsSaving(true);
      try {
        const updatedUser = { ...user, nickname, password, externalToken };
        await saveUser(updatedUser);
        setUser(updatedUser);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      } finally {
        setIsSaving(false);
      }
    }
  };

  const generateToken = () => {
    const newToken = crypto.randomUUID();
    setExternalToken(newToken);
  };

  const copyToken = () => {
      navigator.clipboard.writeText(externalToken);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
  };

  const refreshAvatar = async () => {
    if (user && !isRefreshingAvatar) {
      setIsRefreshingAvatar(true);
      try {
        const newAvatar = `https://api.dicebear.com/9.x/avataaars/svg?seed=${Date.now()}`;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = newAvatar;
        await new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; });
        const updatedUser = { ...user, avatar: newAvatar };
        await saveUser(updatedUser);
        setUser(updatedUser);
      } finally {
        setIsRefreshingAvatar(false);
      }
    }
  };

  const generatePDFWorkbook = async () => {
    setIsExportingPDF(true);
    setExportProgress(10);
    try {
        const questions = await getQuestions();
        const doc = new jsPDF();
        
        // 字体配置（简单处理，中文支持通常需要自定义字体文件，此处仅作基础演示）
        // 实际生产环境建议引入 NotoSansSC 字体以支持中文导出
        doc.setFontSize(22);
        doc.text("行测错题本 - 专属讲义", 105, 20, { align: "center" });
        doc.setFontSize(10);
        doc.text(`生成时间: ${new Date().toLocaleDateString()}`, 105, 30, { align: "center" });

        let y = 40;
        const pageHeight = 280;

        for (let i = 0; i < questions.length; i++) {
            setExportProgress(10 + Math.round((i / questions.length) * 80));
            const q = questions[i];
            
            // 检查分页
            if (y > pageHeight - 40) {
                doc.addPage();
                y = 20;
            }

            // 题目元数据
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text(`[${q.category}] ${q.subCategory || ''} - 录入: ${new Date(q.createdAt).toLocaleDateString()}`, 20, y);
            y += 6;

            // 题干
            doc.setFontSize(12);
            doc.setTextColor(0);
            const splitStem = doc.splitTextToSize(`${i + 1}. ${q.stem}`, 170);
            doc.text(splitStem, 20, y);
            y += (splitStem.length * 6) + 4;

            // 选项
            q.options.forEach((opt, idx) => {
                if (y > pageHeight) { doc.addPage(); y = 20; }
                const prefix = String.fromCharCode(65 + idx) + ". ";
                // 简单处理选项如果是图片的情况
                if (opt.startsWith('data:image')) {
                    doc.text(prefix + "[图片选项]", 25, y);
                } else {
                    doc.text(prefix + opt, 25, y);
                }
                y += 6;
            });

            y += 10;
        }
        
        doc.save(`错题本讲义_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
        console.error(e);
        alert("导出 PDF 失败，请重试");
    } finally {
        setIsExportingPDF(false);
        setExportProgress(0);
    }
  };

  const handleExportJSON = async () => {
      const u = getUser();
      if (!u) return;
      const q = await getQuestions();
      const s = await getSessions();
      
      const backup = {
          version: 2,
          exportedAt: Date.now(),
          user: u,
          questions: q,
          sessions: s
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `xingce_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      if (!window.confirm("导入备份将合并当前数据，可能会覆盖同名ID的记录。确定继续吗？")) {
          e.target.value = '';
          return;
      }

      const reader = new FileReader();
      reader.onload = async (event) => {
          try {
              const json = JSON.parse(event.target?.result as string);
              setIsRestoring(true);
              await restoreBackup(json);
              alert("数据导入成功！页面将刷新。");
              window.location.reload();
          } catch (err) {
              console.error(err);
              alert("导入失败：无效的备份文件格式");
          } finally {
              setIsRestoring(false);
          }
      };
      reader.readAsText(file);
      e.target.value = '';
  };

  const handleDeleteSession = async (id: string) => {
      if (window.confirm("确定要删除这条练习记录吗？此操作不可撤销。")) {
          setDeletingSessionId(id);
          try {
              await deleteSession(id);
              setSessions(prev => prev.filter(s => s.id !== id));
          } catch (e) {
              alert("删除失败");
          } finally {
              setDeletingSessionId(null);
          }
      }
  };

  if (!user) return null;
  const paginatedSessions = sessions.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="space-y-8 max-w-4xl mx-auto animate-fade-in relative pb-10">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-800">个人中心</h1>
      </div>

      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row items-start gap-8">
        <div className="relative group cursor-pointer self-center md:self-start" onClick={refreshAvatar}>
          <img src={user.avatar} crossOrigin="anonymous" className="w-32 h-32 rounded-full border-4 border-fenbi-50 shadow-md transition-transform group-hover:scale-105 bg-gray-100" alt="Avatar" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-full opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-bold">
             <RefreshCw size={24} className={isRefreshingAvatar ? 'animate-spin' : ''} />
          </div>
        </div>
        <div className="flex-1 w-full space-y-4">
          <div>
             <label className="block text-sm font-medium text-slate-700 mb-1">昵称</label>
             <input type="text" className="w-full border-gray-200 rounded-lg px-4 py-2" value={nickname} onChange={(e) => setNickname(e.target.value)} />
          </div>
          <div>
             <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center"><Lock size={14} className="mr-1"/> 修改密码</label>
             <input type="password" className="w-full border-gray-200 rounded-lg px-4 py-2" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="输入新密码" />
          </div>
          <div className="flex gap-3">
            <button onClick={handleSave} disabled={isSaving} className={`px-6 py-2 rounded-lg text-sm font-bold shadow flex items-center ${saveSuccess ? 'bg-green-500 text-white' : 'bg-fenbi-500 text-white hover:bg-fenbi-600 disabled:opacity-50'}`}>
                {isSaving ? <Loader2 size={16} className="mr-2 animate-spin" /> : saveSuccess ? <CheckCircle2 size={16} className="mr-2" /> : <Save size={16} className="mr-2" />}
                {saveSuccess ? '已保存' : isSaving ? '保存中...' : '保存修改'}
            </button>
            <button onClick={() => { logoutUser(); navigate('/login'); }} className="px-6 py-2 rounded-lg text-sm font-bold border border-gray-200 text-slate-500 hover:bg-gray-50">退出登录</button>
          </div>
        </div>
      </div>

      {/* New Plugin Config Section */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
             <Key size={20} className="mr-2 text-indigo-500" /> 插件同步配置
          </h2>
          <div className="space-y-4">
              <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
                  <p className="text-xs text-indigo-700 mb-2 font-bold flex items-center uppercase tracking-wider">
                      <Sparkles size={12} className="mr-1"/> 同步令牌 (External Token)
                  </p>
                  <div className="flex gap-2">
                      <input 
                        type="text" 
                        readOnly 
                        className="flex-1 bg-white border border-indigo-200 rounded-lg px-3 py-2 text-sm font-mono text-indigo-900" 
                        value={externalToken || '尚未生成令牌'} 
                      />
                      <button 
                        onClick={copyToken}
                        disabled={!externalToken}
                        className="bg-white border border-indigo-200 p-2 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-30"
                        title="复制令牌"
                      >
                        {copiedToken ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                      </button>
                      <button 
                        onClick={generateToken}
                        className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-indigo-700 shadow-sm whitespace-nowrap"
                      >
                         {externalToken ? '重新生成' : '立即生成'}
                      </button>
                  </div>
                  <p className="mt-2 text-[10px] text-indigo-400">将此令牌粘贴到油猴脚本的 <code>EXTERNAL_TOKEN</code> 配置项中，即可实现免跳转录入。</p>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <p className="text-xs text-slate-500 mb-2 font-bold flex items-center uppercase tracking-wider">
                      服务器地址 (Server URL)
                  </p>
                  <div className="flex gap-2">
                      <input 
                        type="text" 
                        readOnly 
                        className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-600" 
                        value={window.location.origin} 
                      />
                      <button 
                        onClick={() => { navigator.clipboard.writeText(window.location.origin); alert('URL 已复制'); }}
                        className="bg-white border border-slate-200 p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
                      >
                        <Copy size={18} />
                      </button>
                  </div>
              </div>
          </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
          <Sparkles size={20} className="mr-2 text-blue-500" /> 备份与导出
        </h2>
         <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button onClick={generatePDFWorkbook} disabled={isExportingPDF} className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-blue-100 rounded-2xl bg-blue-50/30 hover:bg-blue-50 hover:border-blue-300 transition-all group">
            <div className="w-12 h-12 bg-blue-500 text-white rounded-xl flex items-center justify-center mb-3 shadow-lg group-hover:scale-110 transition-transform">
                {isExportingPDF ? <Loader2 className="animate-spin" size={24}/> : <FileText size={24} />}
            </div>
            <span className="font-bold text-blue-700">{isExportingPDF ? `导出中 ${exportProgress}%` : '导出 PDF 讲义'}</span>
          </button>
          <button onClick={handleExportJSON} className="flex flex-col items-center justify-center p-6 border border-gray-200 rounded-2xl hover:bg-gray-50 transition-all group">
            <div className="w-12 h-12 bg-gray-100 text-gray-500 rounded-xl flex items-center justify-center mb-3 group-hover:bg-gray-200 transition-colors"><Download size={24} /></div>
            <span className="font-bold text-slate-700">备份 JSON 数据</span>
          </button>
          <button onClick={() => importInputRef.current?.click()} className="flex flex-col items-center justify-center p-6 border border-gray-200 rounded-2xl hover:bg-gray-50 transition-all group">
            <div className="w-12 h-12 bg-green-50 text-green-500 rounded-xl flex items-center justify-center mb-3 group-hover:bg-green-100 transition-colors">
                {isRestoring ? <Loader2 className="animate-spin" size={24}/> : <Upload size={24} />}
            </div>
            <span className="font-bold text-green-700">{isRestoring ? '导入中...' : '导入/合并备份'}</span>
            <input type="file" ref={importInputRef} className="hidden" accept=".json" onChange={handleImportJSON} />
          </button>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center"><Clock size={20} className="mr-2 text-slate-400" /> 练习历史</h2>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {sessions.length === 0 ? <div className="p-8 text-center text-slate-400">暂无练习记录</div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-slate-500 font-medium">
                  <tr><th className="px-6 py-3">时间</th><th className="px-6 py-3">题量</th><th className="px-6 py-3">耗时</th><th className="px-6 py-3">正确率</th><th className="px-6 py-3 text-right">操作</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedSessions.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">{new Date(s.date).toLocaleString()}</td>
                      <td className="px-6 py-4">{s.questionIds.length} 题</td>
                      <td className="px-6 py-4">{Math.floor(s.totalDuration / 60)}分{s.totalDuration % 60}秒</td>
                      <td className="px-6 py-4 font-bold text-fenbi-600">{s.score}%</td>
                      <td className="px-6 py-4 text-right">
                          <button onClick={() => navigate('/practice', { state: { session: s } })} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg mr-2"><Eye size={16} /></button>
                          <button onClick={() => handleDeleteSession(s.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg">
                              {deletingSessionId === s.id ? <Loader2 size={16} className="animate-spin"/> : <Trash2 size={16} />}
                          </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <div id="pdf-export-container" style={{ position: 'absolute', left: '-9999px', top: 0, width: '800px', background: 'white' }}></div>
    </div>
  );
};

export default Profile;
