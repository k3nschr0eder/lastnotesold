import { createFileRoute, Outlet, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const [session, setSession] = useState<{ email: string; isSuperadmin: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const isLoginPage = location.pathname === "/admin/login";

  useEffect(() => {
    if (isLoginPage) {
      setLoading(false);
      return;
    }

    fetch("/api/admin/session")
      .then((r) => {
        if (r.status === 401) {
          navigate({ to: "/admin/login" });
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data) setSession(data);
        setLoading(false);
      })
      .catch(() => {
        navigate({ to: "/admin/login" });
      });
  }, [isLoginPage]);

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    navigate({ to: "/admin/login" });
  };

  // On login page, render without sidebar
  if (isLoginPage) {
    return (
      <div className="min-h-screen bg-gray-950">
        {loading ? (
          <div className="flex h-screen items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          </div>
        ) : (
          <Outlet />
        )}
      </div>
    );
  }

  // Close sidebar on mobile when navigating
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Loading state */}
      {loading && (
        <div className="flex h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        </div>
      )}

      {!loading && session && (
        <div className="flex min-h-screen">
          {/* Mobile backdrop */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/60 lg:hidden"
              onClick={closeSidebar}
            />
          )}

          {/* Sidebar */}
          <aside
            className={`fixed inset-y-0 left-0 z-50 w-64 transform bg-gray-900 border-r border-gray-800 transition-transform duration-200 lg:relative lg:translate-x-0 ${
              sidebarOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div className="flex h-full flex-col">
              {/* Logo */}
              <div className="flex items-center gap-2 px-4 py-4 border-b border-gray-800">
                <span className="text-xl">💵</span>
                <span className="text-lg font-bold text-white">LastNoteSold</span>
                <span className="ml-auto rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-400">
                  ADMIN
                </span>
              </div>

              {/* Nav */}
              <nav className="flex-1 space-y-1 px-3 py-4">
                <SidebarLink to="/admin/subscriptions" icon="📊" onClick={closeSidebar}>
                  Subscriptions
                </SidebarLink>
                <SidebarLink to="/admin/coupons" icon="🎟️" onClick={closeSidebar}>
                  Coupons
                </SidebarLink>
                <SidebarLink to="/admin/referrals" icon="💰" onClick={closeSidebar}>
                  Referrals
                </SidebarLink>
                {session.isSuperadmin && (
                  <SidebarLink to="/admin/users" icon="👥" onClick={closeSidebar}>
                    Users
                  </SidebarLink>
                )}
              </nav>

              {/* Logout */}
              <div className="border-t border-gray-800 px-3 py-4">
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
                >
                  <span>🚪</span>
                  Logout
                </button>
              </div>
            </div>
          </aside>

          {/* Main content */}
          <div className="flex flex-1 flex-col min-w-0">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-gray-800 bg-gray-900 px-4 py-3 lg:px-6">
              <button
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white lg:hidden"
                onClick={() => setSidebarOpen(true)}
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div className="hidden lg:block" />
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-300">{session.email}</span>
                {session.isSuperadmin && (
                  <span className="rounded bg-purple-500/20 px-2 py-0.5 text-xs font-semibold text-purple-400">
                    SUPERADMIN
                  </span>
                )}
              </div>
            </header>

            {/* Page content */}
            <main className="flex-1 p-4 lg:p-6">
              <Outlet />
            </main>
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarLink({
  to,
  icon,
  children,
  onClick,
}: {
  to: string;
  icon: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  const location = useLocation();
  const isActive = location.pathname.startsWith(to);

  return (
    <Link
      to={to}
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
        isActive
          ? "bg-emerald-950/30 text-emerald-400 border border-emerald-500/50"
          : "text-gray-400 hover:bg-gray-800 hover:text-white"
      }`}
    >
      <span>{icon}</span>
      {children}
    </Link>
  );
}
