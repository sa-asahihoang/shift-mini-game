// src/app/how-it-works/page.tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { HAND_SHAPES, HAND_COLORS_CSS } from '@/lib/ui/hand-art'
import { loadGameConfig } from '@/lib/config/game'
import type { Hand } from '@/lib/game/hands'

export const metadata: Metadata = {
  title: 'How it works — Rock Paper Scissors',
  description:
    'The machine locks in its hands before you tap, and you can check it afterwards on your own device.',
}

/**
 * Trang giải thích, tách hẳn khỏi màn chơi.
 *
 * Hình dẫn dắt, chữ chỉ chú thích — người không rành kỹ thuật đọc một trang dày
 * đặc chữ thì bỏ giữa chừng, mà đây lại đúng là nhóm cần thuyết phục nhất.
 * Bản chi tiết cho lập trình viên là một tài liệu khác.
 */

/** Vẽ lại đúng hình tay đang dùng trong game, từ cùng một nguồn dữ liệu. */
function HandGlyph({ hand, size, cx, cy }: { hand: Hand; size: number; cx: number; cy: number }) {
  const scale = size / 100
  return (
    <g transform={`translate(${cx} ${cy}) scale(${scale})`}>
      {HAND_SHAPES[hand].map((shape, i) => {
        if (shape.kind === 'roundRect') {
          return (
            <rect
              key={i}
              x={shape.x}
              y={shape.y}
              width={shape.w}
              height={shape.h}
              rx={shape.r}
              fill="#fff"
            />
          )
        }
        if (shape.kind === 'circle') {
          return <circle key={i} cx={shape.cx} cy={shape.cy} r={shape.r} fill="#fff" />
        }
        return <path key={i} d={shape.d} fill="#fff" />
      })}
    </g>
  )
}

function HandDisc({ hand, cx, cy, r }: { hand: Hand; cx: number; cy: number; r: number }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill={HAND_COLORS_CSS[hand]} />
      <HandGlyph hand={hand} size={r * 1.7} cx={cx} cy={cy} />
    </>
  )
}

function Figure({
  caption,
  label,
  children,
}: {
  caption: string
  label: string
  children: React.ReactNode
}) {
  return (
    <figure className="m-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="overflow-x-auto">
        <svg viewBox="0 0 640 300" role="img" aria-label={label} className="h-auto w-full min-w-[420px]">
          {children}
        </svg>
      </div>
      <figcaption className="mt-3 text-center text-sm text-slate-500">{caption}</figcaption>
    </figure>
  )
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="rounded-xl border border-slate-200 bg-white px-4">
      <summary className="cursor-pointer py-3 font-semibold">{q}</summary>
      <p className="pb-4 text-sm text-slate-600">{a}</p>
    </details>
  )
}

export default function HowItWorksPage() {
  const { targetWins, maxRoundsPerRun } = loadGameConfig()

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-12 p-5 pb-24">
      <header className="flex flex-col gap-4 pt-8">
        <Link className="text-sm text-slate-500 underline" href="/">
          ← Back to the game
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
          The machine locks in its hand before you tap
        </h1>
        <p className="text-lg text-slate-600">And you can check it yourself. The pictures explain it.</p>
      </header>

      {/* ── 1. Nỗi lo nằm ở thứ tự ─────────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold tracking-tight">The worry is about order</h2>

        <Figure
          label="Two timelines. Top, what you fear: you tap first, the machine sees your hand and only then picks the counter. Bottom, what actually happens: the machine commits and seals its hands first, you tap second, and the machine only reveals what it already wrote."
          caption="The machine cannot pick later, because it already finished writing."
        >
          <text x="0" y="16" fontSize="14" fontWeight="700" fill="#c1352f">
            What you fear
          </text>
          <line x1="0" y1="72" x2="640" y2="72" stroke="#e2e8f0" strokeWidth="2" />

          <circle cx="90" cy="72" r="9" fill={HAND_COLORS_CSS[0]} />
          <text x="90" y="46" textAnchor="middle" fontSize="13" className="fill-slate-600">
            you tap
          </text>
          <text x="90" y="98" textAnchor="middle" fontSize="12" className="fill-slate-500">
            scissors
          </text>

          <circle cx="320" cy="72" r="9" fill="#c1352f" />
          <text x="320" y="46" textAnchor="middle" fontSize="13" className="fill-slate-600">
            machine peeks
          </text>
          <text x="320" y="98" textAnchor="middle" fontSize="12" className="fill-slate-500">
            ah, scissors…
          </text>

          <circle cx="550" cy="72" r="9" fill={HAND_COLORS_CSS[1]} />
          <text x="550" y="46" textAnchor="middle" fontSize="13" className="fill-slate-600">
            then picks
          </text>
          <text x="550" y="98" textAnchor="middle" fontSize="12" className="fill-slate-500">
            rock — you lose
          </text>

          <text x="0" y="176" fontSize="14" fontWeight="700" fill="#0b7d5e">
            What actually happens
          </text>
          <line x1="0" y1="232" x2="640" y2="232" stroke="#e2e8f0" strokeWidth="2" />

          <rect x="66" y="222" width="48" height="20" rx="4" fill="#f1f5f9" stroke="#f5a623" strokeWidth="2" />
          <circle cx="90" cy="232" r="7" fill="#f5a623" />
          <text x="90" y="206" textAnchor="middle" fontSize="13" className="fill-slate-600">
            machine commits + seals
          </text>
          <text x="90" y="262" textAnchor="middle" fontSize="12" className="fill-slate-500">
            before you tap
          </text>

          <circle cx="320" cy="232" r="9" fill={HAND_COLORS_CSS[0]} />
          <text x="320" y="206" textAnchor="middle" fontSize="13" className="fill-slate-600">
            you tap
          </text>
          <text x="320" y="262" textAnchor="middle" fontSize="12" className="fill-slate-500">
            scissors
          </text>

          <circle cx="550" cy="232" r="9" fill="#f5a623" />
          <text x="550" y="206" textAnchor="middle" fontSize="13" className="fill-slate-600">
            machine only reveals
          </text>
          <text x="550" y="262" textAnchor="middle" fontSize="12" className="fill-slate-500">
            what it already wrote
          </text>

          <text x="640" y="292" textAnchor="end" fontSize="12" className="fill-slate-500">
            time →
          </text>
        </Figure>
      </section>

      {/* ── 2. Ba khung phong bì ───────────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold tracking-tight">The sealed envelope, in three frames</h2>

        <Figure
          label="Three frames. One, a sealed envelope with a wax seal you can see. Two, the envelope stays sealed while one hand is revealed each round. Three, the envelope is opened and the seal matches what was inside."
          caption="You see the seal from the very first round. You see the contents only when the run ends."
        >
          {/* khung 1 */}
          <rect x="10" y="40" width="190" height="150" rx="14" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="2" />
          <rect x="38" y="86" width="134" height="70" rx="9" fill="#fff" stroke="#e2e8f0" strokeWidth="2" />
          <path d="M 38 92 L 105 128 L 172 92" fill="none" stroke="#e2e8f0" strokeWidth="2" />
          <circle cx="105" cy="118" r="22" fill="#f5a623" />
          <text x="105" y="123" textAnchor="middle" fontSize="11" fontWeight="700" fill="#23180a">
            29c7…
          </text>
          <text x="105" y="66" textAnchor="middle" fontSize="13" fontWeight="700" className="fill-slate-700">
            1 · Before you play
          </text>
          <text x="105" y="180" textAnchor="middle" fontSize="12" className="fill-slate-500">
            sealed, seal shown to you
          </text>

          {/* khung 2 */}
          <rect x="225" y="40" width="190" height="150" rx="14" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="2" />
          <rect x="253" y="106" width="134" height="50" rx="9" fill="#fff" stroke="#e2e8f0" strokeWidth="2" />
          <circle cx="290" cy="131" r="8" fill="#f5a623" opacity="0.4" />
          <circle cx="320" cy="131" r="8" fill="#f5a623" opacity="0.4" />
          <circle cx="350" cy="131" r="8" fill="#f5a623" opacity="0.4" />
          <HandDisc hand={1} cx={320} cy={82} r={17} />
          <text x="320" y="66" textAnchor="middle" fontSize="13" fontWeight="700" className="fill-slate-700">
            2 · While you play
          </text>
          <text x="320" y="180" textAnchor="middle" fontSize="12" className="fill-slate-500">
            one hand revealed per round
          </text>

          {/* khung 3 */}
          <rect x="440" y="40" width="190" height="150" rx="14" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="2" />
          <rect x="468" y="104" width="134" height="52" rx="9" fill="#fff" stroke="#e2e8f0" strokeWidth="2" />
          <path d="M 468 104 L 535 74 L 602 104" fill="none" stroke="#f5a623" strokeWidth="2" strokeLinejoin="round" />
          <line x1="490" y1="122" x2="580" y2="122" stroke="#cbd5e1" strokeWidth="3" />
          <line x1="490" y1="134" x2="580" y2="134" stroke="#cbd5e1" strokeWidth="3" />
          <line x1="490" y1="146" x2="545" y2="146" stroke="#cbd5e1" strokeWidth="3" />
          <circle cx="597" cy="88" r="14" fill="#0b7d5e" />
          <path d="M 590 88 L 595 93 L 605 83" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <text x="535" y="66" textAnchor="middle" fontSize="13" fontWeight="700" className="fill-slate-700">
            3 · Run over
          </text>
          <text x="535" y="180" textAnchor="middle" fontSize="12" className="fill-slate-500">
            opened, and the seal matches
          </text>

          <text x="320" y="232" textAnchor="middle" fontSize="12" className="fill-slate-500">
            Change one character inside and the seal changes completely —
          </text>
          <text x="320" y="252" textAnchor="middle" fontSize="12" className="fill-slate-500">
            so the machine cannot edit it after handing you the seal.
          </text>
        </Figure>
      </section>

      {/* ── 3. Bên trong là một con số ─────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold tracking-tight">Inside is a number, not a list</h2>

        <Figure
          label="A formula: the secret number plus your own text plus the round number gives the machine's hand for that round. Below, examples for rounds one, two, three and eighty-seven."
          caption="The number never changes, so every round's hand is fixed the moment the envelope is sealed."
        >
          <rect x="2" y="24" width="150" height="52" rx="12" fill="#f8fafc" stroke="#f5a623" strokeWidth="2" />
          <text x="77" y="47" textAnchor="middle" fontSize="13" fontWeight="700" className="fill-slate-800">
            secret number
          </text>
          <text x="77" y="65" textAnchor="middle" fontSize="11" className="fill-slate-500">
            in the envelope
          </text>

          <text x="166" y="57" textAnchor="middle" fontSize="20" className="fill-slate-400">
            +
          </text>

          <rect x="180" y="24" width="150" height="52" rx="12" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="2" />
          <text x="255" y="47" textAnchor="middle" fontSize="13" fontWeight="700" className="fill-slate-800">
            your own text
          </text>
          <text x="255" y="65" textAnchor="middle" fontSize="11" className="fill-slate-500">
            my cat sleeps a lot
          </text>

          <text x="344" y="57" textAnchor="middle" fontSize="20" className="fill-slate-400">
            +
          </text>

          <rect x="358" y="24" width="120" height="52" rx="12" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="2" />
          <text x="418" y="47" textAnchor="middle" fontSize="13" fontWeight="700" className="fill-slate-800">
            round number
          </text>
          <text x="418" y="65" textAnchor="middle" fontSize="11" className="fill-slate-500">
            1, 2, 3 …
          </text>

          <path d="M 494 50 L 536 50" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M 528 43 L 537 50 L 528 57" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          <rect x="548" y="24" width="90" height="52" rx="12" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="2" />
          <text x="593" y="55" textAnchor="middle" fontSize="13" fontWeight="700" className="fill-slate-800">
            its hand
          </text>

          <text x="320" y="106" textAnchor="middle" fontSize="12" className="fill-slate-500">
            a public calculation — anyone can run it again
          </text>

          <line x1="2" y1="128" x2="638" y2="128" stroke="#e2e8f0" strokeWidth="1.5" />

          <text x="60" y="158" textAnchor="middle" fontSize="13" className="fill-slate-600">
            round 1
          </text>
          <HandDisc hand={0} cx={60} cy={196} r={22} />

          <text x="200" y="158" textAnchor="middle" fontSize="13" className="fill-slate-600">
            round 2
          </text>
          <HandDisc hand={2} cx={200} cy={196} r={22} />

          <text x="340" y="158" textAnchor="middle" fontSize="13" className="fill-slate-600">
            round 3
          </text>
          <HandDisc hand={1} cx={340} cy={196} r={22} />

          <text x="450" y="202" textAnchor="middle" fontSize="20" className="fill-slate-400">
            …
          </text>

          <text x="560" y="158" textAnchor="middle" fontSize="13" className="fill-slate-600">
            round 87
          </text>
          <HandDisc hand={0} cx={560} cy={196} r={22} />
          <text x="560" y="238" textAnchor="middle" fontSize="11" className="fill-slate-500">
            already fixed too
          </text>

          <text x="320" y="278" textAnchor="middle" fontSize="12" className="fill-slate-500">
            whether or not you ever reach that round
          </text>
        </Figure>

        <p className="text-slate-600">
          Because it is a calculation and not a hand-written list, it is not capped at any number of
          rounds. Every round can be worked out, and always comes out the same.
        </p>

        <p className="rounded-2xl bg-amber-500 px-6 py-5 text-lg font-bold text-amber-950">
          A draw is replayed — and that replay was locked in just like every other round.
        </p>

        <p className="text-slate-600">
          So you usually play <strong>more</strong> rounds than you win: a draw does not count toward
          the streak but still uses up a round. You need <strong>{targetWins} wins</strong>, and a run
          allows up to <strong>{maxRoundsPerRun} rounds</strong>.
        </p>
      </section>

      {/* ── 4. Kiểm tra trên máy của bạn ───────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold tracking-tight">Checking happens on your device</h2>

        <Figure
          label="Your device recomputes the whole run and everything matches. It sends no question to our server."
          caption="If it had to ask us whether we cheated, the answer would prove nothing."
        >
          <rect x="30" y="60" width="230" height="150" rx="16" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="2" />
          <text x="145" y="88" textAnchor="middle" fontSize="13" fontWeight="700" className="fill-slate-700">
            your device
          </text>
          <rect x="56" y="102" width="178" height="26" rx="6" fill="#fff" stroke="#e2e8f0" strokeWidth="1.5" />
          <text x="145" y="120" textAnchor="middle" fontSize="12" className="fill-slate-500">
            recomputes every round
          </text>
          <circle cx="145" cy="166" r="24" fill="#0b7d5e" />
          <path d="M 134 166 L 142 174 L 158 157" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <text x="145" y="206" textAnchor="middle" fontSize="12" className="fill-slate-500">
            all match
          </text>

          <path d="M 276 135 L 380 135" stroke="#c1352f" strokeWidth="2.5" strokeDasharray="6 5" strokeLinecap="round" />
          <g stroke="#c1352f" strokeWidth="3.5" strokeLinecap="round">
            <path d="M 318 122 L 340 148" />
            <path d="M 340 122 L 318 148" />
          </g>
          <text x="328" y="176" textAnchor="middle" fontSize="13" fontWeight="700" fill="#c1352f">
            never asks
          </text>

          <rect x="396" y="82" width="210" height="106" rx="14" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="2" strokeDasharray="6 5" />
          <text x="501" y="128" textAnchor="middle" fontSize="13" fontWeight="700" className="fill-slate-500">
            our server
          </text>
          <text x="501" y="152" textAnchor="middle" fontSize="12" className="fill-slate-500">
            takes no part
          </text>
        </Figure>

        <p className="text-slate-600">
          When a run ends, tap <strong>Verify this run</strong>. That link works for anyone you send it
          to — no account needed. And if you get suspicious mid-run, tap <strong>Give up</strong>: the
          envelope opens right away, so you never have to keep playing just to check.
        </p>
      </section>

      {/* ── 5. Nói thẳng về giới hạn ───────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold tracking-tight">How far this actually goes</h2>

        <Figure
          label="Two columns. Left, with a tick: proven, the machine did not change its own hand. Right, with a cross: not proven, that the machine recorded your hand faithfully."
          caption="We write this down instead of claiming cheating is impossible."
        >
          <rect x="4" y="40" width="306" height="180" rx="14" fill="#f8fafc" stroke="#0b7d5e" strokeWidth="2" />
          <circle cx="46" cy="80" r="18" fill="#0b7d5e" />
          <path d="M 38 80 L 44 86 L 56 72" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          <text x="76" y="76" fontSize="14" fontWeight="700" className="fill-slate-900">
            Proven
          </text>
          <text x="76" y="98" fontSize="13" className="fill-slate-600">
            the machine did not change
          </text>
          <text x="76" y="118" fontSize="13" className="fill-slate-600">
            ITS OWN hand after seeing
          </text>
          <text x="76" y="138" fontSize="13" className="fill-slate-600">
            yours.
          </text>
          <text x="30" y="186" fontSize="12" className="fill-slate-500">
            This is what the whole page is about.
          </text>

          <rect x="330" y="40" width="306" height="180" rx="14" fill="#f8fafc" stroke="#c1352f" strokeWidth="2" strokeDasharray="6 5" />
          <circle cx="372" cy="80" r="18" fill="#c1352f" />
          <g stroke="#fff" strokeWidth="3.5" strokeLinecap="round">
            <path d="M 365 73 L 379 87" />
            <path d="M 379 73 L 365 87" />
          </g>
          <text x="402" y="76" fontSize="14" fontWeight="700" className="fill-slate-900">
            Not proven
          </text>
          <text x="402" y="98" fontSize="13" className="fill-slate-600">
            that it recorded YOUR
          </text>
          <text x="402" y="118" fontSize="13" className="fill-slate-600">
            hand faithfully.
          </text>
          <text x="356" y="186" fontSize="12" className="fill-slate-500">
            Closing that needs signed accounts.
          </text>
        </Figure>

        <div className="flex flex-col gap-3 rounded-2xl border-2 border-slate-900 bg-white p-6">
          <p className="text-xs font-extrabold uppercase tracking-widest text-slate-500">Straight talk</p>
          <p className="text-slate-600">
            In theory a dishonest system could receive &ldquo;scissors&rdquo; and write down
            &ldquo;rock&rdquo;, and the verify page would still say everything matches. This version
            cannot close that gap, because play is fully anonymous with no sign-up.
          </p>
          <p className="text-slate-600">
            <strong className="text-slate-900">
              An overclaim only has to be wrong once to burn all the trust
            </strong>{' '}
            — and trust is the exact thing this game was built to earn.
          </p>
        </div>
      </section>

      {/* ── 6. Hỏi đáp ─────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold tracking-tight">Quick answers</h2>

        <div className="flex flex-col gap-2.5">
          <Faq
            q="Is each hand really one in three?"
            a="Yes. The machine's three hands are equally likely, and draws are replayed rather than counted. So every decided round is a coin flip."
          />
          <Faq
            q={`How hard is winning ${targetWins} in a row?`}
            a="About one in a million. Your streak ending early is normal, not a sign that you are being blocked."
          />
          <Faq
            q="What if I leave the seed box empty?"
            a="The machine generates a random one and still shows it to you. You just have to trust that it was random. Type your own if you would rather not."
          />
          <Faq
            q="Do I need an account?"
            a="No. You can play straight away. We do not ask for a name, an email or a phone number."
          />
          <Faq
            q="I am not technical — can someone check for me?"
            a="Yes. Send them the Verify this run link; everything they need is already inside it."
          />
        </div>
      </section>

      <footer className="border-t border-slate-200 pt-5 text-sm text-slate-500">
        <Link className="underline" href="/">
          Back to the game
        </Link>
        {' · '}
        <a className="underline" href="/verify">
          Verify a run
        </a>
        {' · '}
        <a className="underline" href="/stats">
          Public stats
        </a>
      </footer>
    </main>
  )
}
