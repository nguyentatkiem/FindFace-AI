import sharp from "sharp";

/**
 * Đóng mờ tên sự kiện chéo giữa ảnh (khi sự kiện bật watermark) — áp lúc PHÁT ảnh
 * (xem lớn + tải về), ảnh gốc trên đĩa giữ nguyên sạch.
 */
export async function apWatermark(nguon: Buffer | string, chu: string): Promise<Buffer> {
  const anh = sharp(nguon).rotate();
  const meta = await anh.metadata();
  const rong = meta.width ?? 1200;
  const cao = meta.height ?? 800;
  const coChu = Math.round(Math.max(24, rong / 18));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${rong}" height="${cao}">
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle"
      transform="rotate(-24 ${rong / 2} ${cao / 2})"
      font-family="Helvetica, Arial, sans-serif" font-size="${coChu}" font-weight="700"
      fill="rgba(255,255,255,0.4)" stroke="rgba(0,0,0,0.18)" stroke-width="1">${chu
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>
  </svg>`;
  return anh.composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 86 }).toBuffer();
}
