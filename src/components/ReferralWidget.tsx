import { useState } from "react";

export interface ReferralCodeData {
  code: string;
  active?: boolean;
  conversions?: number;
  earned?: number;
  monthlyConversions?: number;
  monthlyLimit?: number;
  remainingThisMonth?: number;
}

interface ReferralWidgetProps {
  codes: ReferralCodeData[];
  codeLimit?: number;
  compact?: boolean;
  /** Called with the code when the user clicks Delete (only shown for zero-conversion codes). */
  onDelete?: (code: string) => void;
  /** Called with the code when the user clicks Rename. */
  onRename?: (code: string) => void;
  /** Called with the code when the user clicks Re-activate (inactive codes only). */
  onActivate?: (code: string) => void;
  /** Called with the code when the user clicks Deactivate (active codes only). */
  onDeactivate?: (code: string) => void;
}

function CodeCard({
  data,
  onDelete,
  onRename,
  onActivate,
  onDeactivate,
}: {
  data: ReferralCodeData;
  onDelete?: (code: string) => void;
  onRename?: (code: string) => void;
  onActivate?: (code: string) => void;
  onDeactivate?: (code: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const isActive = data.active !== false;
  const referralLink = `https://lastnotesold.com/${data.code}`;
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement("input");
      input.value = referralLink;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const conversions = data.conversions || 0;
  const earned = data.earned || 0;
  const monthlyConversions = data.monthlyConversions || 0;
  const monthlyLimit = data.monthlyLimit || 20;
  const remaining = data.remainingThisMonth ?? Math.max(0, monthlyLimit - monthlyConversions);
  const canDelete = conversions === 0;

  return (
    <div className="rounded-xl border border-emerald-800/30 bg-gray-900/60 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg">🎁</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">Referral Code</p>
            <p className="text-lg font-bold tracking-wider text-emerald-400 truncate">{data.code}</p>
          </div>
        </div>
        <button
          onClick={handleCopy}
          className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-all min-h-[44px] flex items-center justify-center ${
            copied
              ? "bg-green-900/50 text-green-400"
              : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
          }`}
        >
          {copied ? "✓ Copied!" : "Copy Link"}
        </button>
      </div>
      <p className="mt-2 text-xs text-gray-500 truncate">{referralLink}</p>

      <div className="mt-3 flex gap-4 border-t border-gray-800 pt-3">
        <div>
          <p className="text-xs text-gray-500">Conversions</p>
          <p className="text-lg font-bold text-white">{conversions}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Earned</p>
          <p className="text-lg font-bold text-emerald-400">${earned.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">This Month</p>
          <p className="text-lg font-bold text-white">
            {monthlyConversions}
            <span className="text-sm font-normal text-gray-500">/{monthlyLimit}</span>
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Remaining</p>
          <p className="text-lg font-bold text-emerald-400">{remaining}</p>
        </div>
      </div>

      {!isActive && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-800 pt-3">
          <span className="text-xs font-medium text-amber-400">⏸ Inactive — no longer accepting referrals</span>
          {onActivate && (
            <button
              onClick={() => onActivate(data.code)}
              className="rounded-lg border border-emerald-700 bg-emerald-900/30 px-3 py-1.5 text-sm font-medium text-emerald-400 hover:bg-emerald-800/40 transition-colors"
            >
              Re-activate
            </button>
          )}
        </div>
      )}
      {(onRename || onDeactivate || (onDelete && canDelete)) && (
        <div className="mt-3 flex gap-2 border-t border-gray-800 pt-3">
          {isActive && onDeactivate && (
            <button
              onClick={() => onDeactivate(data.code)}
              className="rounded-lg border border-amber-900/50 bg-amber-950/30 px-3 py-1.5 text-sm font-medium text-amber-400 hover:bg-amber-900/40 transition-colors"
            >
              Deactivate
            </button>
          )}
          {onRename && (
            <button
              onClick={() => onRename(data.code)}
              className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm font-medium text-gray-300 hover:border-emerald-700 hover:text-emerald-400 transition-colors"
            >
              Rename
            </button>
          )}
          {onDelete && canDelete && (
            <button
              onClick={() => onDelete(data.code)}
              className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-900/40 transition-colors"
            >
              Delete
            </button>
          )}
          {onDelete && !canDelete && (
            <span className="text-xs text-gray-600 self-center">
              Delete disabled — this code has conversions.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function ReferralWidget({
  codes,
  codeLimit = 0,
  compact = false,
  onDelete,
  onRename,
  onActivate,
  onDeactivate,
}: ReferralWidgetProps) {
  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {codes.map((c) => (
          <span
            key={c.code}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-800/30 bg-emerald-950/20 px-3 py-1 text-xs"
          >
            <span className="text-emerald-400">🎁</span>
            <span className="text-gray-300">{c.code}</span>
            <span className="text-gray-500">
              {c.conversions || 0} / ${(c.earned || 0).toLocaleString()}
            </span>
            <span className="text-gray-500" title={`${c.monthlyConversions || 0}/${c.monthlyLimit || 20} this month`}>
              ({(c.monthlyConversions || 0)}/{c.monthlyLimit || 20})
            </span>
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {codeLimit > 0 && (
        <p className="text-xs text-gray-500">
          {codes.length} of {codeLimit} referral {codes.length === 1 ? "slot" : "slots"} used
          {codeLimit - codes.length > 0 && (
            <span className="text-emerald-500"> — {codeLimit - codes.length} remaining</span>
          )}
        </p>
      )}
      {codes.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-700 bg-gray-900/40 p-6 text-center">
          <p className="text-sm text-gray-400">No referral codes yet — create your first one below.</p>
        </div>
      )}
      {codes.map((c) => (
        <CodeCard key={c.code} data={c} onDelete={onDelete} onRename={onRename} onActivate={onActivate} onDeactivate={onDeactivate} />
      ))}
    </div>
  );
}
