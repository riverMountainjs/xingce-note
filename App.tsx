import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import QuestionBank from './pages/QuestionBank';
import QuestionEntry from './pages/QuestionEntry';
import Practice from './pages/Practice';
import Profile from './pages/Profile';
import Login from './pages/Login';
import { getUser } from './services/storageService';

const ProtectedRoute = ({ children }: { children?: React.ReactNode }) => {
  const user = getUser();
  if (!user || !user.id) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

const App = () => {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* Fullscreen Practice Mode - Outside Standard Layout */}
        <Route path="/practice" element={
          <ProtectedRoute>
            <Practice />
          </ProtectedRoute>
        } />

        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={<Dashboard />} />
          <Route path="questions" element={<QuestionBank />} />
          <Route path="add" element={<QuestionEntry />} />
          <Route path="edit/:id" element={<QuestionEntry />} />
          <Route path="profile" element={<Profile />} />
        </Route>
      </Routes>
    </HashRouter>
  );
};

export default App;