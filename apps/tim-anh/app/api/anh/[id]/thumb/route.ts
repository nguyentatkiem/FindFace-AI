import { NextRequest, NextResponse } from "next/server";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { duongDanChuyenDoi, duongDanThumb, duongDanThumb1600, laTepHeic, layAnhTheoMaSuKien, laySuKienTheoMa, prisma } from "@anh/db";
import { existsSync } from "node:fs";
import { apWatermark } from "@/lib/watermark";
import { dungChuKyAnh } from "@/lib/chu-ky-anh";
import { coPhienQuanTri } from "@/lib/quan-tri-auth";

/**
 * Ảnh thu nhỏ cho lưới (520px — worker sinh sẵn) và lightbox (k=1600 — sinh lười lần
 * xem đầu rồi cache ra đĩa). Chỉ phát khi ảnh thuộc đúng sự kiện của mã đưa lên.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const anhId = Number(id);
  const ma = (req.nextUrl.searchParams.get("ma") ?? "").trim().toLowerCase();
  if (!Number.isInteger(anhId) || !ma) return new NextResponse(null, { status: 404 });

  const anh = await layAnhTheoMaSuKien(prisma, anhId, ma);
  if (!anh) return new NextResponse(null, { status: 404 });
  const suKienKiem = await laySuKienTheoMa(prisma, ma);
  // Cùng luật với route goc: sự kiện đóng thư viện đòi chữ ký ảnh hoặc phiên admin
  if (suKienKiem && !suKienKiem.choPhepXemTatCa) {
    const coQuyen = dungChuKyAnh(anhId, ma, req.nextUrl.searchParams.get("s")) || (await coPhienQuanTri());
    if (!coQuyen) return new NextResponse(null, { status: 403 });
  }

  const coLon = req.nextUrl.searchParams.get("k") === "1600";
  const duongDan = coLon ? duongDanThumb1600(anhId) : duongDanThumb(anhId);

  let buf: Buffer;
  try {
    buf = await readFile(duongDan);
  } catch {
    if (!coLon) return new NextResponse(null, { status: 404 });
    // bản 1600 chưa có → sinh từ ảnh gốc rồi cache (HEIC dùng bản JPEG đã chuyển)
    let nguon = anh.duongDan;
    if (laTepHeic(anh.tenTep) && existsSync(duongDanChuyenDoi(anhId))) nguon = duongDanChuyenDoi(anhId);
    try {
      buf = await sharp(nguon)
        .rotate()
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();
      await mkdir(path.dirname(duongDan), { recursive: true });
      await writeFile(duongDan, new Uint8Array(buf));
    } catch {
      return new NextResponse(null, { status: 404 });
    }
  }

  // Sự kiện bật watermark → đóng mờ bản xem lớn (lưới 520 giữ sạch cho nhẹ)
  if (coLon) {
    const suKien = await laySuKienTheoMa(prisma, ma);
    if (suKien?.watermark) buf = await apWatermark(buf, suKien.ten);
  }

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "image/jpeg",
      // private: link có mã sự kiện — không để CDN/proxy chung cache
      "Cache-Control": "private, max-age=3600",
    },
  });
}
