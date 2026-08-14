# Kéo Búa Bao — công bằng kiểm chứng được

Trò oẳn tù tì chuỗi thắng: đánh với máy, thắng liên tiếp đủ 20 ván thì thắng lượt, thua một ván
là đứt chuỗi. Điểm khác biệt duy nhất so với mọi bản kéo búa bao khác là bạn **không cần tin
máy chủ** — bạn tự kiểm tra lại được từng ván sau khi lượt kết thúc.

## Vì sao máy không thể ăn gian

Vấn đề của mọi trò chơi trực tuyến: máy chủ nhìn thấy tay bạn trước khi công bố tay của nó. Chỉ
cần đổi tay sau khi biết bạn ra gì là bạn thua mãi mãi, và không có cách nào phát hiện.

Cách chặn ở đây gồm ba bước:

1. **Máy chốt trước.** Khi bạn bắt đầu lượt, máy sinh một chuỗi bí mật `serverSeed` và đưa bạn
   ngay `SHA256(serverSeed)` — gọi là *mã niêm phong*. Từ mã niêm phong không suy ngược ra được
   hạt giống, nhưng một khi đã đưa thì máy không thể đổi hạt giống nữa: hạt giống khác sẽ cho mã
   niêm phong khác, và bạn đang giữ mã cũ trong tay.
2. **Bạn góp phần vào kết quả.** Bạn tự nhập `clientSeed` (hoặc để máy sinh ngẫu nhiên). Tay của
   máy ở ván thứ `n` là `HMAC-SHA256(serverSeed, "clientSeed:n") mod 3`. Vì hạt giống của bạn
   tham gia vào công thức, máy không thể chọn sẵn một hạt giống cho ra chuỗi tay có lợi cho nó.
3. **Cuối lượt máy phải lật bài.** Khi lượt kết thúc — thắng, thua, chạm trần số ván, hay bạn bỏ
   lượt — máy công bố `serverSeed`. Bạn băm lại, so với mã niêm phong đã nhận từ đầu; rồi tính
   lại từng ván bằng đúng công thức trên và so với những gì đã ghi.

Máy chỉ có thể gian nếu tìm được một hạt giống khác cho ra cùng một mã SHA-256 — tức là phá được
SHA-256.

## Cách tự kiểm chứng

Hết lượt, bấm **"Tự kiểm chứng lượt này"**. Trang `/verify` sẽ:

- băm lại hạt giống của máy và so với mã niêm phong → phải hiện **KHỚP**;
- dựng lại tay của máy ở từng ván từ hai hạt giống và so với bản ghi.

Trang này chạy **hoàn toàn trong trình duyệt** — nó không hỏi máy chủ câu nào. Đó là điều khiến
kết luận của nó có giá trị: một trang kiểm chứng phải hỏi máy chủ thì chẳng chứng minh được gì.
Bạn có thể tự tính lại bằng bất cứ công cụ nào khác:

```bash
# mã niêm phong
printf '%s' "$SERVER_SEED" | sha256sum

# tay của máy ở ván 0 (0 = kéo, 1 = búa, 2 = bao)
printf '%s' "$CLIENT_SEED:0" | openssl dgst -sha256 -hmac "$SERVER_SEED"
# đọc 4 byte đầu của digest thành uint32 big-endian rồi mod 3
```

(Đúng ra còn một bước nhỏ: khối 4 byte nào lớn hơn hoặc bằng 4.294.967.295 sẽ bị bỏ qua để chuyển
sang khối tiếp theo, vì 2^32 không chia hết cho 3 nên `mod 3` trực tiếp sẽ lệch một chút. Xác suất
rơi vào trường hợp đó là 1 phần 4 tỉ. Chi tiết ở `src/lib/fairness/derive.ts`.)

Nếu lượt quá dài để nhét danh sách ván vào đường dẫn, trang chơi sẽ đưa bạn một khối dữ liệu để
dán tay vào ô "Danh sách ván" — và nói rõ rằng link ngắn kia mới chỉ kiểm được mã niêm phong.

Mỗi lượt còn có một **mã lượt** dạng `JKN-XXXX-XXXX`. Giữ mã đó lại nếu bạn muốn khiếu nại: người
vận hành tra `/admin/runs/<mã>` sẽ dựng lại toàn bộ lượt bằng chính hàm mà trình duyệt của bạn
dùng, kèm việc đối chiếu lại số ván thắng và trạng thái lượt với sổ ván.

## Chạy trên máy mình

Cần Node 22+ và Docker.

```bash
cp .env.example .env.local          # rồi đổi SESSION_SECRET, IP_HASH_SALT, ADMIN_TOKEN
docker compose up -d                # Postgres + Redis
npm install
npm run db:migrate
npm run dev                         # http://localhost:3000
```

`SESSION_SECRET`, `IP_HASH_SALT` và `ADMIN_TOKEN` không có giá trị mặc định — thiếu biến nào thì
ứng dụng dừng ngay lúc khởi động. Sinh giá trị bằng `openssl rand -hex 32`.

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `DATABASE_URL` | — | Bắt buộc |
| `REDIS_URL` | — | Không có thì rate limit rơi về bộ nhớ trong tiến trình |
| `TARGET_WINS` | 20 | Số ván thắng liên tiếp để thắng lượt |
| `MAX_ROUNDS_PER_RUN` | 300 | Trần số ván một lượt |
| `SENTRY_DSN` | — | Tuỳ chọn |
| `LOG_LEVEL` | `info` | |

## Kiểm thử

```bash
npm test              # vitest; test tích hợp tự dựng Postgres bằng testcontainers (cần Docker)
npm run typecheck
npm run test:e2e      # playwright, tự khởi động dev server
npm run audit:runs    # đối chiếu lại các lượt đã kết thúc, thoát khác 0 nếu có lượt lệch
```

`src/lib/fairness/__snapshots__/derive.test.ts.snap` là vector vàng cố định — **không bao giờ**
chạy vitest với `-u`. Snapshot đó hỏng nghĩa là công thức đã đổi, và mọi lượt trong lịch sử không
còn kiểm chứng được nữa.

## Triển khai

Xem [`docs/deploy-coolify.md`](docs/deploy-coolify.md). Thiết kế đầy đủ nằm ở
[`docs/superpowers/specs/`](docs/superpowers/specs/).
