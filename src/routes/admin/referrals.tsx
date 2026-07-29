import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

interface ReferralData {
  totalReferrals: number;
  totalClicks: number;
  totalConversions: number;
  conversionRate: number;
  totalBounties: number;
  topReferrers: {
    code: string;
    clicks: number;
    conversions: number;
    bountiesEarned: number;
  }[];
}

export const Route = createFileRoute("/admin/referrals")({
  component: AdminReferrals,
});

function AdminReferrals() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/referrals")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Referrals</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Referrals" value={data?.totalReferrals} loading={loading} />
        <StatCard label="Total Clicks" value={data?.totalClicks} loading={loading} />
        <StatCard
          label="Conversion Rate"
          value={data?.conversionRate}
          loading={loading}
          suffix="%"
        />
        <StatCard
          label="Total Bounties"
          value={data?.totalBounties ? data.totalBounties / 100 : undefined}
          loading={loading}
          prefix="$"
        />
      </div>

      {/* Top Referrers Table */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-200">Top Referrers</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-gray-400">
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Clicks</th>
                <th className="px-4 py-3 font-medium">Conversions</th>
                <th className="px-4 py-3 font-medium">Bounties Earned</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-800/50">
                    {Array.from({ length: 4 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 w-20 animate-pulse rounded bg-gray-800" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : !data || data.topReferrers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                    No referral data yet
                  </td>
                </tr>
              ) : (
                data.topReferrers.map((r) => (
                  <tr key={r.code} className="border-b border-gray-800/50 hover:bg-gray-800/50">
                    <td className="px-4 py-3 font-mono text-gray-200">{r.code}</td>
                    <td className="px-4 py-3 text-gray-200">{r.clicks.toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-200">{r.conversions.toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-200">
                      ${(r.bountiesEarned / 100).toFixed(2)}
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

function StatCard({
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
              : value.toLocaleString(undefined, {
                  minimumFractionDigits: prefix === "$" ? 2 : 0,
                  maximumFractionDigits: 2,
                })
            : "—"}
          {suffix}
        </p>
      )}
    </div>
  );
}
