import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { BookOpen, Home, PenTool, PlusCircle, LogOut, BookMarked, Menu, X } from 'lucide-react';
import { getUser, logoutUser } from '../services/storageService';

const Layout = () => {
  const user = getUser();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleLogout = () => {
    logoutUser();
    navigate('/login');
  };

  if (!user || !user.id) {
    navigate('/login');
    return null;
  }

  const navItems = [
    { icon: <Home size={20} />, label: "概览", path: "/" },
    { icon: <BookOpen size={20} />, label: "错题集", path: "/questions" },
    { icon: <PlusCircle size={20} />, label: "录题", path: "/add" },
    { icon: <PenTool size={20} />, label: "刷题", path: "/practice" },
  ];

  return (
    <div className="flex h-screen bg-gray-50 text-slate-800 font-sans overflow-hidden">
      {/* Mobile/Tablet Header for Sidebar Toggle */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-gray-200 z-30 flex items-center px-4 justify-between">
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-slate-600">
              <Menu size={24} />
          </button>
          <span className="font-bold text-lg text-slate-700">行测错题本</span>
          <div className="w-8"></div> {/* Spacer */}
      </div>

      {/* Overlay */}
      {isSidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/20 z-40 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          ></div>
      )}

      {/* Sidebar - Drawer style on mobile, Collapsed/Expandable on Desktop */}
      <aside className={`
          fixed lg:static inset-y-0 left-0 z-50
          w-64 bg-white border-r border-gray-100 flex flex-col justify-between transition-transform duration-300
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          lg:w-20 xl:w-64
      `}>
        <div>
          <div className="h-14 lg:h-20 flex items-center justify-between px-4 lg:justify-center border-b border-gray-50">
             <div className="flex items-center">
                <div className="w-8 h-8 lg:w-10 lg:h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-blue-200">
                  <BookMarked size={20} />
                </div>
                <span className="lg:hidden xl:block ml-3 font-bold text-xl tracking-tight text-slate-700">行测错题本</span>
             </div>
             <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-1 text-slate-400">
                <X size={24} />
             </button>
          </div>

          <nav className="p-4 space-y-2">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setIsSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center p-3 rounded-xl transition-all duration-200 group whitespace-nowrap overflow-hidden ${
                    isActive
                      ? "bg-blue-50 text-blue-600 font-medium shadow-sm"
                      : "text-slate-500 hover:bg-gray-50 hover:text-slate-700"
                  }`
                }
              >
                <div className="min-w-[20px]">{item.icon}</div>
                <span className="lg:hidden xl:block ml-3">{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="p-4 border-t border-gray-50">
          <Link to="/profile" onClick={() => setIsSidebarOpen(false)} className="flex items-center p-2 rounded-xl bg-gray-50 mb-2 hover:bg-gray-100 transition-colors whitespace-nowrap overflow-hidden">
            <img 
              src={user.avatar || "https://picsum.photos/100"} 
              alt="User" 
              className="w-8 h-8 lg:w-10 lg:h-10 rounded-full border-2 border-white shadow-sm flex-shrink-0"
            />
            <div className="lg:hidden xl:block ml-3 overflow-hidden">
              <p className="text-sm font-semibold truncate">{user.nickname}</p>
              <p className="text-xs text-slate-400 truncate">个人中心</p>
            </div>
          </Link>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center xl:justify-start p-2 text-slate-400 hover:text-red-500 transition-colors whitespace-nowrap"
          >
            <LogOut size={18} />
            <span className="lg:hidden xl:block ml-3 text-sm">退出</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto h-full pt-14 lg:pt-0 scroll-smooth">
        <div className="max-w-7xl mx-auto p-4 lg:p-8 pb-24">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;