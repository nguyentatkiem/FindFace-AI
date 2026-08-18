import type { MetadataRoute } from "next";

/** PWA: học viên "Thêm vào màn hình chính" — mở album như app thật. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ảnh khóa học",
    short_name: "Ảnh khóa học",
    description: "Tìm ảnh của bạn trong kho ảnh sự kiện bằng một tấm selfie",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#007a3d",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
