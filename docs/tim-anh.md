# Tìm ảnh khóa học bằng khuôn mặt — sổ tay vận hành

Học viên quét QR, chụp selfie, nhận về toàn bộ ảnh có mặt mình trong kho ảnh sự kiện
(hàng vạn tấm vẫn tìm trong ~2 giây). Cùng dòng công nghệ các dịch vụ thương mại
(Kwikpic, Fotoowl): ArcFace embedding 512 chiều + tìm hàng xóm gần nhất.

## Kiến trúc

```
Học viên (điện thoại, không cần cài app)          Admin (ban tổ chức)
        │  /s/<mã sự kiện>                                │  /quan-tri
        ▼                                                 ▼
┌─────────────────── apps/tim-anh (Next.js :3002) ───────────────────┐
│ selfie → /api/tim → vector → so khớp pgvector → lưới ảnh/zip       │
│ upload kéo-thả · đồng bộ thư mục · QR · tiến độ · nút riêng tư     │
└──────────┬───────────────────────────────┬─────────────────────────┘
           │ HTTP :8100                    │ Postgres (maros)
           ▼                               ▼
┌──────────────────────────┐   ┌──────────────────────────────────────┐
│ apps/dich-vu-khuon-mat   │   │ SuKienAnh · AnhSuKien · KhuonMat     │
│ Python FastAPI + ONNX    │   │ (embedding vector(512) + HNSW cosine) │
│ InsightFace buffalo_l    │   │ LuotTimAnh · GioiHanTanSuat           │
└──────────────────────────┘   └──────────────────────────────────────┘
           ▲
           │ gọi mỗi ảnh khi chỉ mục
┌──────────┴───────────────┐
│ apps/worker              │  job chi-muc-anh (mỗi phút): nhặt hàng chờ →
│                          │  vector + thumbnail 520px (sharp)
│                          │  job don-tim-anh (02:30): xóa vector quá hạn
└──────────────────────────┘
```

## Chạy dev (3 tiến trình)

```bash
pnpm dev:khuon-mat   # dịch vụ Python :8100 (lần đầu: pnpm --filter @maros/dich-vu-khuon-mat cai-dat)
pnpm dev:tim-anh     # web học viên + quản trị :3002
pnpm dev:worker      # worker theo lịch (hoặc chạy tay: pnpm --filter @maros/worker chay chi-muc-anh)
```

Yêu cầu một lần trên máy chủ: PostgreSQL có **pgvector** (máy dev đã cài từ nguồn cho
postgresql@16 Homebrew; server mới thì `apt install postgresql-16-pgvector` hoặc image
`pgvector/pgvector:pg16` — CI đã chuyển sang image này).

## Quy trình một khóa học

1. **Tạo sự kiện** ở `/quan-tri` (mật khẩu: env `TIM_ANH_MAT_KHAU_QUAN_TRI`, dev là
   `quan-tri-dev`): tên, ngày, hạn xóa dữ liệu mặt (mặc định 90 ngày). Mã sự kiện tự
   sinh dạng `ten-khoa-x1y2`.
2. **Nạp ảnh**: kéo-thả trên web (lô nhỏ) hoặc **đồng bộ thư mục** — trỏ đường dẫn tuyệt
   đối trên máy chủ, quét đệ quy jpg/png/webp, ảnh giữ nguyên chỗ, chạy lại không trùng.
   Ảnh chụp bổ sung hôm sau chỉ cần đồng bộ lại.
3. **Worker chỉ mục** tự chạy mỗi phút; trang chi tiết hiện tiến độ (đã chỉ mục/mặt/lỗi)
   — kho 50.000 ảnh trên CPU hết khoảng một đêm, chạy một lần duy nhất.
4. **Phát QR** in từ trang chi tiết (hoặc chiếu cuối buổi). Qua tunnel Cloudflare
   (`./deploy/len-cloudflare.sh`) thì QR tự mang link https công khai.
5. Học viên: quét QR → trang sự kiện (hero ảnh bìa) có HAI lối vào:
   - **Tìm ảnh của tôi** — đồng ý điều khoản → chụp 1–3 selfie (bắt buộc camera trực tiếp,
     không chọn từ thư viện) → lưới ảnh kèm % khớp;
   - **Xem toàn bộ thư viện** (`/s/<mã>/thu-vien`, tắt được từng sự kiện) — chip thư mục,
     lưới justified kiểu Google Photos, cuộn vô hạn.
   Cả hai màn: bấm ảnh mở lightbox (phím ‹ ›, nút tải), tích ✓ chọn nhiều tấm → tải gói zip.

### Thư mục & chia sẻ (admin)

- **Thư mục trong sự kiện** (Buổi sáng, Lễ trao…): tạo/xóa ở trang chi tiết; đồng bộ thư mục
  trên máy chủ thì **thư mục con cấp một tự thành thư mục ảnh**; upload web chọn được thư mục
  đích; lưới quản lý chọn lô ảnh → chuyển thư mục / xóa.
- **Panel chia sẻ**: QR + hai link rõ ràng (trang selfie · thư viện) kèm nút chép; công tắc
  mở/đóng thư viện công khai (đóng = học viên chỉ tìm được ảnh chính mình qua selfie).

### Bộ tính năng mở rộng (17/08/2026)

- **Album cá nhân** `/a/<token>`: sau lượt tìm, học viên bấm "Đồng ý, tạo album" (tùy chọn kèm
  email) → link cố định; ảnh chụp bổ sung TỰ nạp vào (worker sau mỗi đợt chỉ mục); có email thì
  job `bao-anh-moi` (10 phút/lần) gửi "bạn có thêm N ảnh". Vector chủ album xóa cùng hạn sinh
  trắc → album đóng băng, ảnh cũ vẫn xem.
- **Nhân vật (gom cụm)**: job `gom-cum` 03:00 (hoặc nút "Gom lại ngay") gom mặt thành "người"
  — admin thấy N người, mỗi người M ảnh, crop mặt tròn đại diện.
- **Tìm theo mô tả (CLIP)**: chạy dịch vụ Python với `CLIP=1` → ảnh mang vector CLIP; thư viện
  học viên có ô "trao chứng chỉ / chụp nhóm ngoài trời…" (đa ngữ, gõ tiếng Việt).
- **HEIC (iPhone)**: nhập thẳng — chuyển JPEG một lần lúc chỉ mục (pillow-heif), phát/tải bản JPEG.
- **Lọc ảnh hỏng**: mỗi ảnh đo độ nét (Laplacian) + độ sáng → cột `canhBaoChatLuong` cho admin lọc.
- **Ảnh liên thanh**: dHash 64-bit lưu sẵn (`laGanTrung` trong core) cho gom gần-trùng.
- **Nhiều tài khoản admin + nhật ký**: trang Tài khoản (chủ/phụ, scrypt) — có ≥1 tài khoản thì
  mật khẩu chung env tắt hẳn; trang Nhật ký ghi ai làm gì.
- **Thống kê**: biểu đồ SVG lượt tìm 14 ngày, % lượt có ảnh, top ảnh tải nhiều (bảng LuotTaiAnh).
- **Watermark**: bật/tắt từng sự kiện — đóng mờ tên sự kiện lên bản xem lớn + tải về, gốc giữ sạch.
- **In QR A4** `/quan-tri/<id>/in` + **gửi link hàng loạt** `/quan-tri/<id>/moi` (dán email từ Excel).
- **Google Drive**: dán link thư mục chia sẻ công khai (cần `GOOGLE_API_KEY`), tải tối đa 500 ảnh/lần.
- **PWA**: manifest + icon — học viên "Thêm vào màn hình chính".
- **Liveness** (`TIM_ANH_LIVENESS=1`): trước khi tìm phải quay nhẹ đầu trái-phải (5 khung hình,
  kiểm cùng người + biên độ yaw ≥ 12°) — chặn giơ ảnh tĩnh của người khác.
- **Tunnel cố định**: `./deploy/tunnel-co-dinh.sh` (Cloudflare named tunnel + tên miền riêng —
  QR in giấy dùng mãi; cần tài khoản Cloudflare, 4 bước chuẩn bị ghi đầu file).

### Chưa làm được vì cần tài khoản bên ngoài

Bán ảnh/thanh toán (cần merchant VietQR/Momo) · kho R2 (cần key Cloudflare R2) · gửi Zalo OA
(cần OA đã duyệt — email đã thay thế) · video highlight (thiết kế sẵn, chờ nhu cầu thật).

## Riêng tư — Nghị định 13/2023 (dữ liệu sinh trắc học)

- Màn **đồng ý bắt buộc** trước khi mở camera, ghi rõ 3 cam kết.
- **Selfie không lưu**: chỉ chuyển tiếp trong RAM sang dịch vụ model rồi bỏ.
- **Vector mặt tự xóa** sau `hanXoaNgay` (job `don-tim-anh` chạy đêm); ảnh gốc giữ nguyên.
  Trang chi tiết có nút **“Xóa dữ liệu mặt ngay”** khi cần dừng sớm (học viên yêu cầu).
- Ảnh chỉ phát khi **đúng mã sự kiện** (`layAnhTheoMaSuKien`); ai không có QR/mã không xem được.
- Rate-limit qua Postgres: 30 lượt tìm/giờ/IP, 10 gói zip/giờ/IP, 10 lần thử mật khẩu quản trị/giờ/IP.

## Tinh chỉnh chất lượng

| Việc | Chỗ chỉnh | Ghi chú |
|---|---|---|
| Ngưỡng nhận cùng người | env `TIM_ANH_NGUONG` (mặc định 0.38) | tăng → ít bắt nhầm, giảm → bắt đủ hơn; tinh chỉnh bằng ảnh khóa thật |
| Bắt mặt nhỏ trong ảnh toàn cảnh | env `DET_SIZE` của dịch vụ Python (mặc định 1280) | tăng chậm hơn nhưng bắt mặt nhỏ hơn |
| Ảnh nhỏ/selfie cận mặt | đã xử lý sẵn: đệm canvas thay vì phóng to | lỗi trượt phát hiện kinh điển của SCRFD |
| Nhiều selfie | học viên chụp tối đa 3 tấm, hệ gộp điểm cao nhất mỗi ảnh | tăng độ phủ với ảnh nghiêng/xa |

Ca khó còn lại (mọi hệ thương mại cùng chịu): mặt < ~40px trong ảnh toàn cảnh, khẩu trang,
ngược sáng gắt, quay lưng.

## Biến môi trường (apps/tim-anh/.env.example)

`PHIEN_BI_MAT` · `TIM_ANH_MAT_KHAU_QUAN_TRI` · `DICH_VU_KHUON_MAT_URL` ·
`TIM_ANH_THU_MUC` (gốc kho, mặc định `<repo>/du-lieu/tim-anh`) · `TIM_ANH_NGUONG` ·
`TIM_ANH_URL_GOC` (gốc URL in vào QR).

## Test

- `packages/core/src/tim-anh.ts` — gộp kết quả, mã sự kiện (6 test trong `core.test.ts`).
- `packages/db/test/tim-anh.service.test.ts` — 28 test tích hợp trên `maros_test`:
  vòng đời sự kiện/ảnh/hàng chờ, ghi-tìm vector pgvector với cosine biết trước, kiểm quyền
  phát ảnh, xóa dữ liệu hết hạn đúng mốc ngày, cascade.
