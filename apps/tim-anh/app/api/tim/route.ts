import { NextRequest, NextResponse } from "next/server";
import { NGUONG_TIM_ANH_MAC_DINH } from "@anh/core";
import { ghiNhanTanSuat, ghiLuotTim, laySuKienTheoMa, prisma, timAnhTheoVector } from "@anh/db";
import { chonMatChinh, layIp, layVectorAnh } from "@/lib/dich-vu-khuon-mat";
import { kyAnh } from "@/lib/chu-ky-anh";

/**
 * Học viên gửi 1–3 selfie → trả danh sách ảnh có mặt mình trong sự kiện.
 * Selfie chỉ xử lý trong RAM (chuyển tiếp sang dịch vụ model rồi bỏ) — KHÔNG ghi ra đĩa,
 * không lưu vector selfie: đúng cam kết trên màn đồng ý của học viên.
 */

const TOI_DA_MOI_GIO = 30; // lượt tìm / IP / giờ — đủ rộng cho cả lớp chung wifi vẫn có NAT riêng từng máy
const CUA_SO_MS = 60 * 60_000;
const SELFIE_TOI_DA_BYTE = 8 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const ip = layIp(req.headers);
  const { biChan } = await ghiNhanTanSuat(prisma, `tim-anh:${ip}`, TOI_DA_MOI_GIO, CUA_SO_MS);
  if (biChan) return NextResponse.json({ loi: "THU_QUA_NHIEU_LAN" }, { status: 429 });

  const form = await req.formData();
  const ma = String(form.get("ma") ?? "").trim().toLowerCase();
  const selfies = form.getAll("selfie").filter((s): s is File => s instanceof File);
  if (!ma || selfies.length === 0 || selfies.length > 3) {
    return NextResponse.json({ loi: "THIEU_DU_LIEU" }, { status: 422 });
  }
  for (const s of selfies) {
    if (s.size > SELFIE_TOI_DA_BYTE) return NextResponse.json({ loi: "ANH_QUA_LON" }, { status: 413 });
  }

  const suKien = await laySuKienTheoMa(prisma, ma);
  if (!suKien || suKien.trangThai !== "hoat_dong") {
    return NextResponse.json({ loi: "KHONG_THAY_SU_KIEN" }, { status: 404 });
  }
  if (suKien.daXoaMat) return NextResponse.json({ loi: "SU_KIEN_HET_HAN" }, { status: 410 });

  // Mỗi selfie lấy MỘT mặt chính (mặt to nhất) — selfie đông người không kéo cả nhóm vào kết quả
  const vectors: number[][] = [];
  try {
    for (const s of selfies) {
      const mat = chonMatChinh(await layVectorAnh(s, s.name));
      if (mat) vectors.push(mat.vector);
    }
  } catch {
    return NextResponse.json({ loi: "DICH_VU_BAN" }, { status: 503 });
  }
  if (vectors.length === 0) return NextResponse.json({ loi: "KHONG_THAY_MAT" }, { status: 422 });

  const nguong = Number(process.env.TIM_ANH_NGUONG) || NGUONG_TIM_ANH_MAC_DINH;
  const kq = await timAnhTheoVector(prisma, suKien.id, vectors, { nguong });
  await ghiLuotTim(prisma, suKien.id, vectors.length, kq.length);

  return NextResponse.json({
    anhs: kq.map((k) => ({
      id: k.anhId,
      diem: Math.round(k.diem * 1000) / 1000,
      tenTep: k.tenTep,
      rongPx: k.rongPx,
      caoPx: k.caoPx,
      s: kyAnh(k.anhId, ma), // chữ ký mở ảnh khi sự kiện đóng thư viện
    })),
  });
}
