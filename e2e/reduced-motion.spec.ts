import { expect, test } from '@playwright/test'

/**
 * Đường giảm chuyển động rẽ nhánh ở nhiều chỗ trong sân đấu — bỏ vòng quay, bỏ
 * nảy, bỏ vòng sáng — nên nó hỏng được riêng trong khi đường thường vẫn chạy tốt.
 *
 * Test sinh ra sau khi rút thời lượng tween về 0 làm phép tính 0/0 ra NaN, NaN
 * chảy vào góc quay và cả cái trống biến mất. Đường thường không hề hấn gì.
 *
 * Cố ý chỉ đánh MỘT ván. Bản đầu bấm trong vòng lặp như test chính, nhưng ở chế
 * độ này một ván chỉ còn khoảng 120ms — ngắn hơn nhịp chờ của vòng lặp — nên các
 * cú bấm dồn lên nhau và Playwright treo ở `click()` chờ nút bật lại. Một ván là
 * đủ để chứng minh sân đấu không nổ và trạng thái có tiến; phần chơi trọn lượt đã
 * có test chính lo.
 */
test('giảm chuyển động: một ván vẫn chạy trọn và không nổ', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  // Đặt qua emulateMedia chứ không qua test.use({ reducedMotion }): ở Playwright
  // 1.62 khoá đó không nằm trong kiểu test option nên viết cách kia sẽ đỏ typecheck.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')

  await page.getByRole('button', { name: 'Start run' }).click()
  await expect(page.getByText('Round 1')).toBeVisible()

  await page.getByRole('button', { name: 'scissors', exact: true }).click()

  // Ván xong thì hoặc sang ván sau, hoặc lượt kết thúc — cả hai đều chứng tỏ sân
  // đấu chạy hết chu trình và trả quyền điều khiển lại.
  await expect(page.getByText(/Round 2|Run over/)).toBeVisible()
  expect(pageErrors).toEqual([])
})
