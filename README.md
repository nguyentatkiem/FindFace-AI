# 📸 FindFace AI

*Tên sản phẩm: FindFace AI · tên giao diện tiếng Việt: "Ảnh khóa học"*

Học viên **quét QR → chụp một tấm selfie → nhận toàn bộ ảnh có mặt mình** trong kho ảnh
sự kiện (hàng vạn tấm, tìm trong ~2 giây) — cùng dòng công nghệ Kwikpic/Fotoowl:
InsightFace (ArcFace 512 chiều) + PostgreSQL/pgvector, tự vận hành, dữ liệu ở lại máy chủ.

**Tính năng chính**
- Học viên: selfie tìm ảnh (hoặc chọn ảnh có sẵn) · thư viện toàn album kiểu Google Photos
  (chip thư mục, lightbox, trình chiếu, chọn nhiều → zip) · album cá nhân link riêng, tự nạp
  ảnh mới + báo email · tìm theo mô tả tiếng Việt (CLIP) · PWA.
- Admin: sự kiện + thư mục ảnh, kéo-thả/đồng bộ thư mục/Google Drive/HEIC, QR + trang in A4,
  gửi link hàng loạt, nhân vật (gom cụm khuôn mặt), thống kê, watermark, nhiều tài khoản + nhật ký.
- Riêng tư (Nghị định 13/2023): selfie không lưu; vector mặt tự xóa theo hạn từng sự kiện;
  sự kiện đóng thư viện dùng chữ ký ảnh — ai chỉ xem được ảnh của chính mình.

**Chạy dev** (Postgres cần extension `pgvector`; xem `docs/tim-anh.md` để biết chi tiết):
```bash
pnpm install && pnpm --filter @anh/db generate && pnpm db:migrate
pnpm --filter @anh/dich-vu-khuon-mat cai-dat   # venv Python + InsightFace (lần đầu)
pnpm dev:khuon-mat   # dịch vụ nhận diện :8100
pnpm dev             # web học viên + quản trị :3002
pnpm dev:worker      # chỉ mục ảnh + album + email + gom cụm
```
Test: `pnpm test:all` · Lấy link công khai nhanh: `./deploy/len-cloudflare.sh` · Link cố định: `deploy/tunnel-co-dinh.sh`.

Tách từ monorepo Traphaco MarOS ngày 18/08/2026 (lịch sử phát triển nằm ở repo gốc).
