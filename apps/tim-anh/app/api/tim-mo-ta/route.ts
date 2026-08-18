import { NextRequest, NextResponse } from "next/server";
import { ghiNhanTanSuat, laySuKienTheoMa, prisma, timAnhTheoMoTa } from "@anh/db";
import { layIp } from "@/lib/dich-vu-khuon-mat";

const DICH_VU_URL = process.env.DICH_VU_KHUON_MAT_URL ?? "http://127.0.0.1:8100";

/** Tìm ảnh theo MÔ TẢ ("trao chứng chỉ", "cắt bánh") — cần dịch vụ Python bật CLIP=1. */
export async function GET(req: NextRequest) {
  const ip = layIp(req.headers);
  const { biChan } = await ghiNhanTanSuat(prisma, `tim-mo-ta:${ip}`, 60, 60 * 60_000);
  if (biChan) return NextResponse.json({ loi: "THU_QUA_NHIEU_LAN" }, { status: 429 });

  const ma = (req.nextUrl.searchParams.get("ma") ?? "").trim().toLowerCase();
  const cau = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (!ma || cau.length < 2) return NextResponse.json({ loi: "THIEU_DU_LIEU" }, { status: 422 });

  const suKien = await laySuKienTheoMa(prisma, ma);
  if (!suKien || suKien.trangThai !== "hoat_dong" || !suKien.choPhepXemTatCa) {
    return NextResponse.json({ loi: "KHONG_THAY_SU_KIEN" }, { status: 404 });
  }

  let vector: number[];
  try {
    const form = new FormData();
    form.append("cau", cau);
    const res = await fetch(`${DICH_VU_URL}/clip-van-ban`, { method: "POST", body: form });
    if (!res.ok) return NextResponse.json({ loi: "CLIP_CHUA_BAT" }, { status: 501 });
    vector = ((await res.json()) as { vector: number[] }).vector;
  } catch {
    return NextResponse.json({ loi: "DICH_VU_BAN" }, { status: 503 });
  }

  const anhs = await timAnhTheoMoTa(prisma, suKien.id, vector);
  return NextResponse.json({ anhs });
}
