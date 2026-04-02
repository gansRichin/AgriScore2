import { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ClipboardList, PlusCircle, LogOut, BarChart3, FileText } from 'lucide-react';

const applicantLinks = [
  { to: '/dashboard', icon: ClipboardList, label: 'Мои заявки' },
  { to: '/application/new', icon: PlusCircle, label: 'Новая заявка' },
];

const expertLinks = [
  { to: '/expert', icon: BarChart3, label: 'Очередь' },
  { to: '/expert/registry', icon: FileText, label: 'Реестр' },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { role, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const links = role === 'expert' ? expertLinks : applicantLinks;

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex">
      {/* Sidebar - desktop */}
      <aside className="hidden md:flex flex-col w-56 border-r border-primary/20 bg-sidebar p-4">
        <Link to={role === 'expert' ? '/expert' : '/dashboard'} className="flex items-center gap-2 mb-8 px-2">
          <span className="text-2xl">🌾</span>
          <span className="font-display text-lg font-bold text-primary">AgriScore</span>
        </Link>
        <nav className="flex-1 space-y-1">
          {links.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                location.pathname === to || location.pathname.startsWith(to + '/')
                  ? 'bg-primary/15 text-primary font-medium'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Выйти
        </button>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-sidebar border-t border-primary/20 flex justify-around py-2">
        {links.map(({ to, icon: Icon, label }) => (
          <Link
            key={to}
            to={to}
            className={`flex flex-col items-center gap-1 text-xs px-3 py-1 ${
              location.pathname === to ? 'text-primary' : 'text-sidebar-foreground'
            }`}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        ))}
        <button
          onClick={handleSignOut}
          className="flex flex-col items-center gap-1 text-xs px-3 py-1 text-sidebar-foreground"
        >
          <LogOut className="h-5 w-5" />
          Выйти
        </button>
      </nav>

      {/* Main content */}
      <main className="flex-1 p-4 md:p-8 pb-20 md:pb-8 overflow-auto">
        {children}
      </main>
    </div>
  );
}
