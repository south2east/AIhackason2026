import { AXES, type AxisScores } from "@/lib/game";

// Hexagon radar chart for the six prompt axes (0-5).
export function Radar({ scores, compare, size = 260 }: { scores: AxisScores; compare?: AxisScores; size?: number }) {
  const c = size / 2;
  const r = c - 44;
  const n = AXES.length;
  const pt = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [c + Math.cos(a) * r * (v / 5), c + Math.sin(a) * r * (v / 5)] as const;
  };
  const poly = (s: AxisScores) => AXES.map((ax, i) => pt(i, s[ax.key]).join(",")).join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[320px]" role="img" aria-label="プロンプト6軸の評価">
      {[1, 2, 3, 4, 5].map((lv) => (
        <polygon
          key={lv}
          points={AXES.map((_, i) => pt(i, lv).join(",")).join(" ")}
          fill="none"
          className="stroke-line"
          strokeWidth={lv === 5 ? 1.5 : 1}
        />
      ))}
      {AXES.map((_, i) => {
        const [x, y] = pt(i, 5);
        return <line key={i} x1={c} y1={c} x2={x} y2={y} className="stroke-line" />;
      })}
      {compare && <polygon points={poly(compare)} fill="#6d3cff1a" stroke="#6d3cff" strokeDasharray="4 3" strokeWidth={1.5} />}
      <polygon points={poly(scores)} fill="#3a8a0a2e" stroke="#3a8a0a" strokeWidth={2} />
      {AXES.map((ax, i) => {
        const [x, y] = pt(i, 6.3);
        return (
          <text key={ax.key} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="12" className="fill-foreground">
            {ax.label}
            <tspan x={x} dy="14" fontSize="11" className="fill-lime">
              {scores[ax.key].toFixed(1)}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}
