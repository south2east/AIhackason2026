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
          stroke="#2c2840"
          strokeWidth={lv === 5 ? 1.5 : 1}
        />
      ))}
      {AXES.map((_, i) => {
        const [x, y] = pt(i, 5);
        return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="#2c2840" />;
      })}
      {compare && <polygon points={poly(compare)} fill="#9b6bff22" stroke="#9b6bff" strokeDasharray="4 3" strokeWidth={1.5} />}
      <polygon points={poly(scores)} fill="#c6ff3d33" stroke="#c6ff3d" strokeWidth={2} />
      {AXES.map((ax, i) => {
        const [x, y] = pt(i, 6.3);
        return (
          <text key={ax.key} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="12" fill="#ece9f5">
            {ax.label}
            <tspan x={x} dy="14" fontSize="11" fill="#c6ff3d">
              {scores[ax.key].toFixed(1)}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}
