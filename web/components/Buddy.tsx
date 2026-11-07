// The AI buddy: its body grows with the player's recent prompt scores, and its face reacts to the latest one.

export type Mood = "happy" | "normal" | "sour" | "thinking";

export const STAGES = [
  { min: 0, name: "ひょろひょろ" },
  { min: 50, name: "ちょい筋" },
  { min: 70, name: "細マッチョ" },
  { min: 85, name: "ゴリマッチョ" },
] as const;

// Body stage from the average of the last three prompt scores (0-100).
export function stageOf(scores: number[]) {
  const recent = scores.slice(-3);
  if (!recent.length) return 0;
  const avg = recent.reduce((s, x) => s + x, 0) / recent.length;
  let st = 0;
  STAGES.forEach((s, i) => {
    if (avg >= s.min) st = i;
  });
  return st;
}

export function moodOf(latest: number | undefined, waiting: boolean): Mood {
  if (waiting) return "thinking";
  if (latest === undefined) return "normal";
  return latest >= 75 ? "happy" : latest >= 50 ? "normal" : "sour";
}

const SKIN = "#ffd9b8";
const LINE = "#221d33";
const SHIRT = ["#b9b3c9", "#8fbf6a", "#6d3cff", "#3a8a0a"];

export function Buddy({ stage, mood, size = 112 }: { stage: number; mood: Mood; size?: number }) {
  const s = Math.max(0, Math.min(3, stage));
  const sh = [13, 20, 29, 40][s]; // half shoulder width
  const waist = [12, 14, 15, 17][s];
  const arm = [4, 7, 11, 16][s]; // arm thickness
  const leg = [5, 7, 10, 13][s];
  const headY = [34, 32, 31, 30][s];
  const top = 58;
  const hip = 104;

  // Skinny forms hang their arms down; strong forms flex (double biceps).
  const flex = s >= 2;
  const armPath = (dir: 1 | -1) => {
    const x0 = 60 + dir * (sh - 2);
    if (!flex) return `M${x0} ${top + 4} L${x0 + dir * (s === 0 ? 3 : 6)} ${top + 30} L${x0 + dir * (s === 0 ? 4 : 7)} ${top + 46}`;
    const elbow = x0 + dir * 18;
    return `M${x0} ${top + 5} L${elbow} ${top + 6} L${elbow + dir * 2} ${top - 16}`;
  };

  return (
    <svg viewBox="-12 0 144 140" width={size} height={(size * 140) / 144} role="img" aria-label={`AIキャラ（${STAGES[s].name}・${moodLabel[mood]}）`}>
      {/* legs */}
      <path d={`M${60 - waist + 5} ${hip} L${60 - waist + 3} 134 M${60 + waist - 5} ${hip} L${60 + waist - 3} 134`} stroke={SKIN} strokeWidth={leg} strokeLinecap="round" />
      <path d={`M${60 - waist + 5} ${hip} L${60 - waist + 3} 134 M${60 + waist - 5} ${hip} L${60 + waist - 3} 134`} stroke={LINE} strokeWidth={1.2} fill="none" opacity={0.25} />
      {/* arms (behind torso) */}
      {([-1, 1] as const).map((d) => (
        <g key={d} style={{ transition: "all .4s" }}>
          <path d={armPath(d)} stroke={LINE} strokeWidth={arm + 2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d={armPath(d)} stroke={SKIN} strokeWidth={arm} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          {flex && <circle cx={60 + d * (sh + 9)} cy={top + 1} r={arm * 0.95} fill={SKIN} stroke={LINE} strokeWidth={1.2} />}
        </g>
      ))}
      {/* torso: tank top, V-shape grows with stage */}
      <path
        d={`M${60 - sh} ${top} Q60 ${top - 6} ${60 + sh} ${top} L${60 + waist} ${hip} L${60 - waist} ${hip} Z`}
        fill={SHIRT[s]}
        stroke={LINE}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      {s >= 2 && <path d={`M60 ${top + 4} L60 ${top + 18} M${60 - sh * 0.55} ${top + 16} Q${60 - sh * 0.25} ${top + 21} 60 ${top + 17} Q${60 + sh * 0.25} ${top + 21} ${60 + sh * 0.55} ${top + 16}`} stroke={LINE} strokeWidth={1.1} fill="none" opacity={0.45} />}
      {s >= 3 && (
        <g stroke={LINE} strokeWidth={1.2} opacity={0.5} fill="none">
          <path d={`M${60 - sh + 6} ${top + 6} Q${60 - sh / 2} ${top + 22} 60 ${top + 12} Q${60 + sh / 2} ${top + 22} ${60 + sh - 6} ${top + 6}`} />
          <path d={`M54 ${top + 26} h12 M54 ${top + 33} h12 M55 ${top + 40} h10`} />
        </g>
      )}
      {/* neck + head */}
      <rect x={60 - [4, 5, 7, 9][s]} y={headY + 14} width={[8, 10, 14, 18][s]} height={top - headY - 12} fill={SKIN} stroke={LINE} strokeWidth={1.2} />
      <circle cx={60} cy={headY} r={20} fill={SKIN} stroke={LINE} strokeWidth={1.5} />
      {/* antenna: it's an AI */}
      <path d={`M60 ${headY - 20} L60 ${headY - 28}`} stroke={LINE} strokeWidth={1.5} />
      <circle cx={60} cy={headY - 30} r={3} fill={mood === "happy" ? "#3a8a0a" : mood === "sour" ? "#e0573f" : "#6d3cff"} />
      <Face mood={mood} cy={headY} />
    </svg>
  );
}

const moodLabel: Record<Mood, string> = { happy: "笑顔", normal: "ふつう", sour: "渋い顔", thinking: "考え中" };

function Face({ mood, cy }: { mood: Mood; cy: number }) {
  const ey = cy - 3;
  const my = cy + 8;
  const st = { stroke: LINE, strokeWidth: 1.8, strokeLinecap: "round" as const, fill: "none" };
  switch (mood) {
    case "happy":
      return (
        <g>
          <path d={`M49 ${ey + 1} Q52 ${ey - 4} 55 ${ey + 1} M65 ${ey + 1} Q68 ${ey - 4} 71 ${ey + 1}`} {...st} />
          <path d={`M51 ${my - 2} Q60 ${my + 8} 69 ${my - 2} Z`} fill="#c2412d" stroke={LINE} strokeWidth={1.4} strokeLinejoin="round" />
          <circle cx={46} cy={cy + 4} r={3} fill="#ff9e9e" opacity={0.6} />
          <circle cx={74} cy={cy + 4} r={3} fill="#ff9e9e" opacity={0.6} />
        </g>
      );
    case "sour":
      return (
        <g>
          <path d={`M48 ${ey - 6} L55 ${ey - 3} M72 ${ey - 6} L65 ${ey - 3}`} {...st} />
          <path d={`M49 ${ey + 1} h6 M65 ${ey + 1} h6`} {...st} />
          <path d={`M52 ${my + 2} q2 -3 4 0 t4 0 t4 0`} {...st} />
          <path d={`M77 ${cy - 10} q3 5 0 7 q-3 -2 0 -7`} fill="#7cc3f0" stroke={LINE} strokeWidth={0.8} />
        </g>
      );
    case "thinking":
      return (
        <g>
          <circle cx={52} cy={ey - 1} r={2} fill={LINE} />
          <circle cx={68} cy={ey - 1} r={2} fill={LINE} />
          <path d={`M55 ${my} q5 2 10 -1`} {...st} />
          <text x={80} y={cy - 14} fontSize={12} fill={LINE}>
            …
          </text>
        </g>
      );
    default:
      return (
        <g>
          <circle cx={52} cy={ey} r={2.2} fill={LINE} />
          <circle cx={68} cy={ey} r={2.2} fill={LINE} />
          <path d={`M54 ${my} h12`} {...st} />
        </g>
      );
  }
}
