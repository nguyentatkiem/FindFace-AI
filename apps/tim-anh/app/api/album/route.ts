import { NextRequest, NextResponse } from "next/server";
import { NGUONG_TIM_ANH_MAC_DINH } from "@anh/core";
import { ghiNhanTanSuat, laySuKienTheoMa, prisma, taoAlbumCaNhan, timAnhTheoVector } from "@anh/db";
import { chonMatChinh, layIp, layVectorAnh } from "@/lib/dich-vu-khuon-mat";

/**
 * Tạo ALBUM CÁ NHÂN từ selfie (bấm "Lưu album của tôi" sau khi tìm): lưu MỘT vector mặt
 * kèm sự đồng ý — để tự nạp ảnh chụp bổ sung + báo email. Selfie vẫn không lưu;
 * vector album xóa cùng hạn sinh trắc của sự kiện (album đóng băng, ảnh cũ vẫn xem).
 */
export async function POST(req: NextRequest) {
  const ip = layIp(req.headers);
  const { biChan } = await ghiNhanTanSuat(prisma, `tao-album:${ip}`, 10, 60 * 60_000);
  if (biChan) return NextResponse.json({ loi: "THU_QUA_NHIEU_LAN" }, { status: 429 });

  const form = await req.formData();
  const ma = String(form.get("ma") ?? "").trim().toLowerCase();
  const lienHe = String(form.get("lien_he") ?? "").trim() || null;
  const selfie = form.get("selfie");
  if (!ma || !(selfie instanceof File)) {
    return NextResponse.json({ loi: "THIEU_DU_LIEU" }, { status: 422 });
  }
  if (selfie.size > 8 * 1024 * 1024) {
    return NextResponse.json({ loi: "ANH_QUA_LON" }, { status: 413 }); // thống nhất mã lỗi với /api/tim
  }

  const suKien = await laySuKienTheoMa(prisma, ma);
  if (!suKien || suKien.trangThai !== "hoat_dong") return NextResponse.json({ loi: "KHONG_THAY_SU_KIEN" }, { status: 404 });
  if (suKien.daXoaMat) return NextResponse.json({ loi: "SU_KIEN_HET_HAN" }, { status: 410 });

  let mat;
  try {
    mat = chonMatChinh(await layVectorAnh(selfie, selfie.name));
  } catch {
    return NextResponse.json({ loi: "DICH_VU_BAN" }, { status: 503 });
  }
  if (!mat) return NextResponse.json({ loi: "KHONG_THAY_MAT" }, { status: 422 });

  const nguong = Number(process.env.TIM_ANH_NGUONG) || NGUONG_TIM_ANH_MAC_DINH;
  const kq = await timAnhTheoVector(prisma, suKien.id, [mat.vector], { nguong });
  try {
    const album = await taoAlbumCaNhan(prisma, suKien.id, mat.vector, kq, lienHe);
    return NextResponse.json({ token: album.token, soAnh: kq.length });
  } catch (e) {
    return NextResponse.json({ loi: (e as Error).message }, { status: 422 });
  }
}
