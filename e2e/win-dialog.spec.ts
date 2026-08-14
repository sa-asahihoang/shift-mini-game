import { expect, test } from '@playwright/test'
import { dismissResultDialog, settleRound } from './settle'

/**
 * Thắng một ván phải chặn lại bằng popup xác nhận, và bấm "Continue" phải trả
 * quyền chơi lại chứ không kẹt.
 *
 * Không đặt được kết quả từ ngoài: hạt giống của máy do server sinh ngẫu nhiên
 * cho từng lượt, người chơi chỉ chọn được hạt giống của mình. Nên test bắt đầu
 * lượt mới tới khi ván đầu tiên thắng — mỗi lần khoảng 1/3, hai chục lần là gần
 * như chắc chắn (xác suất trượt cả hai chục lần cỡ 3 phần vạn). Trần vòng lặp là
 * để test đỏ chứ không treo nếu ván nào cũng không thắng — đó tự nó là một lỗi.
 *
 * Trần đó cũng không được vượt 30: `POST /api/runs` chặn ở 30 lượt mỗi phút cho
 * một người chơi, mà mỗi test chạy trong context riêng nên cả vòng lặp dùng
 * chung một cookie. Nới lên là test đỏ vì 429 chứ không phải vì tính năng hỏng.
 */
test('thắng một ván thì hiện popup xác nhận rồi chơi tiếp được', async ({ page }) => {
  await page.goto('/')

  // Bám vào role dialog chứ không tìm chữ trên cả trang: bong bóng thoại phía sau
  // cũng ghi "Chuỗi thắng 1/20", tìm rộng là dính hai phần tử và đỏ vì strict mode
  // — mà lại đỏ kể cả khi popup hoàn toàn không hiện.
  const dialog = page.getByRole('dialog')
  const dialogTitle = dialog.getByText(/^Round 1 won!$/)

  for (let attempt = 0; attempt < 20; attempt++) {
    // Từ vòng thứ hai trở đi ta đang đứng ở màn kết thúc: chờ nó dựng XONG rồi mới
    // bấm. Công bố hạt giống làm khối cam kết nở ra và đẩy cái nút xuống, nên bấm
    // sớm là Playwright báo "element is not stable" rồi "detached" — đúng nút đó,
    // chỉ là React vừa thay node dưới chân nó.
    if (attempt > 0) await expect(page.getByText('Server seed', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: /Start run|New run/ }).click()
    await expect(page.getByText('Round 1')).toBeVisible()

    await page.getByRole('button', { name: 'scissors', exact: true }).click()

    await settleRound(page)

    if (await dialogTitle.isVisible()) break

    // Ván thua cũng dựng popup, phải đóng mới thấy được màn kết thúc phía sau.
    await dismissResultDialog(page)

    // Hoà thì lượt vẫn đang chạy, phải bỏ mới quay về được nút bắt đầu.
    const abandon = page.getByRole('button', { name: 'Give up' })
    if ((await abandon.count()) > 0) await abandon.click()
  }

  await expect(dialogTitle).toBeVisible()
  await expect(dialog.getByText('Streak 1/20')).toBeVisible()
  await expect(dialog.getByText('You: scissors')).toBeVisible()

  // Popup phải che ba nút tay: nó là một cột mốc cần xác nhận, không phải toast
  // trôi qua. Bấm được xuyên qua thì người chơi đánh mất ván tiếp theo mà không
  // kịp thấy mình vừa thắng.
  let blocked = false
  try {
    await page.getByRole('button', { name: 'scissors', exact: true }).click({ timeout: 1_500 })
  } catch {
    blocked = true
  }
  expect(blocked).toBe(true)

  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('Round 2')).toBeVisible()

  // Và chơi tiếp được thật — popup đóng mà không trả lại quyền bấm thì lượt kẹt.
  await page.getByRole('button', { name: 'scissors', exact: true }).click()
  await settleRound(page)

  // .first() vì ván thắng cho ra HAI phần tử khớp cùng lúc: bong bóng đã sang
  // "Round 3" phía sau trong khi popup ghi "Round 2 won!" phía trước. Ở đây chỉ
  // cần biết ván có tiến, không cần biết tiến theo nhánh nào.
  await expect(page.getByText(/Round 3|Round 2 won!|Run over/).first()).toBeVisible()
})
