import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ApplicationNew from "./pages/ApplicationNew";
import ApplicationDetail from "./pages/ApplicationDetail";
import ExpertDashboard from "./pages/ExpertDashboard";
import ExpertReview from "./pages/ExpertReview";
import ExpertRegistry from "./pages/ExpertRegistry";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children, requiredRole }: { children: React.ReactNode; requiredRole?: string }) {
  const { user, role, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Загрузка...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (requiredRole && role !== requiredRole) return <Navigate to={role === 'expert' ? '/expert' : '/dashboard'} replace />;
  return <>{children}</>;
}

function AuthRedirect() {
  const { user, role, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Загрузка...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={role === 'expert' ? '/expert' : '/dashboard'} replace />;
}

function LoginGuard() {
  const { user, role, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Загрузка...</div>;
  if (user) return <Navigate to={role === 'expert' ? '/expert' : '/dashboard'} replace />;
  return <Login />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<AuthRedirect />} />
            <Route path="/login" element={<LoginGuard />} />
            <Route path="/dashboard" element={<ProtectedRoute requiredRole="applicant"><Dashboard /></ProtectedRoute>} />
            <Route path="/application/new" element={<ProtectedRoute requiredRole="applicant"><ApplicationNew /></ProtectedRoute>} />
            <Route path="/application/:id" element={<ProtectedRoute><ApplicationDetail /></ProtectedRoute>} />
            <Route path="/expert" element={<ProtectedRoute requiredRole="expert"><ExpertDashboard /></ProtectedRoute>} />
            <Route path="/expert/application/:id" element={<ProtectedRoute requiredRole="expert"><ExpertReview /></ProtectedRoute>} />
            <Route path="/expert/registry" element={<ProtectedRoute requiredRole="expert"><ExpertRegistry /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
