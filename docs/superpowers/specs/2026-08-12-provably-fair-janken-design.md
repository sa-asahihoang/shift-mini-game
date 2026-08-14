# Thiết kế: Game kéo búa bao có chứng minh công bằng

Ngày: 2026-08-12
Trạng thái: đã duyệt, chờ lập kế hoạch triển khai

## 1. Bối cảnh và mục tiêu

Xây một game kéo búa bao lấy cảm hứng từ Maezawa Janken: người chơi phải thắng 20 ván liên tiếp
để nhận thưởng.

Vấn đề cốt lõi cần giải: khi người chơi click, kết quả hiện ra gần như tức thì, nên người chơi có
cơ sở để nghi ngờ rằng server đã nhìn thấy tay của họ rồi mới chọn tay của mình — đặc biệt ở
những ván gần chạm mốc thưởng. Thiết kế này phải khiến sự nghi ngờ đó **không còn khả thi về mặt
toán học**, đồng thời khiến điều đó **hiển nhiên với người chơi bình thường**.

Mục tiêu phụ: mọi ván đấu đã diễn ra phải tra cứu và dựng lại được, để xử lý khiếu nại bằng bằng
chứng thay vì bằng lời.

## 2. Các quyết định đã chốt

| Hạng mục | Quyết định |
|---|---|
| Mô hình chơi | Bất đồng bộ — mỗi người vào chơi lúc nào tuỳ ý, không chờ ai |
| Điều kiện thưởng | Thắng 20 ván liên tiếp |
| Luật hòa | Hòa thì đánh lại, không tính vào chuỗi, không làm mất chuỗi |
| Xác suất | Công bằng tuyệt đối 1/3 mỗi tay; xác suất hoàn thành một lượt = 1/2²⁰ ≈ 1 phần 1.048.576 |
| Định danh | MVP hoàn toàn ẩn danh; đăng nhập bổ sung ở v2, chừa sẵn chỗ nối |
| Quy mô | Thiết kế để scale ngang; tham số game cấu hình qua biến môi trường |
| Hạ tầng | Tự host qua Coolify: Next.js standalone + Postgres + Redis, chạy container |
| Cơ chế công bằng | Seed-pair cam kết cho cả lượt (phương án B bên dưới) |

### Rủi ro đã biết về mặt sản phẩm

Con số 20 ván được Maezawa hiệu chỉnh cho một sự kiện **đồng bộ** có hàng triệu người: một triệu
người vào, mỗi vòng loại một nửa, sau 20 vòng còn đúng một người thắng.

Ở mô hình bất đồng bộ, cùng con số đó nghĩa là cần khoảng một triệu **lượt chơi** để có một người
trúng. Nếu lượng người chơi thực tế nhỏ hơn nhiều thì sẽ không ai trúng, và game chết vì cảm giác
bất khả thi.

Đã trao đổi và chấp nhận giữ nguyên 20 ván. Cách bù trừ khi cần — thưởng theo mốc 5/10/15/20 —
được thiết kế sẵn dưới dạng cấu hình nhưng **không nằm trong MVP**.

## 3. Cơ chế công bằng

### Phương án đã chọn: seed-pair cam kết cho cả lượt

Bắt đầu một lượt chơi, server sinh một `serverSeed` ngẫu nhiên 32 byte và công bố ngay
`commitment = SHA256(serverSeed)`. Người chơi cung cấp `clientSeed` (tự nhập hoặc để hệ thống sinh),
và giá trị này bị khoá cứng từ thời điểm đó.

Tay của server ở ván thứ `n`:

```
digest = HMAC-SHA256(key = serverSeed, message = `${clientSeed}:${n}`)
hand   = rejectionSample(digest) mod 3
```

Khi lượt kết thúc — thua, thắng đủ 20, hoặc người chơi tự bỏ — server tiết lộ `serverSeed`. Người
chơi băm lại và đối chiếu với `commitment` đã nhận từ đầu, rồi tính lại toàn bộ tay của server.

### Vì sao phương án này mạnh hơn commit–reveal từng ván

Vì `clientSeed` bị khoá ngay từ ván đầu, **cả chuỗi tay của server đã được định đoạt trước khi
người chơi click lần đầu tiên**. Server không chỉ "không đổi tay sau khi thấy tay bạn" — nó về mặt
toán học không thể phản ứng theo người chơi ở bất kỳ ván nào trong lượt. Đồng thời chỉ tốn một
lượt gọi API mỗi ván thay vì hai.

Đánh đổi: phải chờ hết lượt mới kiểm chứng được. Chấp nhận được, vì cam kết đã nằm trong tay người
chơi từ đầu nên vẫn ràng buộc, và một lượt trung bình chỉ kéo dài 2 ván.

### Các phương án đã cân nhắc và loại

**Commit–reveal từng ván.** Seed mới mỗi ván, kiểm chứng được ngay sau mỗi click. Loại vì tốn gấp
đôi lượt gọi API và độ trễ, trong khi cam kết lại yếu hơn — server biết tay người chơi ở ván trước
khi chọn seed cho ván sau.

**Nguồn ngẫu nhiên công khai (drand / blockchain beacon).** Loại vì mỗi ván phải chờ beacon 3–30
giây (20 ván thành lê thê), thêm phụ thuộc ngoài có thể sập, và mọi người chơi trong cùng khung
beacon nhận cùng một tay server — mở hai tài khoản lệch vài giây là dò ra. Vá lỗ hổng đó đòi hỏi
thêm seed riêng có cam kết cho từng người, tức là quay về đúng phương án đã chọn.

### Loại bỏ lệch modulo

Lấy `uint32 mod 3` trực tiếp gây lệch xác suất, vì 2³² không chia hết cho 3. Sai lệch chỉ cỡ
2×10⁻¹⁰ nên vô nghĩa trên thực tế, nhưng cả dự án dựng lên để *chứng minh* sự công bằng, nên không
để hở điểm cho người khác bắt bẻ.

Digest HMAC có 32 byte. Đọc từng khối 4 byte, bỏ qua khối rơi vào vùng dư, lấy khối tiếp theo:

```
LIMIT = floor(2^32 / 3) * 3        // = 4_294_967_295

for i in 0, 4, 8, ... 28:
    v = digest.readUInt32BE(i)
    if v < LIMIT: return v mod 3

// cả 8 khối đều bị loại: xác suất (1/2^32)^8, thực tế không xảy ra.
// vẫn phải xử lý tất định để hàm luôn thuần: băm lại digest rồi lặp.
return deriveFromDigest(SHA256(digest))
```

Xác suất loại mỗi khối là 1/2³². Phân phối kết quả đều tuyệt đối, chi phí gần như bằng không.

### Mã hoá tay và phân định

`0 = kéo`, `1 = búa`, `2 = bao`.

```
(player - server + 3) mod 3  →  0 hòa, 1 người chơi thắng, 2 người chơi thua
```

## 4. Kiến trúc

Next.js (App Router, TypeScript) build `output: 'standalone'`, đóng gói Docker, deploy qua Coolify.
Postgres và Redis chạy container. Mọi route handler **stateless** — toàn bộ state nằm ở Postgres,
nên scale ngang chỉ là tăng số replica.

Redis dùng đúng một việc: rate limit. Không giữ state game. Mất Redis thì game vẫn chạy, chỉ mất
lớp chắn bot.

### Phân tầng

| Tầng | Trách nhiệm | Phụ thuộc |
|---|---|---|
| `lib/fairness` | Sinh seed, tạo commitment, suy ra tay server, kiểm chứng một lượt | Chỉ `node:crypto` |
| `lib/game` | Luật chơi: phân định thắng/thua/hòa, máy trạng thái lượt chơi | Không |
| `lib/repo` | Đọc ghi Postgres | Postgres |
| `lib/services` | Điều phối, ranh giới transaction | `repo` + `game` + `fairness` |
| `app/api/**` | Route handler mỏng: xác thực → gọi service → trả kết quả | `services` |

Hai tầng đầu là hàm thuần, không chạm DB, không chạm HTTP. Chúng test được rất sâu mà chạy trong
mili-giây, và quan trọng hơn: `lib/fairness` dùng chung được cho cả server lẫn trang kiểm chứng
phía trình duyệt — người chơi kiểm tra bằng đúng đoạn code server đã dùng.

### Cấu trúc thư mục

```
lib/fairness/     seed.ts · derive.ts · verify.ts
lib/game/         hands.ts · run-state.ts
lib/repo/         players.ts · runs.ts · rounds.ts · audit.ts
lib/services/     start-run.ts · play-round.ts · abandon-run.ts
lib/observability/ logger.ts · tracing.ts · errors.ts
lib/config/       game.ts
app/api/runs/route.ts
app/api/runs/[id]/route.ts
app/api/runs/[id]/rounds/route.ts
app/(game)/page.tsx
app/verify/page.tsx
app/stats/page.tsx
app/admin/runs/[code]/page.tsx
```

### Luồng một lượt chơi

1. Mở trang → server cấp cookie session ẩn danh (httpOnly, có chữ ký HMAC) → `playerId`.
2. Người chơi bấm bắt đầu, có thể tự nhập `clientSeed` hoặc để hệ thống sinh ngẫu nhiên.
3. Server sinh `serverSeed` 32 byte, lưu DB, trả về `commitment`. UI hiển thị mã này nổi bật.
   `clientSeed` khoá cứng từ đây.
4. Mỗi ván, người chơi click một tay và gửi kèm `nonce`. Trong **một transaction có khoá dòng**,
   server: kiểm tra lượt còn `active` và `nonce` đúng thứ tự → tính tay server → phân định → ghi
   bản ghi ván → cập nhật lượt.
5. Hòa: `nonce` tăng, số thắng giữ nguyên. Thua: lượt kết thúc. Đủ 20 thắng: thắng lượt.
6. Khi lượt kết thúc theo bất kỳ hướng nào, response trả kèm `serverSeed`.

Điểm then chốt ở bước 4: **ván được ghi nhận ngay tại thời điểm submit, trong cùng transaction**.
Người chơi không thể đóng tab để huỷ một ván thua — thua là thua, kể cả khi response chưa kịp về
tới trình duyệt.

Một lượt trung bình kéo dài 2 ván (thua ngay), và cần khoảng 30 ván để đạt 20 thắng do có hòa.
Đặt trần cứng 300 ván mỗi lượt: xác suất chạm trần thấp đến mức không đáng bàn, nhưng nó chặn được
vòng lặp vô hạn nếu có bug. Chạm trần thì đóng lượt với `status = 'abandoned'`, lộ seed như bình
thường, và ghi `audit_events` loại `run_capped` — nếu sự kiện này xuất hiện thật thì gần như chắc
chắn là bug chứ không phải người chơi xui.

## 5. Mô hình dữ liệu

```
players
  id            uuid  pk
  account_id    uuid  null unique     -- chỗ nối cho đăng nhập ở v2
  best_wins     int   default 0
  created_at    timestamptz

runs
  id            uuid  pk
  run_code      text  unique          -- mã ngắn người đọc được, vd JKN-7F3A-2B91
  player_id     uuid  fk
  server_seed   text                  -- không bao giờ lộ khi status = 'active'
  commitment    text                  -- sha256 hex, công bố ngay từ đầu
  client_seed   text
  status        enum('active','won','lost','abandoned')
  wins          int   default 0
  next_nonce    int   default 0
  target_wins   int                   -- chụp lại config tại thời điểm tạo
  ip_hash       text                  -- HMAC(ip, salt), không lưu IP thô
  user_agent    text
  created_at, ended_at

rounds
  run_id        uuid  fk    ┐
  nonce         int         ┘ primary key kép
  player_hand   smallint
  server_hand   smallint
  outcome       enum('win','lose','draw')
  request_id    text                  -- nối sang log vận hành
  server_ts     timestamptz
  latency_ms    int

audit_events                          -- chỉ ghi thêm
  id            uuid pk
  player_id     uuid fk
  run_id        uuid fk null
  type          text                  -- run_started | seed_revealed | rate_limited |
                                      -- replay_rejected | nonce_mismatch | run_abandoned |
                                      -- run_capped
  payload       jsonb
  request_id    text
  created_at    timestamptz
```

Chỉ `runs` là bảng có thể sửa. `players.best_wins` cập nhật khi một lượt kết thúc.

**Khoá chính kép `(run_id, nonce)`** là tuyến phòng thủ chống replay ở tầng thấp nhất. Nếu hai
request cùng `nonce` lọt qua row lock vì lý do gì đó, Postgres vẫn chặn bằng unique violation. Bảo
vệ không phụ thuộc vào việc code ứng dụng đúng.

**`rounds` chỉ ghi thêm, không sửa không xoá.** Đây là sổ cái đối chiếu — bất cứ lúc nào cũng dựng
lại được toàn bộ lịch sử một lượt từ hai seed và so với những gì đã ghi.

**`target_wins` chụp vào từng lượt** thay vì đọc config lúc chạy, để sau này đổi tham số cho chiến
dịch khác mà các lượt đang chạy và lịch sử cũ vẫn tự nhất quán.

**`run_code`** là thứ người chơi đọc được và dán vào khi khiếu nại. Không có nó thì phải mò theo
thời gian và IP. Sinh từ số ngẫu nhiên, mã hoá Base32 Crockford (bỏ ký tự dễ nhầm), có unique
index.

Index cần thiết: `runs(player_id, created_at desc)`, `runs(status)` cho job đối chiếu,
`audit_events(run_id)`, `audit_events(player_id, created_at desc)`.

### Cấu hình

`lib/config/game.ts`, đọc từ biến môi trường với giá trị mặc định:

```
targetWins        = 20
maxRoundsPerRun   = 300
drawRule          = 'replay'
attemptsPerDay    = 0        // 0 = không giới hạn
```

## 6. API

```
POST /api/runs
  body     { clientSeed?: string }
  200      { runId, runCode, commitment, clientSeed, targetWins, wins, nextNonce }
  ghi chú  đang có lượt active thì trả lại lượt đó, không tạo mới

POST /api/runs/:id/rounds
  body     { hand: 0|1|2, nonce: number }
  200      { nonce, serverHand, outcome, wins, status, serverSeed? }
  409      nonce sai thứ tự, hoặc gửi lại nonce cũ với tay khác
  429      vượt rate limit
  ghi chú  serverSeed chỉ có mặt khi status khác 'active'

GET  /api/runs/:id
  200      trạng thái hiện tại, để khôi phục sau khi reload

POST /api/runs/:id/abandon
  200      { status: 'abandoned', serverSeed }
```

Trang `/verify` **không gọi API nào**. Nó import thẳng `lib/fairness` và tính toán trong trình
duyệt. Người chơi dán `serverSeed`, `clientSeed`, `commitment` vào là tự dựng lại toàn bộ tay của
server. Nếu trang kiểm chứng phải hỏi server thì nó chẳng chứng minh được gì.

## 7. Quan sát, đối chiếu và xử lý khiếu nại

### Tách bạch hai thứ hay bị gộp

**Sổ cái đối chiếu** nằm trong Postgres, ghi cùng transaction với hành động game, không sửa, không
xoá, không lấy mẫu. Đây là thứ trả lời câu "người này khiếu nại, thực tế đã xảy ra gì".

**Nhật ký vận hành** là JSON đẩy ra stdout, để debug và cảnh báo. Nó bị xoay vòng, bị lấy mẫu, có
thể mất khi container chết.

Không bao giờ dùng loại thứ hai để xử khiếu nại. Log bị rotate sau 7–30 ngày, mà khiếu nại thì hay
đến muộn. Hai loại chia sẻ chung khoá tương quan để nhảy qua lại được, nhưng chỉ Postgres là nguồn
sự thật.

### Nhật ký vận hành

Pino, JSON một dòng ra stdout — Docker gom, Coolify chuyển tiếp. Mỗi request được gán `requestId`
(nhận từ header `x-request-id` nếu có, không thì tự sinh) và truyền xuống qua `AsyncLocalStorage`,
nên mọi dòng log trong cùng một request tự mang đủ `requestId`, `playerId`, `runId`, `nonce` mà
không phải truyền tay. Đúng bốn khoá này cũng là cột trong DB, nên nhìn thấy một dòng log là truy
ngược ra được bản ghi và ngược lại.

**Quy tắc tuyệt đối: `serverSeed` không bao giờ được xuất hiện trong log khi lượt còn `active`.**
Đây là lỗ hổng thật — người có quyền đọc log sẽ đoán trước được kết quả. Khai báo danh sách redact
ở cấp logger để nó không lọt ra kể cả khi ai đó vô ý log nguyên object.

### Tại sao `audit_events` tồn tại

Những request **bị từ chối không để lại dấu vết trong `rounds`**, mà đó lại chính là lúc người chơi
hay kêu: "tôi bấm mà không ăn", "tôi bị chặn". Nên mọi lần từ chối — rate limit, replay, nonce sai
— đều phải ghi vào bảng này.

### Tích hợp công cụ

Gói toàn bộ sau module mỏng `lib/observability` — không rải `Sentry.captureException` khắp
codebase, để đổi nhà cung cấp chỉ sửa một chỗ.

- **OpenTelemetry** qua `instrumentation.ts` của Next.js làm giao diện chuẩn cho trace.
- **Sentry** cho lỗi và trace, gắn tag `runId` / `playerId` / `runCode` vào mọi sự kiện.
- **Loki + Grafana** dựng bằng container trên chính Coolify, gom stdout.

### Cơ chế tự đối chiếu

Vì mọi lượt chơi đều dựng lại được từ seed, hệ thống tự kiểm toán chính nó được.

Một job chạy hằng đêm quét toàn bộ lượt đã kết thúc, tính lại tay server cho từng ván bằng
`lib/fairness`, so với `server_hand` đã ghi trong `rounds`. Lệch một ván là cảnh báo ngay. Nó thuần
CPU, gần như không tốn gì, và nghĩa là **phát hiện bug trước khi người chơi phát hiện**.

Kèm theo là trang quản trị `GET /admin/runs/:code` dựng lại toàn cảnh một lượt: commitment, seed,
từng ván với tay người chơi, tay server đã lưu, tay server tính lại, và cờ khớp/lệch. Nhận khiếu
nại → dán mã → có câu trả lời trong mười giây, kèm bằng chứng người chơi tự kiểm tra lại được.
Bảo vệ bằng token quản trị đặt trong biến môi trường.

### Chỉ số theo dõi

Tỉ lệ thắng quan sát được trên các ván có phân định phải hội tụ về **50%**. Đây vừa là tín hiệu vận
hành — lệch là có bug ở khâu suy ra tay server — vừa là công cụ tạo niềm tin: trang thống kê công
khai kiểu *"48.732.104 ván đã chơi · tỉ lệ thắng 49,98%"* thuyết phục người bình thường mạnh hơn
mọi giải thích về HMAC.

Theo dõi kèm phân bố độ dài chuỗi thắng, so với đường lý thuyết `1/2ⁿ`.

## 8. Chống gian lận phía người chơi

| Hướng tấn công | Cách chặn |
|---|---|
| Bỏ ván thua bằng cách đóng tab | Ván ghi trong cùng transaction lúc submit |
| Chơi lại một ván bằng nonce cũ | Kiểm tra `nonce === next_nonce` + khoá dòng + khoá chính kép |
| Đoán seed | 32 byte ngẫu nhiên, không khả thi |
| Tái dùng seed giữa các lượt | Cấm tuyệt đối, có test riêng — lượt trước đã lộ seed |
| Sửa response phía client | Vô hại, server là nguồn sự thật, UI chỉ hiển thị |
| Bot và nhiều tài khoản | Rate limit theo IP và theo player — **chỉ làm chậm, không chặn được** |

### Giới hạn phải chấp nhận

Với session ẩn danh, xoá cookie là thành người mới. Bot không bẻ được kết quả — nó chỉ *mua thêm
lượt*, mà với xác suất một phần triệu thì mua đủ nhiều là trúng.

**Kết luận: không bật phần thưởng có giá trị thật khi còn ẩn danh 100%.** MVP để chơi và đo. Phần
thưởng bật cùng lúc với đăng nhập ở v2. Cột `account_id` chờ sẵn cho việc đó.

## 9. Xử lý lỗi

### Phân biệt retry chính đáng với replay gian lận

Mạng rớt sau khi server đã ghi ván nhưng response chưa về. Client không biết kết quả và gửi lại.
Request retry này **trông giống hệt** một cú replay gian lận: cùng `runId`, cùng `nonce`.

Phân biệt bằng tay đã đánh:

- Cùng nonce, **cùng** tay → là retry. Trả về kết quả đã ghi, không tạo ván mới. Idempotent.
- Cùng nonce, **khác** tay → là đổi tay sau khi biết kết quả. Trả 409, ghi `audit_events`.

Không có bước này thì người chơi mạng yếu sẽ mất ván oan và khiếu nại — mà lần đó họ khiếu nại
đúng.

### Các trường hợp khác

- **Mất kết nối giữa chừng**: `GET /api/runs/:id` khôi phục, UI chơi tiếp từ `next_nonce`.
- **Một lượt active tại một thời điểm**: gọi tạo lượt khi đang dở thì trả lại lượt đang chạy.
- **Bỏ lượt**: ghi `abandoned` và lộ seed luôn để người chơi vẫn kiểm chứng được. Bỏ lượt không
  mang lại lợi thế nào (lượt mới có seed mới ngẫu nhiên) nên không sợ lạm dụng.
- **DB lỗi giữa transaction**: rollback, ván không được ghi, client retry cùng nonce → an toàn nhờ
  idempotency ở trên.
- **Đổi config giữa chừng**: `target_wins` đã chụp vào lượt nên không ảnh hưởng.

## 10. Phạm vi MVP

**Làm:** session ẩn danh · vòng chơi 20 thắng hòa-đánh-lại · seed-pair cam kết · trang `/verify`
chạy hoàn toàn trên trình duyệt · `rounds` + `audit_events` + `run_code` · log có cấu trúc + móc
nối OTel · job tự đối chiếu hằng đêm · trang quản trị tra theo mã · trang thống kê công khai ·
toàn bộ tham số qua biến môi trường.

**Chưa làm:** đăng nhập (chỉ chừa cột `account_id`) · trao thưởng và kho quà · bảng xếp hạng công
khai, vì ẩn danh thì nó vô nghĩa — chỉ lưu `best_wins` · mốc thưởng 5/10/15 · chia sẻ nhận thêm
lượt · hiệu ứng và âm thanh cầu kỳ.

## 11. Chiến lược test

Tầng `lib/fairness` và `lib/game` là hàm thuần nên test được rất sâu mà chạy trong mili-giây — đây
chính là lý do tách chúng ra ngay từ đầu.

**Unit.** Vector cố định cho `deriveHand` (cùng input luôn ra cùng output); vòng tròn
commit → verify; bảng chân trị đủ 9 tổ hợp tay; máy trạng thái lượt chơi — hòa giữ nguyên số
thắng, thắng thì tăng, thua thì kết thúc, chạm `targetWins` thì thắng lượt.

**Thống kê.** 300 nghìn mẫu, kiểm định chi-square cho phân phối ba tay. Test này bắt được lỗi lệch
modulo nếu ai đó lỡ bỏ bước rejection sampling.

**Property-based** (fast-check). Mô phỏng 100 nghìn lượt: tỉ lệ thắng trên ván có phân định phải
nằm trong [49,5%; 50,5%]; phân bố độ dài chuỗi khớp đường `1/2ⁿ`.

**Tích hợp** (Postgres thật qua Testcontainers). Nonce sai thứ tự trả 409 · retry cùng tay trả kết
quả cũ và không sinh ván mới · retry khác tay trả 409 kèm audit event · 20 request đồng thời cùng
nonce chỉ ghi đúng một ván · seed không lặp giữa các lượt.

**Một test không bao giờ được phép hỏng:** `serverSeed` không xuất hiện trong bất kỳ response nào
khi lượt còn `active`. Kiểm bằng snapshot toàn bộ hình dạng response, không chỉ kiểm trường đó
vắng mặt — để một lần refactor vô ý không mở cửa hậu.

**E2E** (Playwright). Chơi trọn một lượt, copy seed sang `/verify`, xác nhận dựng lại đúng.
