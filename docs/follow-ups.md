# Việc còn tồn

Những mục dưới đây được review toàn nhánh cuối cùng nêu ra và **cố ý hoãn lại**, không phải bỏ sót.
Không mục nào chặn việc chạy thật, nhưng hai mục đầu nên xử lý trước khi có lưu lượng thật.

## Nên làm trước khi mở cho người dùng

### Trần rate limit theo IP đang áp cho cả request đã có phiên

`src/lib/http/handler.ts` giới hạn 300 request mỗi phút cho mỗi IP, đặt trước bước dựng phiên để
chặn việc tạo hàng loạt bản ghi `players` từ request không cookie. Nhưng nó áp cho **mọi** request,
kể cả request đã có cookie hợp lệ, trong khi giới hạn theo người chơi đã là 120/phút.

Hệ quả: khoảng 7-8 người chơi cùng lúc sau một địa chỉ NAT văn phòng là chạm trần, và họ nhận 429
giữa chừng một chuỗi thắng mà không có cách nào xử lý.

Lỗ hổng thật sự cần bịt là *tạo player khi không có cookie*, nên cách sửa đúng là **chỉ áp giới hạn
IP cho request không mang cookie phiên hợp lệ**, hoặc đơn giản hơn là nâng trần lên khoảng 2000/phút.

### `clientIp` rơi về `'unknown'`

`src/lib/http/session.ts` đọc `x-forwarded-for`, không có thì trả `'unknown'`. Nếu proxy vì lý do gì
đó ngừng đặt header ấy, **toàn bộ lưu lượng dồn vào một xô đếm duy nhất** và cả site bị bóp cùng lúc.

Chuyện header này giả mạo được đã ghi chú trong code và chấp nhận vì app chạy sau proxy của Coolify.
Chuyện dồn-về-một-xô thì chưa ghi ở đâu. Tối thiểu nên nói rõ trong tài liệu triển khai rằng proxy
bắt buộc phải đặt `x-forwarded-for`.

## Có thể làm sau

### Chưa có advisory lock trong `runMigrations`

Hai tiến trình migrate chạy song song sẽ có một tiến trình thắng, tiến trình kia hỏng với
`type ... already exists` rồi rollback sạch — **không hỏng dữ liệu, không áp một nửa, không deadlock**,
chỉ là một lần deploy báo lỗi oan. Coolify chạy pre-deployment command đúng một lần mỗi deploy nên
hiện chưa gặp. Bọc `SELECT pg_advisory_xact_lock(...)` quanh hàm là xong, khoảng ba dòng.

### `runs.next_nonce` chưa được dựng lại từ sổ ván

`inspectRun` và job đối chiếu hằng đêm đã dựng lại `status` và `wins` từ bảng `rounds` để bắt trường
hợp bản ghi lượt bị sửa. `next_nonce` cũng suy ra được y hệt và cũng quan trọng tương đương, nhưng
nằm ngoài phạm vi lần sửa đó.

### README thiếu hai hành vi người chơi nhìn thấy

Chưa nói rằng **hòa thì đánh lại**, không cộng cũng không làm mất chuỗi; và chạm trần 300 ván thì
lượt đóng lại với trạng thái `abandoned`.

### Trang quản trị dựa vào việc Next tự đánh dấu route là động

`src/app/admin/runs/[code]/page.tsx` trả `serverSeed` trong HTML và không đặt `Cache-Control` tường
minh — nó an toàn nhờ việc gọi `headers()` khiến Next coi route là động. Đúng nhưng ngầm định; nên
nói thẳng ra bằng một header.

## Ghi chú về giới hạn của chính giao thức

Không phải lỗi, nhưng nên biết khi viết lời quảng bá.

Giao thức chứng minh **server không chọn tay của nó theo tay người chơi** — điều đó chặt chẽ. Nó
**không** chứng minh rằng tay của *người chơi* được ghi lại trung thực: một người vận hành sửa
`playerHand` trong sổ vẫn qua được `verifyRun`, qua được job đối chiếu và qua được trang quản trị.

Ngoài ra, mã cam kết chỉ nằm trong chính cơ sở dữ liệu của người vận hành. Một người chơi **không tự
lưu lại mã cam kết trước khi chơi** thì không thể phát hiện việc tráo seed sau đó.

Cả hai đều nằm sẵn trong thiết kế đã duyệt chứ không phải lỗi cài đặt. Nhưng nếu muốn lời hứa với
người chơi đúng bằng thứ hệ thống thật sự bảo đảm, nên thêm nút sao chép mã cam kết và một câu nói
thẳng rằng việc kiểm chứng bao gồm gì và không bao gồm gì.
