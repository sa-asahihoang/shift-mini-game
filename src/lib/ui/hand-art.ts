import type { Hand } from '@/lib/game/hands'

/**
 * Bảng màu ba tay. Dùng chung cho canvas Pixi lẫn nút HTML, nên một chỗ đổi là
 * đổi hết — nút và tay trên sân không được lệch màu nhau.
 */
export const HAND_COLORS: Record<Hand, number> = {
  0: 0x12b886, // kéo — lục
  1: 0x3b5bdb, // búa — lam
  2: 0xf4614e, // bao — đỏ san hô
}

export const HAND_COLORS_CSS: Record<Hand, string> = {
  0: '#12b886',
  1: '#3b5bdb',
  2: '#f4614e',
}

export const ACCENT_ORANGE = 0xf5a623

/**
 * Hình học ba tay, khai báo một lần cho cả hai nơi vẽ.
 *
 * Nút bấm phải là phần tử HTML thật để nhận focus bàn phím và trình đọc màn hình,
 * nên nó vẽ bằng SVG; sân đấu vẽ bằng Pixi. Hai bộ máy vẽ khác nhau nhưng cùng đọc
 * dữ liệu này, nên sửa hình chỉ phải sửa một chỗ.
 *
 * Dùng khối ĐẶC chứ không phải nét viền: ở cỡ 40px, nét mảnh kèm chi tiết bên
 * trong biến thành nhiễu và ba tay trông na ná nhau. Các khối cùng màu chồng lên
 * nhau tự hợp thành một bóng liền.
 *
 * Hệ quy chiếu: hộp vuông từ -50 đến 50, gốc ở giữa.
 */
export type HandShape =
  | { kind: 'roundRect'; x: number; y: number; w: number; h: number; r: number }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'path'; d: string }

export const HAND_SHAPES: Record<Hand, HandShape[]> = {
  // Kéo: nắm tay với hai ngón chìa thành chữ V. Ngón vẽ bằng tứ giác nghiêng vì
  // xoay hình chữ nhật cần transform, thứ không chắc Pixi đọc được từ SVG.
  0: [
    { kind: 'roundRect', x: -21, y: 2, w: 42, h: 30, r: 13 },
    { kind: 'path', d: 'M -1.2 4.5 L -10.8 7.5 L -24.8 -36.5 L -15.2 -39.5 Z' },
    { kind: 'circle', cx: -20, cy: -38, r: 5 },
    { kind: 'path', d: 'M 1.2 4.5 L 10.8 7.5 L 24.8 -36.5 L 15.2 -39.5 Z' },
    { kind: 'circle', cx: 20, cy: -38, r: 5 },
    { kind: 'circle', cx: -24, cy: 20, r: 8 },
  ],
  // Búa: nắm tay nhìn thẳng — thân bo tròn, bốn khớp ngón nhô lên mép trên, ngón
  // cái là khối tròn bên trái.
  1: [
    { kind: 'roundRect', x: -26, y: -13, w: 52, h: 38, r: 15 },
    { kind: 'circle', cx: -19, cy: -13, r: 7.5 },
    { kind: 'circle', cx: -6.3, cy: -15, r: 7.5 },
    { kind: 'circle', cx: 6.3, cy: -15, r: 7.5 },
    { kind: 'circle', cx: 19, cy: -13, r: 7.5 },
    { kind: 'roundRect', x: -32, y: 1, w: 15, h: 17, r: 7.5 },
  ],
  // Bao: bàn tay xoè — lòng bàn tay cùng bốn ngón dựng và một ngón cái chìa ngang.
  2: [
    { kind: 'roundRect', x: -23, y: -8, w: 46, h: 34, r: 14 },
    { kind: 'roundRect', x: -21, y: -40, w: 10, h: 36, r: 5 },
    { kind: 'roundRect', x: -9.5, y: -44, w: 10, h: 40, r: 5 },
    { kind: 'roundRect', x: 2, y: -43, w: 10, h: 39, r: 5 },
    { kind: 'roundRect', x: 13, y: -37, w: 10, h: 33, r: 5 },
    { kind: 'roundRect', x: -35, y: 0, w: 17, h: 12, r: 6 },
  ],
}

/** Dựng markup SVG cho Pixi `Graphics.svg()`. React dựng JSX từ cùng `HAND_SHAPES`. */
export function handSvg(hand: Hand): string {
  const body = HAND_SHAPES[hand]
    .map((shape) => {
      if (shape.kind === 'roundRect') {
        return `<rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" rx="${shape.r}" fill="#fff"/>`
      }
      if (shape.kind === 'circle') {
        return `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}" fill="#fff"/>`
      }
      return `<path d="${shape.d}" fill="#fff"/>`
    })
    .join('')

  return `<svg viewBox="-50 -50 100 100">${body}</svg>`
}
