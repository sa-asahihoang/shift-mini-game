import { expect, test } from '@playwright/test'
import { dismissResultDialog, settleRound } from './settle'

/**
 * Hoà phải báo ngay trên sân đấu.
 *
 * Hoà không chặn bằng popup — hoà là đánh lại chứ không phải cột mốc — nên nếu
 * không có nhãn này thì người chơi bấm xong thấy băng cuộn quay tiếp và màn hình
 * về y như cũ, không biết ván vừa rồi có tính hay không.
 *
 * Không đặt được kết quả từ ngoài (hạt giống của máy do server sinh), nên test
 * cứ chơi tới khi gặp hoà. Hoà giữ lượt sống nên phần lớn thời gian là bấm tiếp
 * trong cùng một lượt; chỉ khi lượt kết thúc mới phải bắt đầu lượt mới, và số
 * lần bắt đầu bị chặn dưới 30/phút của `POST /api/runs`.
 */
test('hoà thì báo ngay trên sân đấu', async ({ page }) => {
  await page.goto('/')

  const notice = page.locator('[data-shown]')
  const playButton = page.getByRole('button', { name: 'scissors', exact: true })

  await page.getByRole('button', { name: 'Start run' }).click()
  await expect(playButton).toBeVisible()

  // Kiểm âm ngay trong bài: chưa đánh ván nào thì nhãn phải đang tắt. Thiếu nó
  // thì một cái nhãn hiện vĩnh viễn cũng làm bài test này xanh.
  await expect(notice).toHaveAttribute('data-shown', 'false')

  let drew = false

  for (let attempt = 0; attempt < 20 && !drew; attempt++) {
    for (let round = 0; round < 40; round++) {
      await settleRound(page)

      await dismissResultDialog(page)

      if ((await playButton.count()) === 0) break // lượt đã kết thúc, ra ngoài bắt đầu lượt mới

      await playButton.click()
      await settleRound(page)

      if ((await notice.getAttribute('data-shown')) === 'true') {
        drew = true
        break
      }
    }

    if (drew) break

    // Ván thua vừa kết thúc lượt cũng dựng popup, che luôn màn kết thúc phía sau.
    await dismissResultDialog(page)

    // Rồi chờ màn kết thúc dựng XONG mới bấm lượt mới. Công bố hạt giống làm dải
    // cam kết dài thêm một dòng và đẩy cái nút xuống, nên bấm sớm là Playwright báo
    // "element is not stable" rồi "detached" — đúng nút đó, chỉ là React vừa thay
    // node dưới chân nó.
    await expect(page.getByText('Server seed', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'New run' }).click()

    // Chờ lượt mới render xong rồi mới cho vòng trong chạy lại. Thiếu dòng này thì
    // `settleRound` ở đầu vòng trong đi qua ngay — nút tay chưa kịp có, mà "chưa có
    // nút tay" chính là điều kiện nó coi là đã chốt — vòng trong thoát tức thì, và
    // vòng ngoài bấm "New run" lần thứ hai đúng lúc `start()` còn đang bay.
    await expect(playButton).toBeVisible()
  }

  expect(drew).toBe(true)
  await expect(notice).toHaveAttribute('data-shown', 'true')
  await expect(page.getByText('Draw — play again')).toBeVisible()

  // Và lượt vẫn chạy tiếp: hoà là đánh lại, không phải hết lượt.
  await expect(page.getByRole('button', { name: 'scissors', exact: true })).toBeEnabled()
})
