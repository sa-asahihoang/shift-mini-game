import { expect, type Page } from '@playwright/test'

/**
 * Chờ một ván chốt hẳn trước khi đọc trạng thái hay bấm tiếp.
 *
 * Giao diện đi qua vài trạng thái trung gian trong lúc một ván chạy, và mỗi cái
 * đều đủ giống trạng thái cuối để lừa được một phép chờ ngây thơ:
 *
 * - Số ván tăng TRƯỚC khi status lật, nên ván thua cũng loé qua "Round n+1"
 *   một nhịp rồi mới chuyển sang màn kết thúc.
 * - Nút tay vẫn nằm trong DOM suốt lúc chờ server, chỉ là `disabled`.
 * - Ván thắng dựng popup che kín ba nút tay; chúng vẫn "visible" với Playwright,
 *   chỉ là bấm không tới.
 *
 * Mốc chốt thật là nút tay: hoặc bật lại (lượt còn chạy), hoặc biến mất hẳn
 * (lượt kết thúc). Chờ tới đó rồi mới phân nhánh thì không còn chỗ cho đua.
 *
 * Ngưỡng rộng tay vì ván đầu của mỗi worker phải chờ dev server biên dịch route
 * API, mà cả bộ chạy song song thì các worker chen nhau.
 */
/**
 * Đóng popup kết quả nếu nó đang mở.
 *
 * Thắng và thua đều dựng popup, và nó che kín mọi thứ phía sau cho tới khi bấm —
 * kể cả nút "New run" của màn kết thúc. Nhãn nút đổi theo tình huống
 * ("Continue" khi lượt còn chạy, "See result" khi đã xong) nên bám vào vai trò
 * trong dialog chứ đừng bám vào chữ.
 */
export async function dismissResultDialog(page: Page): Promise<void> {
  const button = page.getByRole('dialog').getByRole('button')
  if ((await button.count()) > 0) await button.click()
}

export async function settleRound(page: Page): Promise<void> {
  const playButton = page.getByRole('button', { name: 'scissors', exact: true })

  await expect(async () => {
    const gone = (await playButton.count()) === 0
    expect(gone || (await playButton.isEnabled())).toBe(true)
  }).toPass({ timeout: 45_000 })
}
