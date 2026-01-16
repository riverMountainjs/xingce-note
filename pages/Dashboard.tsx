import React, { useEffect, useState } from 'react';
import { getStats } from '../services/storageService';
import { TrendingUp, Book, Loader2, GraduationCap, Calendar, History, CalendarDays, PenTool } from 'lucide-react';

const Dashboard = () => {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      const data = await getStats();
      setStats(data);
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
         <StatCard icon={<Calendar size={24} />} label="今日新增" value={stats.todayMistakes} color="bg-orange-500" />
         <StatCard icon={<History size={24} />} label="昨日新增" value={stats.yesterdayMistakes} color="bg-slate-500" />
         <StatCard icon={<TrendingUp size={24} />} label="近一周新增" value={stats.weekMistakes} color="bg-indigo-500" />
         <StatCard icon={<CalendarDays size={24} />} label="近一月新增" value={stats.monthMistakes} color="bg-rose-500" />
      </div>
    </div>
  );
};

export default Dashboard;