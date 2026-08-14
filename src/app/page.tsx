// src/app/page.tsx
import Link from 'next/link'
import { GameBoard } from '@/components/game/GameBoard'
import { loadGameConfig } from '@/lib/config/game'

/**
 * Màn chơi chỉ chứa thứ để chơi.
 *
 * Không một câu giải thích nào ở đây — mọi lý lẽ về công bằng nằm ở
 * `/how-it-works`, và người chơi tới đó bằng một link duy nhất trên đầu trang.
 * Trước đây trang này mở đầu bằng hai dòng quảng cáo về tính kiểm chứng được,
 * mà người vào để chơi thì không đọc, còn người vào để nghi ngờ thì hai dòng
 * không đủ.
 */
export default function HomePage() {
  const { targetWins } = loadGameConfig()

  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 p-5">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-bold tracking-tight">Rock Paper Scissors</h1>
        <Link className="shrink-0 text-sm text-slate-500 underline" href="/how-it-works">
          How it works
        </Link>
      </header>

      <GameBoard targetWins={targetWins} />
    </main>
  )
}
