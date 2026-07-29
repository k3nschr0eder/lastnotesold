import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

interface AdminSession {
  email: string;
  isSuperadmin: boolean;
}

export const Route = createFileRoute("/admin/users")({
  component: AdminUsers,
});

function AdminUsers() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/session")
      .then((r) => r.json())
      .then((d) => { setSession(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (!session?.isSuperadmin) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-8 text-center">
        <p className="text-lg font-semibold text-red-400">Access Denied</p>
        <p className="mt-2 text-sm text-gray-400">
          Only superadmins can view this page.
        </p>
      </div>
    );
  }

  // Parse env-configured admins (these are placeholder values set at build time;
  // live env vars are injected by build-vercel.sh)
  const adminEmails = ["(configured at runtime via ADMIN_EMAILS env)"];
  const superadminEmails = ["(configured at runtime via SUPERADMIN_EMAILS env)"];

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Admin Users</h1>

      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-200 mb-3">
            Superadmins{" "}
            <span className="ml-2 rounded bg-purple-500/20 px-2 py-0.5 text-xs text-purple-400">
              {superadminEmails.length}
            </span>
          </h2>
          <ul className="space-y-2">
            {superadminEmails.map((email) => (
              <li
                key={email}
                className="flex items-center gap-2 rounded-lg bg-gray-800/50 px-3 py-2 text-sm"
              >
                <span className="text-gray-300">{email}</span>
                <span className="rounded bg-purple-500/20 px-2 py-0.5 text-xs font-semibold text-purple-400">
                  SUPERADMIN
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-gray-200 mb-3">
            Admins{" "}
            <span className="ml-2 rounded bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400">
              {adminEmails.length}
            </span>
          </h2>
          <ul className="space-y-2">
            {adminEmails.map((email) => (
              <li
                key={email}
                className="flex items-center gap-2 rounded-lg bg-gray-800/50 px-3 py-2 text-sm"
              >
                <span className="text-gray-300">{email}</span>
                <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-400">
                  ADMIN
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-6 text-xs text-gray-500">
          Admin access is managed via environment variables: <code className="text-gray-400">ADMIN_EMAILS</code>{" "}
          and <code className="text-gray-400">SUPERADMIN_EMAILS</code>. Update these in your{" "}
          <code className="text-gray-400">.env</code> file or Vercel environment variables.
        </p>
      </div>
    </div>
  );
}
