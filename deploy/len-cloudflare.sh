#!/usr/bin/env bash
# Lấy link công khai nhanh (đổi mỗi lần chạy) qua Cloudflare quick tunnel.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v cloudflared >/dev/null || { echo "Thiếu cloudflared (brew install cloudflared)"; exit 1; }
pg_isready -q 2>/dev/null || { echo "PostgreSQL chưa chạy."; exit 1; }

song() { curl -s -o /dev/null --max-time 2 "http://localhost:3002"; }
if ! song; then
  [ -f apps/tim-anh/.next/BUILD_ID ] || { echo "Chưa build — chạy: pnpm build"; exit 1; }
  (pnpm --filter @anh/tim-anh start >/tmp/anh-web.log 2>&1 &)
  for i in $(seq 1 20); do song && break; sleep 1; done
  song || { echo "Web (3002) không lên — xem /tmp/anh-web.log"; exit 1; }
fi
if ! curl -s -o /dev/null --max-time 2 http://127.0.0.1:8100/suc-khoe; then
  [ -x apps/dich-vu-khuon-mat/.venv/bin/uvicorn ] \
    && (cd apps/dich-vu-khuon-mat && ./.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8100 >/tmp/anh-khuon-mat.log 2>&1 &) \
    || echo "⚠ Chưa cài venv dịch vụ nhận diện — tìm ảnh sẽ báo bận."
fi

rm -f /tmp/tunnel-3002.log
cloudflared tunnel --url http://localhost:3002 >/tmp/tunnel-3002.log 2>&1 &
T=$!
trap 'kill $T 2>/dev/null; echo; echo "Đã tắt link công khai (app vẫn chạy local)."' EXIT
layLink() { grep -o 'https://[a-z-]*\.trycloudflare\.com' /tmp/tunnel-3002.log 2>/dev/null | head -1; true; }
for i in $(seq 1 30); do L=$(layLink); [ -n "$L" ] && break; sleep 1; done
[ -n "${L:-}" ] || { echo "Không lấy được link — xem /tmp/tunnel-3002.log"; exit 1; }
echo "══════════════════════════════════════════"
echo "  ẢNH KHÓA HỌC: $L"
echo "══════════════════════════════════════════"
echo "Giữ cửa sổ này mở để link sống. Ctrl+C để tắt."
wait
