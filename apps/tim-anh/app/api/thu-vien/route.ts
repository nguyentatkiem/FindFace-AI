import { NextRequest, NextResponse } from "next/server";
import { danhSachAnhThuVien, laySuKienTheoMa, prisma } from "@anh/db";

/**
 * Thư viện công khai của sự kiện (duyệt toàn bộ ảnh, không cần selfie) — chỉ khi
 * sự kiện bật choPhepXemTatCa. Phân trang con trỏ cho kho vạn ảnh.
 * tm: "" hoặc thiếu = tất cả · "0" = chưa phân thư mục · "<id>" = đúng thư mục.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const ma = (q.get("ma") ?? "").trim().toLowerCase();
  if (!ma) return NextResponse.json({ loi: "THIEU_MA" }, { status: 422 });

  const suKien = await laySuKienTheoMa(prisma, ma);
  if (!suKien || suKien.trangThai !== "hoat_dong") {
    return NextResponse.json({ loi: "KHONG_THAY_SU_KIEN" }, { status: 404 });
  }
  if (!suKien.choPhepXemTatCa) return NextResponse.json({ loi: "THU_VIEN_DONG" }, { status: 403 });

  const tmRaw = q.get("tm");
  const thuMucId = tmRaw === null || tmRaw === "" ? undefined : tmRaw === "0" ? null : Number(tmRaw);
  if (thuMucId !== undefined && thuMucId !== null && !Number.isInteger(thuMucId)) {
    return NextResponse.json({ loi: "THU_MUC_SAI" }, { status: 422 });
  }
  const sauId = q.get("sau") ? Number(q.get("sau")) : undefined;

  const kq = await danhSachAnhThuVien(prisma, suKien.id, { thuMucId, sauId, soLuong: 100 });
  return NextResponse.json({
    anhs: kq.anhs.map((a) => ({ id: a.id, tenTep: a.tenTep, rongPx: a.rongPx, caoPx: a.caoPx })),
    conNua: kq.conNua,
  });
}
