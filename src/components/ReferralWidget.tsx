import { useState } from "react";

interface ReferralWidgetProps {
  code: string;
  conversions?: number;
  earned?: number;
  compact?: boolean;
  monthlyConversions?: number;
  monthlyLimit?: number;
  remainingThisMonth?: number;
}

export default function ReferralWidget({ code, conversions = 0, earned = 0, compact = false, monthlyConversions = 0, monthlyLimit = 20, remainingThisMonth = 20 }: ReferralWidgetProps) {
  const [copied, setCopied] = useState(false);
  const referralLink = `https://lastnotesold.com/${code}`;

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

  if (compact) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-emerald-800/30 bg-emerald-950/20 px-3 py-1 text-xs">
        <span className="text-emerald-400">🎁</span>
        <span className="text-gray-300">{code}</span>
        <button
          onClick={handleCopy}
          className="rounded bg-emerald-900/50 px-2 py-0.5 text-[10px] font-medium text-emerald-300 hover:bg-emerald-800/50 transition-colors"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
        <span className="text-gray-500">
          {conversions > 0 && `${conversions} / ${earned}`}
        </span>
        <span className="text-gray-500" title={`${monthlyConversions}/${monthlyLimit} this month`}>
          ({monthlyConversions}/{monthlyLimit})
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-800/30 bg-gray-900/60 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎁</span>
          <div>
            <p className="text-sm font-semibold text-white">Your Referral Code</p>
            <p className="text-lg font-bold tracking-wider text-emerald-400">{code}</p>
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
      {(conversions > 0 || earned > 0) && (
        <div className="mt-3 flex gap-4 border-t border-gray-800 pt-3">
          <div>
            <p className="text-xs text-gray-500">Conversions</p>
            <p className="text-lg font-bold text-white">{conversions}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Earned</p>
            <p className="text-lg font-bold text-emerald-400">${earned}</p>
          </div>
        </div>
      )}
    </div>
  );
}