import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // Một lượt kết thúc ở ván thua đầu tiên, mà số ván đó là ngẫu nhiên với đuôi
  // dài: đo thực tế thấy dao động từ 1s tới 25s. Cộng thêm hoạt ảnh mỗi ván, để
  // trần 60s là thỉnh thoảng đỏ vì xui chứ không phải vì hỏng.
  timeout: 180_000,
  // Chạy nối tiếp, không để Playwright tự lấy số worker theo số core.
  //
  // Cả bộ đánh vào MỘT `next dev` một tiến trình, và mỗi worker là một Chromium
  // riêng. Ở mức mặc định (4 trên máy này) khoảng một nửa số lần chạy đỏ, luôn
  // cùng một kiểu: nút tay kẹt `disabled` đúng tới lúc hết giờ chờ rồi mới nhả.
  //
  // Đã truy tới nơi trước khi hạ số này xuống, vì "giảm song song cho hết đỏ" là
  // cách giấu lỗi thật dễ dàng nhất:
  //
  // - Không phải server chậm: log dev server không có request nào quá 106ms và
  //   không có 429 nào, đúng trong những lần chạy đỏ đó.
  // - Không phải trang bị treo: `page.evaluate` lúc đang kẹt trả lời trong 4ms.
  // - Không phải hoạt ảnh: kẹt ngay ở ván đầu, và `POST .../rounds` KHÔNG hề có
  //   trong resource timing của trang — request chưa từng hoàn tất, mà server
  //   cũng chưa từng thấy nó. Nó nằm kẹt trong trình duyệt trước khi ra khỏi máy,
  //   rồi thông sau khi test đã bỏ cuộc (ảnh chụp lúc hết giờ cho thấy lượt đã
  //   chạy xong).
  //
  // Tức là bốn trình duyệt cùng giữ kết nối vào một dev server thì tắc, không
  // phải sản phẩm hỏng. Chạy nối tiếp hết sạch, và cả bộ chỉ mất khoảng 10–25s.
  workers: 1,
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    // Dùng lại server đang chạy nếu có. Tiện, nhưng có một cái bẫy đã cắn một lần:
    // nếu WebSocket HMR của server đó chết giữa chừng, trình duyệt vẫn nạp bundle
    // cũ và test đỏ với lỗi trỏ vào những dòng code KHÔNG CÒN TỒN TẠI trong repo.
    // Gặp lỗi vô lý kiểu đó thì `rm -rf .next`, khởi động lại dev server rồi hẵng
    // đi tìm nguyên nhân trong code.
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
