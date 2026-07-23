import type { TierName } from "~/lib/tiers";

interface TierBadgeProps {
  tier: TierName;
  size?: "sm" | "md";
}

const tierConfig: Record<TierName, { label: string; className: string; icon: string }> = {
  premier: {
    label: "Premier",
    icon: "💎",
    className:
      "bg-gradient-to-r from-purple-600 to-purple-800 text-white border-purple-500/40 shadow-purple-900/30",
  },
  pro: {
    label: "Pro",
    icon: "🥇",
    className:
      "bg-gradient-to-r from-emerald-600 to-emerald-800 text-white border-emerald-500/40 shadow-emerald-900/30",
  },
  free: {
    label: "Free",
    icon: "",
    className:
      "bg-gray-700 text-gray-300 border-gray-600/40",
  },
};

export default function TierBadge({ tier, size = "md" }: TierBadgeProps) {
  const { label, className, icon } = tierConfig[tier] || tierConfig.free;
  const sizeClass = size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold tracking-wide shadow-sm ${sizeClass} ${className}`}
      title={`${label} Tier`}
    >
      {icon && <span className="text-[1.1em] leading-none">{icon}</span>}
      {label}
    </span>
  );
}
