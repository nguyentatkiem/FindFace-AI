#!/usr/bin/env bash
# Tunnel CỐ ĐỊNH cho app tìm ảnh (Cloudflare named tunnel) — link không đổi giữa các lần
# chạy, QR in giấy dùng mãi. KHÁC len-cloudflare.sh (link trycloudflare đổi mỗi lần).
#
# Cần MỘT LẦN chuẩn bị (tài khoản Cloudflare + tên miền đã trỏ về Cloudflare):
#   1) cloudflared tunnel login
#   2) cloudflared tunnel create maros-tim-anh
#   3) cloudflared tunnel route dns maros-tim-anh anh.ten-mien-cua-ban.vn
#   4) export TIM_ANH_TEN_MIEN=anh.ten-mien-cua-ban.vn   (hoặc ghi vào apps/tim-anh/.env)
# Sau đó chỉ cần chạy:  ./deploy/tunnel-co-dinh.sh
set -euo pipefail
cd "$(dirname "$0")/.."

can_co() { command -v "$1" >/dev/null || { echo "Thiếu $1 — cài rồi chạy lại (brew install $1)"; exit 1; }; }
can_co cloudflared

TEN_TUNNEL="${TIM_ANH_TEN_TUNNEL:-maros-tim-anh}"
TEN_MIEN="${TIM_ANH_TEN_MIEN:-}"

cloudflared tunnel list 2>/dev/null | grep -q "$TEN_TUNNEL" || {
  echo "Chưa có tunnel '$TEN_TUNNEL'. Làm 4 bước chuẩn bị ghi ở đầu file này rồi chạy lại."
  exit 1
}
[ -n "$TEN_MIEN" ] || { echo "Chưa đặt TIM_ANH_TEN_MIEN (vd anh.ten-mien.vn)"; exit 1; }

song() { curl -s -o /dev/null --max-time 2 "http://localhost:3002"; }
if ! song; then
  [ -f apps/tim-anh/.next/BUILD_ID ] || { echo "tim-anh chưa build — chạy: pnpm --filter @maros/tim-anh build"; exit 1; }
  (TIM_ANH_URL_GOC="https://$TEN_MIEN" pnpm --filter @maros/tim-anh start >/tmp/maros-tim-anh.log 2>&1 &)
  for i in $(seq 1 20); do song && break; sleep 1; done
  song || { echo "tim-anh (3002) không lên — xem /tmp/maros-tim-anh.log"; exit 1; }
fi
if ! curl -s -o /dev/null --max-time 2 http://127.0.0.1:8100/suc-khoe; then
  [ -x apps/dich-vu-khuon-mat/.venv/bin/uvicorn ] \
    && (cd apps/dich-vu-khuon-mat && ./.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8100 >/tmp/maros-khuon-mat.log 2>&1 &) \
    || echo "⚠ dich-vu-khuon-mat chưa cài venv — tìm ảnh sẽ báo bận."
fi

echo "══════════════════════════════════════════════════"
echo "  TÌM ẢNH (cố định): https://$TEN_MIEN"
echo "══════════════════════════════════════════════════"
echo "Giữ cửa sổ này mở. Ctrl+C để tắt."
exec cloudflared tunnel run --url http://localhost:3002 "$TEN_TUNNEL"
