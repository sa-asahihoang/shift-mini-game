// e2e/play-and-verify.spec.ts
import { expect, test } from '@playwright/test'
import { dismissResultDialog, settleRound } from './settle'

test('chơi tới khi hết lượt rồi tự kiểm chứng thành công', async ({ page }) => {
  await page.goto('/')

  await page.getByPlaceholder('type anything').fill('hat-giong-e2e')
  await page.getByRole('button', { name: 'Start run' }).click()

  // Mã niêm phong phải hiện ra TRƯỚC khi bấm ván đầu tiên.
  await expect(page.getByText('Commitment', { exact: true })).toBeVisible()

  // Bấm liên tục cho tới khi lượt kết thúc. Trung bình hai ván là thua.
  for (let i = 0; i < 400; i++) {
    // Chốt ván trước rồi mới đọc trạng thái — xem e2e/settle.ts về các trạng thái
    // trung gian đủ giống trạng thái cuối để lừa được một phép chờ ngây thơ.
    await settleRound(page)

    // Ván thắng lẫn ván thua đều dựng popup che kín mọi thứ phía sau cho tới khi bấm.
    await dismissResultDialog(page)

    const playButton = page.getByRole('button', { name: 'scissors', exact: true })
    if ((await playButton.count()) === 0) break

    // Kiểm lại ở MỖI vòng, không chỉ một lần trước vòng lặp. Một lỗi làm lộ seed
    // từ ván thứ hai trở đi sẽ lọt qua phép kiểm chỉ chạy lúc t=0.
    await expect(page.getByText('Server seed', { exact: true })).toHaveCount(0)

    // Không bọc try/catch quanh click. Bản trước có, và nó nuốt đúng cái lỗi
    // đáng thấy nhất: popup ván thắng chặn click, vòng lặp lặng lẽ thoát, rồi
    // test đỏ ở "New run" — cách xa nguyên nhân thật. Sau settleRound thì
    // DOM đã đứng yên, click đỏ ở đây là lỗi thật và phải đỏ ngay tại đây.
    await playButton.click()
  }

  // Ván thua cuối cùng cũng dựng popup, và nó che luôn màn kết thúc phía sau.
  await dismissResultDialog(page)

  await expect(page.getByRole('button', { name: 'New run' })).toBeVisible()
  await expect(page.getByText('Server seed', { exact: true })).toBeVisible()

  // Lấy URL kiểm chứng thật của lượt vừa xong TRƯỚC khi bấm "New run": GameBoard
  // không lưu trạng thái ở đâu ngoài React state trong bộ nhớ trang, nên ngay khi bấm
  // "New run" toàn bộ khối này — kể cả link — biến mất khỏi DOM vĩnh viễn, không
  // có cách nào lấy lại. (page.reload() ở đây cũng vô dụng vì lý do y hệt: nó không
  // phục hồi được trạng thái lượt, dù là lượt cũ hay lượt mới vừa bắt đầu.)
  const verifyHref = await page.getByRole('link', { name: 'Verify this run' }).getAttribute('href')
  if (!verifyHref) throw new Error('không tìm thấy link tự kiểm chứng lượt vừa xong')

  // Lượt mới phải xoá sạch seed của lượt trước. Kiểm bằng mắt không bắt được lỗi
  // này vì nó chỉ lộ ra khi chơi lượt thứ hai sau khi đã xong lượt thứ nhất.
  await page.getByRole('button', { name: 'New run' }).click()
  await expect(page.getByText('Server seed', { exact: true })).toHaveCount(0)

  // Giờ mới rời trang, đi tới đúng link kiểm chứng thật mà giao diện đã tạo ra cho
  // lượt đầu tiên (không phải URL tự bịa) để khép vòng: chơi thật → seed công bố →
  // tự dựng lại và đối chiếu.
  await page.goto(verifyHref)

  // Danh sách ván phải được điền sẵn từ link, nếu không trang chỉ đối chiếu được
  // cam kết và toàn bộ phần dựng lại từng tay không hề chạy.
  await expect(page.getByPlaceholder('[{"nonce":0')).not.toHaveValue('')

  await page.getByRole('button', { name: 'Verify' }).click()

  // Cam kết khớp.
  await expect(page.getByText('Commitment:')).toBeVisible()
  await expect(page.getByText('NO MATCH')).toHaveCount(0)

  // Và từng ván được dựng lại rồi đối chiếu — đây mới là điều sản phẩm hứa.
  // Thiếu khẳng định này thì test chỉ chứng minh một phép so hash.
  await expect(page.getByText('ALL MATCH')).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible()
  await expect(page.getByText('MISMATCH')).toHaveCount(0)
})
