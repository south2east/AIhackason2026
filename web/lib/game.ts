// Shared game definitions: levels, missions, scoring axes, know-how, and score math.

export const JUDGE_MODEL = "anthropic/claude-sonnet-5.5";
export const PROMPT_MAX_CHARS = 2000;

export type Tier = "beginner" | "advanced";

export const TIERS: Record<
  Tier,
  { label: string; aiName: string; model: string; modelLabel: string; maxTokens: number; memory: boolean; desc: string }
> = {
  beginner: {
    label: "初心者",
    aiName: "ちびAI",
    model: "meta/llama-3.1-8b",
    modelLabel: "Llama 3.1 8B",
    maxTokens: 220,
    memory: false,
    desc: "前回までのやり取りを把握していない、少ししか話せない小さなAI",
  },
  advanced: {
    label: "上級者",
    aiName: "かしこAI",
    model: "anthropic/claude-haiku-5.5",
    modelLabel: "Claude Haiku 5.5",
    maxTokens: 1200,
    memory: true,
    desc: "会話の流れを覚えていて、長く話せるAI。そのぶん求められる質も高い",
  },
};

export type Mission = {
  id: string;
  tier: Tier;
  title: string;
  short: string;
  brief: string;
  checklist: string[];
  idealPrompts: number;
};

export const MISSIONS: Mission[] = [
  {
    id: "shinkan",
    title: "新歓イベントを企画しよう",
    tier: "beginner",
    short: "イベント名・スケジュール・予算を決めて、企画書にまとめる",
    brief:
      "大学のAI研究サークルの新入生歓迎イベント（4月第2土曜、13:00〜16:00、参加者30人、予算5万円）の企画書を完成させる。",
    checklist: [
      "イベント名が1つに決まっている",
      "13:00〜16:00のタイムテーブル（時刻付きで3項目以上）",
      "予算表（項目ごとの金額と合計。合計が5万円以内で、足し算が正しい）",
      "雨天時の代替案",
      "告知文（100字以内。イベント名と日時を含む）",
    ],
    idealPrompts: 4,
  },
  {
    id: "lp",
    title: "新商品「AI枕」の宣伝文をつくろう",
    tier: "beginner",
    short: "キャッチコピー・おすすめポイント・よくある質問をそろえる",
    brief:
      "睡眠を記録して最適な高さに自動調整する架空のAI枕「ネムール」（税込19,800円）の宣伝ページに載せる文章を完成させる。",
    checklist: [
      "キャッチコピー（20字以内）",
      "どんな人向けか（年齢層と、睡眠の具体的な悩み）",
      "おすすめポイント3つ（それぞれ見出しと説明文）",
      "よくある質問3つ（質問と答えのセット）",
      "全体のつじつま（向けている人の悩みとおすすめポイントが対応していて、価格の表記が正しい）",
    ],
    idealPrompts: 5,
  },
  {
    id: "kyoto",
    title: "3万円で京都1泊2日の旅を計画しよう",
    tier: "advanced",
    short: "行き先・移動手段・費用の計算までそろえた旅行プランをつくる",
    brief:
      "東京から京都へ大学生2人で行く1泊2日の旅行プランを、1人あたり総額3万円以内（交通費・宿・食費・拝観料込み）で完成させる。",
    checklist: [
      "2日分の行程（時刻付き、各日3か所以上）",
      "各移動の手段が書かれている",
      "1人あたりの費用内訳と合計（3万円以内で、足し算が正しい）",
      "雨の日の代替プラン",
      "持ち物リスト（5つ以上）",
    ],
    idealPrompts: 6,
  },
  {
    id: "guideline",
    tier: "advanced",
    title: "新入社員向け「生成AI利用ルール」をつくろう",
    short: "禁止事項・OK例とNG例・迷ったときの判断手順を1枚にまとめる",
    brief:
      "社員50人のIT企業で、新入社員に配る「生成AIの使い方ルール」を1枚（全体で1200字以内）にまとめる。読み手はAIを使ったことがない新入社員。",
    checklist: [
      "禁止事項が5つ以上あり、それぞれ理由が一言ついている",
      "OK例とNG例のペアが3組以上（具体的な入力文の例つき）",
      "迷ったときの判断手順（3ステップ以上の順番つき）",
      "専門用語を使うときは言い換えや説明がある（新入社員が読める）",
      "全体で1200字以内に収まっている",
    ],
    idealPrompts: 5,
  },
];

export const AXES = [
  {
    key: "clarity",
    label: "はっきり",
    desc: "何をしてほしいかが具体的で曖昧さがない",
    source: "Anthropic「Be clear, direct, and detailed」/ OpenAI「Write clear instructions」",
  },
  {
    key: "context",
    label: "背景",
    desc: "目的・読み手・前提・役割を伝えている",
    source: "Anthropic「Give Claude a role / context」/ OpenAI「Provide reference text」",
  },
  {
    key: "format",
    label: "形の指定",
    desc: "形式・長さ・項目を指定している",
    source: "Anthropic「Control the format of responses」/ OpenAI「Specify the desired length」",
  },
  {
    key: "structure",
    label: "区切り",
    desc: "指示・資料・条件をタグや区切りで分けている",
    source: "Anthropic「Use XML tags」/ OpenAI「Use delimiters」",
  },
  {
    key: "examples",
    label: "例を見せる",
    desc: "必要な場面で例やテンプレートを見せている",
    source: "Anthropic「Use examples (multishot)」/ OpenAI「Provide examples」",
  },
  {
    key: "decomposition",
    label: "小分け",
    desc: "AIがこなせる大きさに切り出し、前の答えを活かしている",
    source: "Anthropic「Chain complex prompts」/ OpenAI「Split complex tasks into simpler subtasks」",
  },
] as const;

export type AxisKey = (typeof AXES)[number]["key"];
export type AxisScores = Record<AxisKey, number>;

export type PromptJudge = AxisScores & {
  good: string;
  advice: string;
  improved: string;
  demo?: boolean;
};

export type FinalJudge = {
  items: { index: number; passed: boolean; reason: string }[];
  summary: string;
  demo?: boolean;
};

export const promptScore = (j: AxisScores) =>
  Math.round((AXES.reduce((s, a) => s + j[a.key], 0) / (AXES.length * 5)) * 100);

export function totalScore(promptAvg: number, achievement: number, prompts: number, ideal: number) {
  const efficiency = Math.max(0, 100 - Math.max(0, prompts - ideal) * 10);
  return {
    efficiency,
    total: Math.round(promptAvg * 0.45 + achievement * 0.45 + efficiency * 0.1),
  };
}

export const RANKS = [
  { min: 90, name: "化身", note: "AIと一体化。もう完全に化けた。" },
  { min: 75, name: "羽化", note: "殻を破った。AIを道具として使いこなしている。" },
  { min: 60, name: "さなぎ", note: "変身の途中。あと一歩でAIが思い通りに動く。" },
  { min: 40, name: "幼虫", note: "AIとの会話に慣れてきた。伝え方を磨こう。" },
  { min: 0, name: "たまご", note: "まだ殻の中。アドバイスを1つ試すだけで化け始める。" },
];

export type Knowhow = {
  id: string;
  title: string;
  tip: string;
  why: string;
  before: string;
  after: string;
  category: AxisKey;
  tier: Tier;
  missionId: string;
  createdAt: number;
};

export const rankOf = (score: number) => RANKS.find((r) => score >= r.min)!;
