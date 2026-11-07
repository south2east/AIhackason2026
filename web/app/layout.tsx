import type { Metadata } from "next";
import { M_PLUS_1p } from "next/font/google";
import "./globals.css";

const font = M_PLUS_1p({ weight: ["400", "700", "900"], subsets: ["latin"], variable: "--font-main" });

export const metadata: Metadata = {
  title: "BAKERU — 次は人が化ける番だ！",
  description: "弱いAIを、伝え方だけで動かせ。プロンプトの「AI適合度」を採点するトレーニングゲーム。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${font.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
