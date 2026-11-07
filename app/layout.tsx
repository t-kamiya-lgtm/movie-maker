import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Movie Maker",
  description: "AI キャラクター × シーン動画 × ナレーションの動画生成アプリ",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen">
        {/* メニューは上部ヘッダーに置き、横幅をすべて作業スペースに使う（高さ 3.5rem 固定） */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-line bg-black/85 px-3 backdrop-blur md:px-6">
          <Link href="/" className="hidden shrink-0 text-lg font-bold tracking-tight md:block">
            Movie Maker
          </Link>
          <Nav />
        </header>
        <main className="min-w-0 p-4 md:px-6 md:py-5">{children}</main>
      </body>
    </html>
  );
}
