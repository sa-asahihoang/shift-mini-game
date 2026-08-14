import type { Hand } from '@/lib/game/hands'
import { HAND_SHAPES } from '@/lib/ui/hand-art'

/**
 * Ba tay dạng SVG cho nút bấm.
 *
 * Đọc chung `HAND_SHAPES` với canvas Pixi, nên hình ở nút và hình trên sân không
 * thể lệch nhau. Nút phải là phần tử HTML thật — canvas không nhận được focus bàn
 * phím và trình đọc màn hình không đọc được nội dung của nó.
 */
export function HandIcon({ hand, className }: { hand: Hand; className?: string }) {
  return (
    <svg viewBox="-50 -50 100 100" className={className} aria-hidden="true" fill="currentColor">
      {HAND_SHAPES[hand].map((shape, i) => {
        if (shape.kind === 'roundRect') {
          return <rect key={i} x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.r} />
        }
        if (shape.kind === 'circle') {
          return <circle key={i} cx={shape.cx} cy={shape.cy} r={shape.r} />
        }
        return <path key={i} d={shape.d} />
      })}
    </svg>
  )
}
