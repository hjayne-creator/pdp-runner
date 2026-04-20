import { Link, useLocation } from 'react-router-dom';
import { Home, Zap, History, Settings } from 'lucide-react';
import { clsx } from 'clsx';

const NAV = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/run', label: 'Runner', icon: Zap },
  { to: '/history', label: 'Job History', icon: History },
  { to: '/admin', label: 'Admin', icon: Settings },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 flex items-center h-14 gap-6">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 bg-brand-600 rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-gray-900 text-sm">PDP Runner</span>
          </Link>

          <div className="h-5 w-px bg-gray-200" />

          {/* Nav links */}
          <nav className="flex items-center gap-1">
            {NAV.map(({ to, label, icon: Icon }) => {
              const active =
                to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`);
              return (
                <Link
                  key={to}
                  to={to}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    active
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100',
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto">
            <span className="text-xs text-gray-400 font-mono">DynEcom</span>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}
