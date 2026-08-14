'use client'

import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import type { Application, Container, Graphics } from 'pixi.js'
import { ACCENT_ORANGE, HAND_COLORS, handSvg } from '@/lib/ui/hand-art'
import type { Hand, Outcome } from '@/lib/game/hands'

const STAGE_W = 360
const STAGE_H = 260

/** Thứ tự ba tay trên băng cuộn, lặp vòng. */
const REEL: Hand[] = [1, 0, 2]

const FACE_R = 62
/** Bước giữa hai tay: đúng bằng đường kính nên các ô lát khít nhau, không hở. */
const SPACING = FACE_R * 2
const LOOP = SPACING * REEL.length

/**
 * Tốc độ cuộn, px/giây. Một hằng số duy nhất, không bao giờ đổi.
 *
 * Băng chạy đúng tốc độ này lúc chờ, lúc có kết quả, và cho tới đúng khoảnh khắc
 * dừng. Không tăng, không giảm, không co giãn để về đích trong một khoảng thời
 * gian định trước — vì làm vậy thì tốc độ tự nó tố cáo kết quả trước khi hình kịp
 * hiện ra.
 */
const SPEED = SPACING * 5

const CENTER_Y = STAGE_H / 2

/** Thời lượng vòng sáng kết quả, ms. */
const BURST_MS = 460

export interface JankenStageHandle {
  /** Chạy tiếp tới tay máy vừa ra rồi dừng, sau đó là hiệu ứng kết quả. */
  playRound(serverHand: Hand, outcome: Outcome): Promise<void>
  /** Cho băng chạy lại, sẵn sàng cho ván tiếp theo. */
  resume(): void
  /** Về trạng thái đầu. */
  reset(): void
}

interface Props {
  ref?: Ref<JankenStageHandle | null>
}

/** Ô nền và hình tay tách rời: `Graphics` là lá nên không lồng con được. */
interface HandView {
  container: Container
  panel: Graphics
  icon: Graphics
}

interface Scene {
  app: Application
  faces: HandView[]
  burst: Graphics
  offset: number
  spinning: boolean
  /**
   * Vị trí `offset` phải dừng lại, hoặc null khi đang chạy tự do.
   *
   * Luôn ≥ `offset` tại lúc đặt, nên băng chỉ đi tiếp chứ không bao giờ lùi hay
   * nhảy cóc.
   */
  stopAt: number | null
  generation: number
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Người dùng đã bật giảm chuyển động thì không cuộn.
 *
 * Băng cuộn chạy suốt lúc chờ chứ không thoáng qua, nên đây đúng là loại chuyển
 * động gây khó chịu. Ở chế độ này tay máy hiện thẳng ra khi có kết quả.
 */
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Đặt băng đúng vào tay `hand` và cho đứng yên ở đó. */
function parkOn(scene: Scene, hand: Hand): void {
  scene.spinning = false
  scene.stopAt = null
  scene.offset = REEL.indexOf(hand) * SPACING
  layoutReel(scene)
}

export function JankenStage({ ref }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<Scene | null>(null)

  useEffect(() => {
    let disposed = false

    async function boot() {
      const host = hostRef.current
      if (!host) return

      // Nạp động: pixi chạm vào canvas và window, không có việc gì trên server.
      const { Application, Container, Graphics } = await import('pixi.js')

      const app = new Application()
      await app.init({
        backgroundAlpha: 0,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
        width: STAGE_W,
        height: STAGE_H,
      })

      // Effect có thể đã bị dọn trong lúc await — nếu vậy huỷ luôn, đừng gắn vào DOM.
      if (disposed) {
        app.destroy({ removeView: true }, { children: true })
        return
      }

      app.canvas.style.width = '100%'
      app.canvas.style.height = '100%'
      app.canvas.style.display = 'block'
      host.appendChild(app.canvas)

      // Cửa sổ tròn: băng cuộn nằm trong này, phần tràn ra ngoài bị cắt. Mask phải
      // nằm trong scene graph thì Pixi mới dùng được.
      const window_ = new Container()
      window_.position.set(STAGE_W / 2, CENTER_Y)
      app.stage.addChild(window_)

      const maskShape = new Graphics().circle(0, 0, FACE_R).fill(0xffffff)
      window_.addChild(maskShape)
      window_.mask = maskShape

      const faces = REEL.map((hand) => {
        const container = new Container()
        const panel = new Graphics()
        const icon = new Graphics()
        container.addChild(panel, icon)
        window_.addChild(container)

        const view: HandView = { container, panel, icon }
        paintHand(view, hand)
        return view
      })

      // Vòng sáng kết quả nằm NGOÀI cửa sổ tròn, nếu không nó bị chính mask cắt mất.
      const burst = new Graphics()
      burst.position.set(STAGE_W / 2, CENTER_Y)
      burst.alpha = 0
      app.stage.addChild(burst)

      const scene: Scene = {
        app,
        faces,
        burst,
        offset: 0,
        spinning: !prefersReducedMotion(),
        stopAt: null,
        generation: 0,
      }
      sceneRef.current = scene

      layoutReel(scene)

      app.ticker.add((ticker) => {
        if (!scene.spinning) return

        const step = SPEED * (ticker.deltaMS / 1000)

        // Chạm đích trong frame này: đặt đúng vào đích rồi tắt, chứ không vượt qua
        // rồi kéo ngược lại. `offset` gói lại về [0, LOOP) ngay lúc dừng để nó
        // không lớn dần vô hạn suốt một phiên chơi dài.
        if (scene.stopAt !== null && scene.offset + step >= scene.stopAt) {
          scene.offset = ((scene.stopAt % LOOP) + LOOP) % LOOP
          scene.spinning = false
          scene.stopAt = null
          layoutReel(scene)
          return
        }

        scene.offset += step
        layoutReel(scene)
      })
    }

    void boot()

    return () => {
      disposed = true
      const current = sceneRef.current
      sceneRef.current = null
      if (current) {
        current.generation++
        current.app.destroy({ removeView: true }, { children: true })
      }
    }
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      resume() {
        const scene = sceneRef.current
        if (!scene) return
        scene.generation++
        scene.stopAt = null
        scene.spinning = !prefersReducedMotion()
        scene.burst.alpha = 0
      },

      reset() {
        const scene = sceneRef.current
        if (!scene) return
        scene.generation++
        scene.stopAt = null
        scene.spinning = !prefersReducedMotion()
        scene.offset = 0
        scene.burst.alpha = 0
        layoutReel(scene)
      },

      async playRound(serverHand, outcome) {
        const scene = sceneRef.current
        if (!scene) return

        scene.generation++
        const generation = scene.generation
        const alive = () => sceneRef.current === scene && scene.generation === generation

        if (prefersReducedMotion()) {
          parkOn(scene, serverHand)
          await wait(120)
          return
        }

        // Đi tiếp tới lần xuất hiện GẦN NHẤT của tay đó ở phía trước rồi dừng.
        //
        // `delta` nằm trong [0, LOOP) nên quãng đường luôn dưới một vòng: băng
        // không lùi, không nhảy, và cũng không quay thêm vòng nào cho "kịch tính".
        // Thời gian dừng vì thế thay đổi theo từng ván — đó là hệ quả của việc giữ
        // đúng một tốc độ, không phải thứ cần chỉnh cho đều.
        const target = REEL.indexOf(serverHand) * SPACING
        const delta = (((target - scene.offset) % LOOP) + LOOP) % LOOP
        scene.stopAt = scene.offset + delta
        scene.spinning = true

        // Chờ đúng quãng thời gian mà quãng đường đó cần ở tốc độ cố định.
        //
        // Ticker lo phần đẹp — nó kẹp chính xác vào `stopAt` nên hình dừng khít
        // tay máy — nhưng TIẾN TRÌNH của ván thì không được phụ thuộc vào nó.
        // Ticker chạy trên requestAnimationFrame, mà rAF đứng hẳn khi tab bị ẩn và
        // trễ tuỳ ý khi máy quá tải. Bản trước chờ ticker gọi lại: chơi trong một
        // tab ẩn là ván treo vĩnh viễn với `busy` kẹt `true` và ba nút tay khoá
        // cứng, không một thông báo lỗi. Tái hiện được, và cả bộ e2e cũng đỏ theo
        // đúng kiểu đó mỗi khi máy chạy nhiều trình duyệt song song.
        await wait((delta / SPEED) * 1000)
        if (!alive()) return

        // Ticker chưa kịp tới đích thì tự đặt vào. Đường này chỉ chạy khi khung
        // hình đang bị bỏ đói — nghĩa là không có ai nhìn thấy cú nhảy.
        if (scene.stopAt !== null) parkOn(scene, serverHand)

        // Vòng sáng theo kết quả — hoà thì không có, để thắng và thua nổi hơn.
        if (outcome !== 'draw') {
          const color = outcome === 'win' ? ACCENT_ORANGE : 0x94a3b8
          scene.burst.clear().circle(0, 0, FACE_R).stroke({ width: 7, color })
          scene.burst.alpha = 1

          const started = performance.now()
          const grow = () => {
            if (!alive()) return
            const p = Math.min((performance.now() - started) / BURST_MS, 1)
            scene.burst.scale.set(1 + p * 0.85)
            scene.burst.alpha = 1 - p
            if (p < 1) requestAnimationFrame(grow)
          }
          requestAnimationFrame(grow)
        }

        await wait(BURST_MS)
      },
    }),
    [],
  )

  return <div ref={hostRef} className="mx-auto aspect-[18/13] w-full max-w-[360px]" aria-hidden="true" />
}

/**
 * Xếp ba tay thành một băng cuộn dọc lặp vô tận.
 *
 * Thuần 2D: mỗi tay chỉ trượt theo trục y rồi quấn vòng, không nén không xoay —
 * cảm giác trống quay đến từ cửa sổ tròn cắt bớt hai đầu, không cần phép chiếu 3D.
 */
function layoutReel(scene: Scene): void {
  scene.faces.forEach((view, i) => {
    // Đưa về khoảng [-LOOP/2, LOOP/2) để tay vừa khuất trên lại xuất hiện dưới.
    let y = (((i * SPACING - scene.offset) % LOOP) + LOOP) % LOOP
    if (y > LOOP / 2) y -= LOOP

    view.container.position.set(0, y)
  })
}

/**
 * Nền của mỗi tay là một ô vuông phủ kín bước cuộn, không phải hình tròn.
 *
 * Ô tròn thì hai ô cạnh nhau chỉ tiếp xúc tại một điểm, nên mỗi lần một đường
 * nối trôi qua giữa cửa sổ là hai bên mép loé ra nền trắng rồi khép lại — chạy
 * liền một mạch mà nhìn ra giật cục từng nhịp. Ô vuông lát khít nhau nên cửa sổ
 * lúc nào cũng đầy màu, và chính cái mask tròn lo phần bo góc.
 */
function paintHand(view: HandView, hand: Hand): void {
  view.panel
    .clear()
    .rect(-SPACING / 2, -SPACING / 2, SPACING, SPACING)
    .fill(HAND_COLORS[hand])
  view.icon.clear().svg(handSvg(hand))
  view.icon.scale.set(FACE_R / 50)
}
