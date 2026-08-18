/**
 * Job GOM CỤM KHUÔN MẶT: dựng lại cụm "một người" cho các sự kiện đang hoạt động còn
 * dữ liệu mặt — admin xem "N người, mỗi người M ảnh", thấy ai chưa được chụp tấm nào.
 * Cụm là dữ liệu suy diễn, dựng lại trọn mỗi đêm (sự kiện vài nghìn ảnh chạy vài giây).
 */
import { prisma, gomCumKhuonMat } from "@anh/db";

export async function gomCum(suKienIdRieng?: number): Promise<{ soSuKien: number; soCum: number }> {
  const suKiens = suKienIdRieng
    ? [{ id: suKienIdRieng }]
    : await prisma.suKienAnh.findMany({
        where: { trangThai: "hoat_dong", daXoaMat: false },
        select: { id: true },
      });
  let soCum = 0;
  let soSuKien = 0;
  for (const sk of suKiens) {
    try {
      const coMat = await prisma.khuonMat.count({ where: { suKienId: sk.id } });
      if (coMat === 0) continue;
      const kq = await gomCumKhuonMat(prisma, sk.id);
      soCum += kq.soCum;
      soSuKien += 1;
    } catch (e) {
      // một sự kiện lỗi (vd admin xóa ảnh đúng lúc đang gom) không chặn các sự kiện sau
      console.warn(`[gom-cum] sự kiện ${sk.id} lỗi: ${e instanceof Error ? e.message.slice(0, 120) : e}`);
    }
  }
  return { soSuKien, soCum };
}
