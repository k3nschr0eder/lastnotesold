import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

interface Coupon {
  id: string;
  code: string;
  discountType: string;
  amount: number;
  currency: string;
  duration: string;
  durationInMonths: number | null;
  timesRedeemed: number;
  maxRedemptions: number | null;
  validUntil: string | null;
  active: boolean;
  isPromotionCode: boolean;
}

export const Route = createFileRoute("/admin/coupons")({
  component: AdminCoupons,
});

function AdminCoupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/coupons")
      .then((r) => r.json())
      .then((d) => { setCoupons(d.coupons || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Coupons</h1>

      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-200">
            All Coupons & Promotion Codes
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-gray-400">
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Discount</th>
                <th className="px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3 font-medium">Redeemed</th>
                <th className="px-4 py-3 font-medium">Valid Until</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-800/50">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 w-20 animate-pulse rounded bg-gray-800" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : coupons.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No coupons found
                  </td>
                </tr>
              ) : (
                coupons.map((c) => (
                  <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/50">
                    <td className="px-4 py-3">
                      <span className="font-mono text-gray-200">{c.code}</span>
                      {c.isPromotionCode && (
                        <span className="ml-2 text-xs text-gray-500">(promo)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-300 capitalize">{c.discountType}</td>
                    <td className="px-4 py-3 text-gray-200">
                      {c.discountType === "fixed"
                        ? `${c.currency.toUpperCase()} $${c.amount.toFixed(2)}`
                        : `${c.amount}%`}
                    </td>
                    <td className="px-4 py-3 text-gray-300 capitalize">
                      {c.duration}
                      {c.durationInMonths ? ` (${c.durationInMonths}mo)` : ""}
                    </td>
                    <td className="px-4 py-3 text-gray-200">
                      {c.timesRedeemed}
                      {c.maxRedemptions ? ` / ${c.maxRedemptions}` : ""}
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {c.validUntil
                        ? new Date(c.validUntil).toLocaleDateString()
                        : <span className="text-gray-500">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                          c.active
                            ? "bg-green-500/20 text-green-400"
                            : "bg-gray-500/20 text-gray-400"
                        }`}
                      >
                        {c.active ? "active" : "inactive"}
                      </span>
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
