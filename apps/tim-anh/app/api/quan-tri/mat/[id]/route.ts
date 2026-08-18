import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { duongDanChuyenDoi, laTepHeic, prisma } from "@anh/db";
import { coPhienQuanTri } from "@/lib/quan-tri-auth";

/** Crop khuôn mặt đại diện cụm (admin) — cắt bbox + lề 40% từ ảnh gốc, trả 160px. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await coPhienQuanTri())) return new NextResponse(null, { status: 401 });
  const { id } = await ctx.params;
  const matId = Number(id);
  if (!Number.isInteger(matId)) return new NextResponse(null, { status: 404 });

  const mat = await prisma.khuonMat.findUnique({
    where: { id: matId },
    include: { anh: { select: { id: true, duongDan: true, tenTep: true } } },
  });
  if (!mat) return new NextResponse(null, { status: 404 });

  const [x1, y1, x2, y2] = mat.bbox as number[];
  const duong = laTepHeic(mat.anh.tenTep) ? duongDanChuyenDoi(mat.anh.id) : mat.anh.duongDan;
  try {
    const anh = sharp(duong).rotate();
    const meta = await anh.metadata();
    const rong = meta.width ?? 0;
    const cao = meta.height ?? 0;
    const leX = (x2! - x1!) * 0.4;
    const leY = (y2! - y1!) * 0.4;
    const left = Math.max(0, Math.round(x1! - leX));
    const top = Math.max(0, Math.round(y1! - leY));
    const buf = await anh
      .extract({
        left,
        top,
        width: Math.min(rong - left, Math.round(x2! - x1! + leX * 2)),
        height: Math.min(cao - top, Math.round(y2! - y1! + leY * 2)),
      })
      .resize(160, 160, { fit: "cover" })
      .jpeg({ quality: 80 })
      .toBuffer();
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
