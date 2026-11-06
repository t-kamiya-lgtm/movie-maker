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
        <div className="flex min-h-screen flex-col md:flex-row">
          <aside className="border-b border-line bg-black/40 p-3 md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0 md:border-b-0 md:border-r">
            <Link href="/" className="mb-4 hidden px-3 py-2 text-lg font-bold tracking-tight md:block">
              Movie Maker
            </Link>
            <Nav />
          </aside>
          <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
