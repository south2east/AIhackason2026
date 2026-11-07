import { useId } from "react";

// Front-facing, softly shaded mascots: a chick (beginner) and a rooster (advanced).
export function Chara({ kind, size = 150, busy = false }: { kind: "chick" | "rooster"; size?: number; busy?: boolean }) {
  const uid = useId().replace(/:/g, "");
  const g = (n: string) => `${n}-${uid}`;
  const isChick = kind === "chick";
  const body = isChick ? ["#fff6b8", "#ffd84a", "#f0a800"] : ["#ffffff", "#f6f1ea", "#d8cdbd"];

  return (
    <svg
      viewBox="0 0 200 210"
      width={size}
      height={size * 1.05}
      className={busy ? "animate-bounce" : "chara-idle"}
      role="img"
      aria-label={isChick ? "ひよこAI" : "ニワトリAI"}
    >
      <defs>
        <radialGradient id={g("body")} cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor={body[0]} />
          <stop offset="55%" stopColor={body[1]} />
          <stop offset="100%" stopColor={body[2]} />
        </radialGradient>
        <radialGradient id={g("wing")} cx="40%" cy="30%" r="80%">
          <stop offset="0%" stopColor={isChick ? "#ffe680" : "#ffffff"} />
          <stop offset="100%" stopColor={isChick ? "#e89c00" : "#cbbfae"} />
        </radialGradient>
        <linearGradient id={g("beak")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffc06a" />
          <stop offset="100%" stopColor="#f07800" />
        </linearGradient>
        <radialGradient id={g("red")} cx="40%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#ff8a8a" />
          <stop offset="100%" stopColor="#d01c2a" />
        </radialGradient>
        <linearGradient id={g("tail")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3f8f6b" />
          <stop offset="100%" stopColor="#1d4d3a" />
        </linearGradient>
      </defs>

      {/* floor shadow */}
      <ellipse cx="100" cy="198" rx="58" ry="8" fill="#000" opacity="0.12" />

      {/* rooster tail feathers peeking behind */}
      {!isChick && (
        <g>
          <path d="M150 112 C178 86 190 60 176 40 C170 70 158 86 140 100 Z" fill={`url(#${g("tail")})`} />
          <path d="M50 112 C22 86 10 60 24 40 C30 70 42 86 60 100 Z" fill={`url(#${g("tail")})`} />
        </g>
      )}

      {/* feet */}
      <g fill="#f08a00">
        <path d="M80 182 l-8 12 h6 l4 -6 l4 6 h6 l-8 -12 z" />
        <path d="M120 182 l-8 12 h6 l4 -6 l4 6 h6 l-8 -12 z" />
      </g>

      {/* comb (rooster) or tuft (chick) */}
      {isChick ? (
        <g fill="#f5b800">
          <path d="M100 36 C94 22 98 12 106 10 C100 20 104 28 108 34 Z" />
          <path d="M100 36 C108 24 118 22 124 26 C114 28 108 32 106 38 Z" />
        </g>
      ) : (
        <g fill={`url(#${g("red")})`}>
          <circle cx="84" cy="34" r="12" />
          <circle cx="100" cy="24" r="15" />
          <circle cx="117" cy="34" r="12" />
        </g>
      )}

      {/* body */}
      <ellipse cx="100" cy="116" rx="72" ry="74" fill={`url(#${g("body")})`} />

      {/* wings */}
      <ellipse cx="34" cy="126" rx="16" ry="28" transform="rotate(18 34 126)" fill={`url(#${g("wing")})`} />
      <ellipse cx="166" cy="126" rx="16" ry="28" transform="rotate(-18 166 126)" fill={`url(#${g("wing")})`} />

      {/* belly highlight */}
      <ellipse cx="100" cy="146" rx="38" ry="30" fill="#fff" opacity={isChick ? 0.28 : 0.6} />
      {/* top gloss */}
      <ellipse cx="76" cy="70" rx="22" ry="12" fill="#fff" opacity="0.45" transform="rotate(-20 76 70)" />

      {/* eyes */}
      {[76, 124].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy="98" rx="11" ry="13" fill="#2a2233" />
          <circle cx={x - 3.5} cy="93" r="4.2" fill="#fff" />
          <circle cx={x + 4} cy="103" r="1.8" fill="#fff" opacity="0.9" />
        </g>
      ))}

      {/* cheeks */}
      <ellipse cx="58" cy="118" rx="10" ry="6" fill="#ff8fa3" opacity="0.55" />
      <ellipse cx="142" cy="118" rx="10" ry="6" fill="#ff8fa3" opacity="0.55" />

      {/* beak */}
      <path d="M88 112 Q100 104 112 112 Q100 128 88 112 Z" fill={`url(#${g("beak")})`} />
      <path d="M90 113 Q100 110 110 113" stroke="#c45d00" strokeWidth="1.5" fill="none" opacity="0.6" />

      {/* wattle (rooster) */}
      {!isChick && <path d="M100 124 C90 128 90 144 100 146 C110 144 110 128 100 124 Z" fill={`url(#${g("red")})`} />}
    </svg>
  );
}
