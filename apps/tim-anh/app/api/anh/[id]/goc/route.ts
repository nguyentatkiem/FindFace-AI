import { NextRequest, NextResponse } from "next/server";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { duongDanChuyenDoi, ghiLuotTai, laTepHeic, layAnhTheoMaSuKien, laySuKienTheoMa, prisma } from "@anh/db";
import { apWatermark } from "@/lib/watermark";
import { dungChuKyAnh } from "@/lib/chu-ky-anh";
import { coPhienQuanTri } from "@/lib/quan-tri-auth";

const LOAI_THEO_DUOI: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/**
 * Ảnh gốc đầy đủ — stream từ đĩa (không nhồi RAM); ?tai=1 → tải về máy.
 * HEIC phát bản JPEG đã chuyển đổi; sự kiện bật watermark thì đóng mờ lúc phát.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const anhId = Number(id);
  const ma = (req.nextUrl.searchParams.get("ma") ?? "").trim().toLowerCase();
  if (!Number.isInteger(anhId) || !ma) return new NextResponse(null, { status: 404 });

  const anh = await layAnhTheoMaSuKien(prisma, anhId, ma);
  if (!anh) return new NextResponse(null, { status: 404 });
  const suKien = await laySuKienTheoMa(prisma, ma);
  // Sự kiện ĐÓNG thư viện: chỉ phát ảnh có chữ ký (từ kết quả selfie/album của chính chủ)
  // hoặc cho admin — chặn dò id tuần tự tải cả kho bằng mã in trên QR
  if (suKien && !suKien.choPhepXemTatCa) {
    const coQuyen = dungChuKyAnh(anhId, ma, req.nextUrl.searchParams.get("s")) || (await coPhienQuanTri());
    if (!coQuyen) return new NextResponse(null, { status: 403 });
  }

  // HEIC: trình duyệt không mở được — phát bản JPEG đã chuyển lúc chỉ mục
  let duongDan = anh.duongDan;
  let tenTep = anh.tenTep;
  if (laTepHeic(anh.tenTep)) {
    const jpeg = duongDanChuyenDoi(anh.id);
    if (existsSync(jpeg)) {
      duongDan = jpeg;
      tenTep = anh.tenTep.replace(/\.[^.]+$/, ".jpg");
    }
  }

  const taiVe = req.nextUrl.searchParams.get("tai") === "1";
  const headers = new Headers({ "Cache-Control": "private, max-age=3600" });
  if (taiVe) {
    headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(tenTep)}`);
    void ghiLuotTai(prisma, anh.suKienId, "goc", { anhId: anh.id }).catch(() => {});
  }

  if (suKien?.watermark) {
    try {
      const buf = await apWatermark(duongDan, suKien.ten);
      headers.set("Content-Type", "image/jpeg");
      return new NextResponse(new Uint8Array(buf), { headers });
    } catch {
      return new NextResponse(null, { status: 404 });
    }
  }

  let kichThuoc: number;
  try {
    kichThuoc = (await stat(duongDan)).size;
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  headers.set("Content-Type", LOAI_THEO_DUOI[path.extname(tenTep).toLowerCase()] ?? "application/octet-stream");
  headers.set("Content-Length", String(kichThuoc));
  const stream = Readable.toWeb(createReadStream(duongDan)) as ReadableStream;
  return new NextResponse(stream, { headers });
}
