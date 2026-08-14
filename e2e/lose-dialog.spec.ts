import { expect, test } from '@playwright/test'
import { dismissResultDialog, settleRound } from './settle'

/**
 * Thua cũng phải chặn lại bằng popup như thắng.
 *
 * Thua kết thúc lượt, nên không chặn thì băng cuộn vừa dừng là màn kết thúc thế
 * chỗ luôn phần chơi: người chơi thấy giao diện đổi hẳn mà chưa kịp đọc mình vừa
 * thua bằng tay nào.
 *
 * Thua dễ gặp hơn thắng nhiều — phần lớn lượt kết thúc bằng một ván thua — nên
 * chỉ cần bấm tiếp trong cùng một lượt tới khi lượt đóng lại.
 */
test('thua thì hiện popup xác nhận rồi mới tới màn kết thúc', async ({ page }) => {
  await page.goto('/')

  const dialog = page.getByRole('dialog')
  const playButton = page.getByRole('button', { name: 'scissors', exact: true })

  await page.getByRole('button', { name: 'Start run' }).click()
  await expect(playButton).toBeVisible()

  let lost = false

  for (let round = 0; round < 60 && !lost; round++) {
    await settleRound(page)

    // Ván thua nào cũng kết thúc lượt, nên nút tay biến mất đúng lúc popup hiện
    // ra. Đó chính là dấu hiệu cần bắt — đóng popup ở đây là mất luôn bằng chứng.
    if ((await playButton.count()) === 0) {
      lost = true
      break
    }

    await dismissResultDialog(page)
    await playButton.click()
  }

  expect(lost).toBe(true)

  await expect(dialog.getByText(/^Round \d+ lost$/)).toBeVisible()
  await expect(dialog.getByText('You: scissors')).toBeVisible()
  await expect(dialog.getByText(/^Streak broken at round \d+$/)).toBeVisible()

  // Màn kết thúc phải nằm SAU popup, không được lộ ra trước. Thiếu phép kiểm này
  // thì một popup chỉ nổi lên trong tích tắc rồi bị màn kết thúc đè cũng vẫn xanh.
  let blocked = false
  try {
    await page.getByRole('button', { name: 'New run' }).click({ timeout: 1_500 })
  } catch {
    blocked = true
  }
  expect(blocked).toBe(true)

  await dialog.getByRole('button', { name: 'See result' }).click()

  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('Run over', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'New run' })).toBeVisible()
  await expect(page.getByText('Server seed', { exact: true })).toBeVisible()
})
