import { PrismaClient } from "@prisma/client";

/**
 * Giới hạn tần suất theo cửa sổ trượt cố định, lưu ở Postgres (thay Map in-memory) để an toàn
 * khi chạy nhiều instance. Một câu INSERT ... ON CONFLICT cập nhật ATOMIC — không đua giữa các
 * request/instance.
 *
 * @returns { biChan, soLan } — biChan=true khi đã vượt giới hạn trong cửa sổ hiện tại.
 */
export async function ghiNhanTanSuat(
  prisma: PrismaClient,
  khoa: string,
  gioiHan: number,
  cuaSoMs: number
): Promise<{ biChan: boolean; soLan: number }> {
  // now() - batDauCuaSo > cửa sổ  → cửa sổ mới (reset về 1); ngược lại tăng đếm. Tất cả trong 1 câu.
  const rows = await prisma.$queryRaw<{ soLan: number }[]>`
    INSERT INTO "GioiHanTanSuat" ("khoa", "soLan", "batDauCuaSo")
    VALUES (${khoa}, 1, now())
    ON CONFLICT ("khoa") DO UPDATE SET
      "soLan" = CASE
        WHEN now() - "GioiHanTanSuat"."batDauCuaSo" > (${cuaSoMs}::double precision * interval '1 millisecond')
        THEN 1 ELSE "GioiHanTanSuat"."soLan" + 1 END,
      "batDauCuaSo" = CASE
        WHEN now() - "GioiHanTanSuat"."batDauCuaSo" > (${cuaSoMs}::double precision * interval '1 millisecond')
        THEN now() ELSE "GioiHanTanSuat"."batDauCuaSo" END
    RETURNING "soLan"`;
  const soLan = Number(rows[0]?.soLan ?? 1);
  return { biChan: soLan > gioiHan, soLan };
}

/** Dọn các bản ghi đã ngoài cửa sổ lâu (mặc định >1 ngày) — gọi định kỳ từ worker để bảng không phình. */
export async function donGioiHanCu(prisma: PrismaClient, quaHanMs = 24 * 3600_000): Promise<number> {
  const nguong = new Date(Date.now() - quaHanMs);
  const kq = await prisma.gioiHanTanSuat.deleteMany({ where: { batDauCuaSo: { lt: nguong } } });
  return kq.count;
}
