/**
 * RankItem Atom - Single ranked item
 */

interface RankItemProps {
  rank: number;
  label: string;
  value: string | number;
  maxRank?: number;
}

export function RankItem({ rank, label, value, maxRank = 10 }: RankItemProps) {
  // Top 3 get special treatment
  const isTop3 = rank <= 3;
  const opacity = 1 - ((rank - 1) / maxRank) * 0.5;

  return (
    <div
      class="flex items-center gap-2 py-1 px-1.5 -mx-1.5 rounded transition-colors"
      style={{ opacity }}
      onMouseOver={(e: any) => e.currentTarget.style.background = "var(--accent-dim)"}
      onMouseOut={(e: any) => e.currentTarget.style.background = "transparent"}
    >
      <span
        class="w-4 text-[10px] font-bold text-center"
        style={{ color: isTop3 ? "var(--accent)" : "var(--text-dim)" }}
      >
        {rank}
      </span>
      <span
        class="flex-1 text-[11px] truncate"
        style={{ color: "var(--text)" }}
        title={label}
      >
        {label}
      </span>
      <span
        class="text-[10px] tabular-nums"
        style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}
      >
        {value}
      </span>
    </div>
  );
}
