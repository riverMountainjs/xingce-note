
import React, { useEffect, useState } from 'react';
import { getStats, getQuestions } from '../services/storageService';
import { TrendingUp, Book, Loader2, GraduationCap, Calendar, History, CalendarDays, PenTool, BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const Dashboard = () => {
  const [stats, setStats] = useState<any>(null);
  const [practiceDist, setPracticeDist] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const data = await getStats();
      setStats(data);

      // Calculate Practice Count Distribution
      const allQuestions = await getQuestions();
      const counts = [0, 0, 0, 0, 0, 0]; // 0, 1, 2, 3, 4, 5+
      
      allQuestions.forEach(q => {
          if (q.deletedAt) return;
          const totalPractice = (q.mistakeCount || 0) + (q.correctCount || 0);
          const idx = Math.min(totalPractice, 5);
          counts[idx]++;
      });

      const distData = counts.map((count, i) => ({
          name: i === 5 ? '5+次' : `${i}次`,
          count: count
      }));
      setPracticeDist(distData);
    };
    load();
  }, []);

  if (!stats) return <div className="flex h-64 items-center justify-center text-slate-400"><Loader2 className="animate-spin mr-2"/> 加载数据中...</div>;

  const StatCard = ({ icon, label, value, color }: any) => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center space-x-4 transition-transform hover:scale-[1.02]">
      <div className={`p-4 rounded-xl ${color} bg-opacity-10 text-opacity-100`}>
        {React.cloneElement(icon, { className: `text-${color.split('-')[1]}-600` })}
      </div>
      <div>
        <p className="text-slate-500 text-sm font-medium">{label}</p>
        <p className="text-2xl font-bold text-slate-800">{value}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">学习概览</h1>
          <p className="text-slate-500 mt-1">坚持复习，积少成多。</p>
        </div>
        <div className="text-sm text-slate-400">同步状态: {(import.meta as any).env?.PROD ? 'Cloud' : 'Local'}</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard icon={<Book size={24} />} label="总错题" value={stats.total} color="bg-blue-500" />
        <StatCard icon={<GraduationCap size={24} />} label="已掌握" value={stats.masteredCount} color="bg-green-500" />
        <StatCard icon={<PenTool size={24} />} label="今日刷题数" value={stats.todayPracticeCount} color="bg-purple-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Practice Frequency Chart */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 lg:col-span-2">
              <h3 className="font-bold text-slate-700 mb-6 flex items-center">
                  <BarChart3 size={20} className="mr-2 text-indigo-500"/> 题目重做次数分布
              </h3>
              <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={practiceDist} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                          <XAxis dataKey="name" tick={{fontSize: 12, fill: '#94a3b8'}} axisLine={false} tickLine={false} />
                          <YAxis tick={{fontSize: 12, fill: '#94a3b8'}} axisLine={false} tickLine={false} />
                          <Tooltip 
                            cursor={{fill: '#f1f5f9'}}
                            contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}}
                          />
                          <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={40}>
                              {practiceDist.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={index === 0 ? '#fbbf24' : '#6366f1'} />
                              ))}
                          </Bar>
                      </BarChart>
                  </ResponsiveContainer>
              </div>
              <p className="text-center text-xs text-slate-400 mt-2">黄色代表从未复习过的题目，建议优先处理</p>
          </div>

          <div className="grid grid-cols-1 gap-6">
             <StatCard icon={<Calendar size={24} />} label="今日新增" value={stats.todayMistakes} color="bg-orange-500" />
             <StatCard icon={<History size={24} />} label="昨日新增" value={stats.yesterdayMistakes} color="bg-slate-500" />
             <StatCard icon={<TrendingUp size={24} />} label="近一周新增" value={stats.weekMistakes} color="bg-indigo-500" />
          </div>
      </div>
    </div>
  );
};

export default Dashboard;
