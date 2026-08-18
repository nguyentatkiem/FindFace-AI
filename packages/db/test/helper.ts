import { PrismaClient } from "@prisma/client";

/**
 * Hạ tầng test tích hợp — CHẠY TRÊN DB RIÊNG `anh_khoa_hoc_test`, không đụng DB thật.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://maros:maros_dev_2026@localhost:5432/anh_khoa_hoc_test";

// Chốt an toàn: từ chối chạy nếu URL không trỏ DB *_test
if (!/_test(\?|$)/.test(TEST_DATABASE_URL)) {
  throw new Error(`[test] TEST_DATABASE_URL phải trỏ DB tên *_test — nhận: ${TEST_DATABASE_URL}`);
}

export const prismaTest = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });

/** Xoá sạch mọi bảng, reset chuỗi id — gọi trước mỗi test để cô lập. */
export async function resetDb(): Promise<void> {
  const rows = await prismaTest.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
  `;
  if (rows.length === 0) return;
  const danhSach = rows.map((r) => `"${r.tablename}"`).join(", ");
  await prismaTest.$executeRawUnsafe(`TRUNCATE TABLE ${danhSach} RESTART IDENTITY CASCADE`);
}

export async function dongKetNoi(): Promise<void> {
  await prismaTest.$disconnect();
}

// Bộ đếm duy nhất trong suite → sinh khóa/mã không trùng
let dem = 0;
export function stt(): number {
  return ++dem;
}
