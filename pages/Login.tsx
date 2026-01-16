import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginUser, registerUser, getUser } from '../services/storageService';
import { User, Lock, ArrowRight, BookMarked, Loader2 } from 'lucide-react';

const Login = () => {
  const navigate = useNavigate();
  const [isRegister, setIsRegister] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    nickname: ''
  });
  const [error, setError] = useState('');

  useEffect(() => {
    // Auto-redirect if already logged in
    const user = getUser();
    if (user && user.id) {
      navigate('/');
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
        if (isRegister) {
            if (!formData.username || !formData.password || !formData.nickname) {
                setError("请填写所有必填项");
                setIsLoading(false);
                return;
            }
            const result = await registerUser(formData.username, formData.password, formData.nickname);
            if (result.success) {
                navigate('/');
            } else {
                setError(result.message);
            }
        } else {
            if (!formData.username || !formData.password) {
                setError("请输入用户名和密码");
                setIsLoading(false);
                return;
            }
            const result = await loginUser(formData.username, formData.password);
            if (result.success) {
                navigate('/');
            } else {
                setError(result.message);
            }
        }
    } catch (e) {
        setError('网络错误或服务器无响应');
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md p-8 rounded-3xl shadow-xl border border-gray-100 animate-fade-in">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl mx-auto flex items-center justify-center text-white text-3xl font-bold shadow-lg shadow-blue-200 mb-4 transition-transform hover:scale-110">
            <BookMarked size={32} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">{isRegister ? '创建账号' : '欢迎回来'}</h1>
          <p className="text-slate-500 mt-1">{isRegister ? '开始您的行测提分之旅' : '登录您的专属行测错题本'}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">用户名</label>
            <div className="relative">
              <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                required
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="请输入用户名"
                value={formData.username}
                onChange={(e) => setFormData({...formData, username: e.target.value})}
              />
            </div>
          </div>

          <div>
             <label className="block text-sm font-medium text-slate-700 mb-1">密码</label>
             <div className="relative">
               <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
               <input 
                 type="password" 
                 required
                 className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                 placeholder="请输入密码"
                 value={formData.password}
                 onChange={(e) => setFormData({...formData, password: e.target.value})}
               />
             </div>
          </div>

          {isRegister && (
            <div className="animate-fade-in">
              <label className="block text-sm font-medium text-slate-700 mb-1">昵称</label>
              <input 
                type="text" 
                required
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="怎么称呼您？"
                value={formData.nickname}
                onChange={(e) => setFormData({...formData, nickname: e.target.value})}
              />
            </div>
          )}
          
          {error && (
            <div className="text-red-500 text-sm text-center bg-red-50 p-2 rounded-lg">
              {error}
            </div>
          )}

          <button 
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 flex items-center justify-center group disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="animate-spin mr-2"/> : (
                <>
                {isRegister ? '注册并登录' : '登 录'}
                {!isRegister && <ArrowRight size={18} className="ml-2 group-hover:translate-x-1 transition-transform" />}
                </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button 
            onClick={() => { setIsRegister(!isRegister); setError(''); }}
            className="text-blue-600 font-medium hover:text-blue-700 text-sm flex items-center justify-center mx-auto"
          >
            {isRegister ? '已有账号？去登录' : '没有账号？去注册'}
          </button>
        </div>
        
        <p className="text-center text-xs text-slate-300 mt-8">
           数据模式: {(import.meta as any).env?.PROD ? '云端同步 (Cloudflare D1)' : '本地存储 (Development)'}
        </p>
      </div>
    </div>
  );
};

export default Login;