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
    maxTokens: 2500,
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
  examples: { label: string; prompt: string }[];
  sample: string;
  // Scripted rally for the auto-demo. {{rN}} is replaced with the Nth step's answer.
  rally: { prompt: string; add: "none" | "append" | "replace" }[];
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
    idealPrompts: 6,
    sample: `イベント名: AIはじめまして会

【タイムテーブル】4月第2土曜
13:00 開会・サークル紹介
13:30 AIお絵かき体験
14:30 チーム対抗AIクイズ
15:30 交流会
16:00 閉会

【予算表】
会場費: 15,000円
お菓子・飲み物: 18,000円
景品: 10,000円
印刷・装飾: 5,000円
合計: 48,000円（5万円以内）

【雨天時の代替案】
全プログラムを室内の講義室で実施する。交流会は2部屋に分けて行う。

【告知文】
4月第2土曜13時〜「AIはじめまして会」開催！AIお絵かきやクイズで楽しく交流しよう。初心者大歓迎、参加無料です。`,
    rally: [
      { prompt: "イベント名を考えて", add: "none" },
      {
        prompt:
          "<条件>大学のAI研究サークルの新入生歓迎イベント。初心者の新入生が気軽に来たくなる雰囲気</条件>\nイベント名を1つだけ、20字以内で決めて。名前だけを1行で出力して。",
        add: "append",
      },
      {
        prompt:
          "<条件>AI研究サークルの新歓イベント。4月第2土曜13:00〜16:00、参加者30人</条件>\n13:00から16:00までのタイムテーブルを「13:00 内容」の形式で5行つくって。タイムテーブルだけを出力して。",
        add: "append",
      },
      {
        prompt:
          "<資料>\n会場費 15,000円\nお菓子・飲み物 18,000円\n景品 10,000円\n印刷・装飾 5,000円\n</資料>\n上の資料を「項目: 金額」の形式の予算表にして、最後の行に「合計: 48,000円」と書いて。予算表だけを出力して。",
        add: "append",
      },
      {
        prompt:
          "<条件>屋外で予定している新歓イベント（参加者30人）。雨の場合は中止せず、大学の講義室で実施する</条件>\n雨の場合の代替案として、講義室で何をするかを具体的に2文で書いて。代替案だけを出力して。",
        add: "append",
      },
      {
        prompt:
          "<資料>イベント名: {{r2}}\n日時: 4月第2土曜13:00〜16:00</資料>\nこの資料をもとに、新入生向けの告知文を60字程度の短い1文で書いて。イベント名と日時を必ず入れて、告知文だけを出力して。",
        add: "append",
      },
    ],
    examples: [
      { label: "① まず雑に頼む", prompt: "イベント名を考えて" },
      {
        label: "② 工夫して頼み直す",
        prompt:
          "<条件>大学のAI研究サークルの新入生歓迎イベント。初心者の新入生が気軽に来たくなる雰囲気</条件>\nイベント名を1つだけ、20字以内で決めて。名前だけを1行で出力して。",
      },
    ],
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
    sample: `# 新入社員のための生成AI利用ルール

## 禁止事項
1. 個人情報（名前・電話番号など）を入力しない — 外部に保存されるおそれがあるため
2. 社外秘の資料や顧客データを貼らない — 情報漏えいにつながるため
3. AIの答えを確かめずにそのまま使わない — もっともらしい間違いがあるため
4. 他人の文章や画像を丸写しさせない — 著作権（作った人の権利）を侵すため
5. 会社が許可していないAIサービスを使わない — 安全性を確認できないため

## OK例とNG例
- NG:「田中様（090-1234-5678）への謝罪メールを書いて」
  OK:「お客様への納期遅れの謝罪メールを、丁寧な口調で書いて」
- NG:「この顧客リストを分析して」（実データを貼る）
  OK:「顧客リストを分析するときの観点を5つ教えて」
- NG:「報告書の数字を考えて」（AIの数字をそのまま使う）
  OK:「報告書の構成案を作って。数字は自分で入れる」

## 迷ったときの判断手順
1. 入力する内容に個人情報や社外秘が含まれていないか確認する
2. 含まれていたら、名前や数字を伏せた形に書き換える
3. それでも迷ったら、送る前に上司か情報システム担当に相談する

## 用語メモ
- 生成AI: 文章や画像を自動で作るAI
- プロンプト: AIへのお願いの文章`,
    rally: [
      { prompt: "AIのルールを作って", add: "none" },
      {
        prompt:
          "<目的>AIを使ったことがない新入社員に配る1枚のルール</目的>\n<条件>\n- 禁止事項を5つ、それぞれ理由を一言\n- OK例とNG例のペアを3組（入力文の例つき）\n- 迷ったときの判断手順を3ステップ\n- 専門用語には言い換えをつける\n- 全体1200字以内\n</条件>\n見出しつきのMarkdownで書いて。",
        add: "replace",
      },
      {
        prompt:
          "ありがとう。いまの案を、次の点を確認して直した完成版だけを出力して。\n1. 全体が1200字以内か（超えていたら削る）\n2. 専門用語すべてに言い換えがついているか\n3. 禁止事項5つすべてに理由がついているか",
        add: "replace",
      },
    ],
    examples: [
      { label: "① まず雑に頼む", prompt: "AIのルールを作って" },
      {
        label: "② 工夫して頼み直す",
        prompt:
          "<目的>AIを使ったことがない新入社員に配る1枚のルール</目的>\n<条件>\n- 禁止事項を5つ、それぞれ理由を一言\n- OK例とNG例のペアを3組（入力文の例つき）\n- 迷ったときの判断手順を3ステップ\n- 専門用語には言い換えをつける\n- 全体1200字以内\n</条件>\n見出しつきのMarkdownで書いて。",
      },
    ],
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
