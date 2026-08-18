import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ảnh khóa học — tìm ảnh của bạn bằng một tấm selfie",
  description: "Học viên chụp một tấm selfie để tìm toàn bộ ảnh có mặt mình trong kho ảnh sự kiện",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 5 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <header className="thanh-tren">
          <a className="nhan-hieu" href="/">
            <span className="cham" aria-hidden />
            Ảnh <span>khóa học</span>
          </a>
          <div className="gian" />
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
