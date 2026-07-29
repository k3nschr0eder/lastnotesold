import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

interface KpiData {
  listMrr: number;
  effectiveMrr: number;
  activeSubscribers: number;
  churnRate: number;
}

interface Customer {
  customerId: string;
  email: string;
  tier: string;
  listAmount: number;
  effectiveAmount: number;
  discount: number | null;
  status: string;
}

export const Route = createFileRoute("/admin/subscriptions")({
  component: AdminSubscriptions,
});

function AdminSubscriptions() {
  const [kpi, setKpi] = useState<KpiData | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingKpi, setLoadingKpi] = useState(true);
  const [loadingCustomers, setLoadingCustomers] = useState(true);

  useEffect(() => {
    fetch("/api/admin/subscriptions-kpi")
      .then((r) => r.json())
      .then((d) => { setKpi(d); setLoadingKpi(false); })
      .catch(() => setLoadingKpi(false));
  }, []);

  useEffect(() => {
    fetch("/api/admin/subscriptions")
      .then((r) => r.json())
      .then((d) => { setCustomers(d.customers || []); setLoadingCustomers(false); })
      .catch(() => setLoadingCustomers(false));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Subscriptions</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard label="MRR (List)" value={kpi?.listMrr} loading={loadingKpi} prefix="$" />
        <KpiCard label="MRR (Effective)" value={kpi?.effectiveMrr} loading={loadingKpi} prefix="$" />
        <KpiCard label="Active Subscribers" value={kpi?.activeSubscribers} loading={loadingKpi} />
        <KpiCard label="Churn Rate (30d)" value={kpi?.churnRate} loading={loadingKpi} suffix="%" />
      </div>

      {/* Customers Table */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-200">Customers</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-gray-400">
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Tier</th>
                <th className="px-4 py-3 font-medium">List Price</th>
                <th className="px-4 py-3 font-medium">Effective</th>
                <th className="px-4 py-3 font-medium">Discount</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {loadingCustomers ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-800/50">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 w-24 animate-pulse rounded bg-gray-800" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No customers found
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.customerId} className="border-b border-gray-800/50 hover:bg-gray-800/50">
                    <td className="px-4 py-3 text-gray-200">{c.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                          c.tier === "premier"
                            ? "bg-purple-500/20 text-purple-400"
                            : "bg-emerald-500/20 text-emerald-400"
                        }`}
                      >
                        {c.tier}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-200">${c.listAmount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-gray-200">${c.effectiveAmount.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      {c.discount != null && c.discount > 0 ? (
                        <span className="inline-block rounded bg-red-500/20 px-2 py-0.5 text-xs font-semibold text-red-400">
                          -${c.discount.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  loading,
  prefix = "",
  suffix = "",
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</p>
      {loading ? (
        <div className="mt-2 h-8 w-20 animate-pulse rounded bg-gray-800" />
      ) : (
        <p className="mt-2 text-2xl font-bold text-white">
          {prefix}
          {typeof value === "number"
            ? suffix === "%"
              ? value.toFixed(1)
              : value.toLocaleString(undefined, { minimumFractionDigits: prefix === "$" ? 2 : 0, maximumFractionDigits: 2 })
            : "—"}
          {suffix}
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-green-500/20 text-green-400",
    past_due: "bg-yellow-500/20 text-yellow-400",
    unpaid: "bg-yellow-500/20 text-yellow-400",
    canceled: "bg-red-500/20 text-red-400",
    incomplete: "bg-gray-500/20 text-gray-400",
    incomplete_expired: "bg-gray-500/20 text-gray-400",
  };
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${colors[status] || "bg-gray-500/20 text-gray-400"}`}>
      {status.replace("_", " ")}
    </span>
  );
}
