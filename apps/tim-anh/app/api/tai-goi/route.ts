import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";
import archiver from "archiver";
import { existsSync } from "node:fs";
import { duongDanChuyenDoi, ghiLuotTai, ghiNhanTanSuat, laTepHeic, laySuKienTheoMa, prisma } from "@anh/db";
import { layIp } from "@/lib/dich-vu-khuon-mat";
import { dungChuKyAnh } from "@/lib/chu-ky-anh";
import { coPhienQuanTri } from "@/lib/quan-tri-auth";

/**
 * Tải cả gói zip các ảnh tìm thấy. Nhận form POST thường (ma + ids "1,2,3") để trình duyệt
 * tự tải xuống như một liên kết. Chỉ đóng gói ảnh THUỘC đúng sự kiện — id lạ bị lọc êm.
 * Zip mức store (không nén) vì JPEG đã nén sẵn — CPU nhẹ, stream chảy ngay.
 */

const TOI_DA_ANH = 300;
const TOI_DA_MOI_GIO = 10; // gói zip / IP / giờ — mỗi gói có thể cả GB

export async function POST(req: NextRequest) {
  const ip = layIp(req.headers);
  const { biChan } = await ghiNhanTanSuat(prisma, `tai-goi:${ip}`, TOI_DA_MOI_GIO, 60 * 60_000);
  if (biChan) return NextResponse.json({ loi: "THU_QUA_NHIEU_LAN" }, { status: 429 });

  const form = await req.formData();
  const ma = String(form.get("ma") ?? "").trim().toLowerCase();
  const idsRaw = String(form.get("ids") ?? "").split(",");
  const sigsRaw = String(form.get("sigs") ?? "").split(",");
  let cap = idsRaw
    .map((v, i) => ({ id: Number(v.trim()), s: sigsRaw[i]?.trim() ?? null }))
    .filter((c) => Number.isInteger(c.id) && c.id > 0)
    .slice(0, TOI_DA_ANH);
  if (!ma || cap.length === 0) return NextResponse.json({ loi: "THIEU_DU_LIEU" }, { status: 422 });

  const suKien = await laySuKienTheoMa(prisma, ma);
  if (!suKien) return NextResponse.json({ loi: "KHONG_THAY_SU_KIEN" }, { status: 404 });
  // Sự kiện đóng thư viện: chỉ đóng gói ảnh có chữ ký hợp lệ (trừ admin)
  if (!suKien.choPhepXemTatCa && !(await coPhienQuanTri())) {
    cap = cap.filter((c) => dungChuKyAnh(c.id, ma, c.s));
    if (cap.length === 0) return NextResponse.json({ loi: "THIEU_CHU_KY" }, { status: 403 });
  }
  const ids = cap.map((c) => c.id);

  const anhs = await prisma.anhSuKien.findMany({
    where: { id: { in: ids }, suKienId: suKien.id },
    select: { id: true, tenTep: true, duongDan: true },
  });
  if (anhs.length === 0) return NextResponse.json({ loi: "KHONG_CO_ANH" }, { status: 404 });

  void ghiLuotTai(prisma, suKien.id, "zip", { soAnh: anhs.length }).catch(() => {});
  const goi = archiver("zip", { store: true });
  for (const anh of anhs) {
    // Tên trong zip thêm id phía trước — hai máy ảnh trùng tên tệp không đè nhau.
    // HEIC đóng gói bản JPEG đã chuyển (mở được mọi máy).
    if (laTepHeic(anh.tenTep) && existsSync(duongDanChuyenDoi(anh.id))) {
      goi.file(duongDanChuyenDoi(anh.id), { name: `${anh.id}-${anh.tenTep.replace(/\.[^.]+$/, ".jpg")}` });
    } else {
      goi.file(anh.duongDan, { name: `${anh.id}-${anh.tenTep}` });
    }
  }
  goi.on("error", (e) => console.error("[tai-goi] lỗi đóng gói:", e.message));
  void goi.finalize();

  return new NextResponse(Readable.toWeb(goi as unknown as Readable) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`anh-cua-toi-${ma}.zip`)}`,
      "Cache-Control": "no-store",
    },
  });
}
