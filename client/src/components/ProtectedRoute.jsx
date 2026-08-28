import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Spinner } from './UI';

export default function ProtectedRoute({ children, permission }) {
  const { user, loading, hasPermission, profile } = useAuth();
  const location = useLocation();
  if (loading) return <div className="min-h-screen bg-slate-50 dark:bg-slate-950"><Spinner label="Securing your session…" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (profile?.must_change_password && location.pathname !== '/settings') return <Navigate to="/settings?password=required" replace />;
  if (permission && !hasPermission(permission)) return <Navigate to="/unauthorized" replace />;
  return children;
}
