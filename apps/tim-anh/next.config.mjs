/** @type {import('next').NextConfig} */
// Content-Security-Policy đặt ở middleware.ts (nonce per-request); đây chỉ các header tĩnh.
// Khác internal/portal: camera=(self) — trang học viên phải mở camera để chụp selfie.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig = {
  transpilePackages: ["@anh/core", "@anh/db"],
  poweredByHeader: false,
  // archiver (zip stream) là CommonJS thuần Node — không cho bundler đóng gói vào route
  serverExternalPackages: ["archiver"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
