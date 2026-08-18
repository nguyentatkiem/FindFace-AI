import { NextRequest, NextResponse } from "next/server";

/**
 * CSP theo nonce cho mỗi request — cùng khuôn internal/portal (bảo mật vòng 4):
 * production chỉ script mang nonce mới chạy; dev nới cho HMR.
 * Khác hai app kia: img-src thêm blob: (xem trước selfie từ canvas) và media-src blob:
 * (thẻ <video> nhận MediaStream từ camera).
 */
export function middleware(req: NextRequest) {
  const dev = process.env.NODE_ENV !== "production";
  const nonce = btoa(crypto.randomUUID());
  const scriptSrc = dev
    ? "'self' 'unsafe-inline' 'unsafe-eval'"
    : `'self' 'nonce-${nonce}' 'strict-dynamic'`;

  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "frame-src 'none'",
  ].join("; ");

  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);

  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  // Bỏ qua cả /api: API không cần CSP nonce, và middleware ĐỆM body request —
  // lô ảnh upload >10MB sẽ bị cắt làm vỡ FormData (lỗi 500 khi nạp ảnh).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
