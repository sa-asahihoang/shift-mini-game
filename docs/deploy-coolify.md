# Triển khai lên Coolify

## Tài nguyên cần tạo

1. **Postgres 16** — tạo từ mục Databases của Coolify. Lấy connection string nội bộ.
2. **Redis 7** — tạo từ mục Databases. Chỉ dùng cho rate limit; mất Redis thì game vẫn chạy.
3. **Application** — nguồn là repo GitHub này, build bằng Dockerfile, cổng 3000.

## Biến môi trường

| Biến | Ghi chú |
|---|---|
| `DATABASE_URL` | Connection string nội bộ của Postgres |
| `REDIS_URL` | Connection string nội bộ của Redis |
| `SESSION_SECRET` | Sinh bằng `openssl rand -hex 32`. Đổi giá trị này là mọi session hiện có mất hiệu lực |
| `IP_HASH_SALT` | Sinh bằng `openssl rand -hex 32`. Không bao giờ đổi sau khi chạy thật, đổi là mất khả năng nhóm hành vi theo IP trong dữ liệu cũ |
| `ADMIN_TOKEN` | Token cho trang `/admin`. Sinh ngẫu nhiên |
| `TARGET_WINS` | Mặc định 20 |
| `MAX_ROUNDS_PER_RUN` | Mặc định 300 |
| `SENTRY_DSN` | Tuỳ chọn. Bỏ trống thì không bật báo lỗi |
| `LOG_LEVEL` | Mặc định `info` |

`SESSION_SECRET`, `IP_HASH_SALT`, và `ADMIN_TOKEN` không có giá trị mặc định trong mã nguồn —
thiếu biến nào thì ứng dụng báo lỗi ngay khi khởi động thay vì chạy với giá trị đoán được.

## Chạy migration

Đặt ở mục Pre-deployment Command của application:

```
node dist/scripts/migrate.js
```

Lệnh này chạy lại mỗi lần deploy, nên nó phải chạy được nhiều lần. Runner ghi tên file đã áp vào
bảng `_migrations` và bỏ qua chúng ở lần sau; mỗi file được áp trong một transaction riêng. Lần
deploy đầu tiên log ra danh sách file vừa áp, những lần sau log ra danh sách rỗng — đó là dấu hiệu
bình thường, không phải lỗi.

**Không dùng `npm run db:migrate`.** Script npm đó gọi `tsx`, mà `tsx` là devDependency —
image production cố ý không mang theo. `dist/scripts/migrate.js` là bản đã gộp sẵn bằng
esbuild lúc build image (`npm run build:scripts`), chạy thẳng bằng `node`, không cần `tsx`.
Script npm `db:migrate` vẫn giữ nguyên, chỉ dùng cho máy dev.

**Không dùng `npx drizzle-kit migrate`.** Index một-lượt-active (`drizzle/0001_partial_indexes.sql`)
được viết tay, không nằm trong `drizzle/meta/_journal.json`, nên drizzle-kit sẽ bỏ qua nó. Chạy
lệnh đó lên production sẽ dựng đủ bảng nhưng **thiếu đúng cái ràng buộc chặn một người chơi có hai
lượt cùng lúc** — và thiếu một cách im lặng, chỉ lộ ra khi có người khai thác.

## Job đối chiếu hằng đêm

Tạo Scheduled Task trong Coolify:

- Lịch: `0 3 * * *`
- Lệnh: `node dist/scripts/audit-runs.js`

Cùng lý do với migration: `npm run audit:runs` gọi `tsx`, không có trong image production.
Script npm đó vẫn giữ nguyên cho máy dev.

Job trả về mã thoát khác 0 khi phát hiện lượt không khớp — cấu hình cảnh báo của Coolify bám vào đó.
Job kiểm hai thứ khác nhau: từng ván có dựng lại được từ hạt giống không, và `runs.status`/`runs.wins`
có dựng lại được từ sổ ván không. Cái thứ hai mới là cái bắt được một con số tổng bị hỏng.

## Sau khi deploy

1. Mở `/stats`, xác nhận trang lên được và đang kết nối DB.
2. Chơi thử một lượt cho tới khi thua, bấm "Tự kiểm chứng lượt này", xác nhận mã niêm phong KHỚP.
3. Gọi `/admin/runs/<mã>` kèm header `x-admin-token`, xác nhận dựng lại đầy đủ.
4. Xác nhận log không chứa `serverSeed`: `docker logs <container> | grep -c serverSeed` phải trả về 0.
