import { Prisma, PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Quản trị nhiều tài khoản + nhật ký thao tác + thống kê cho app tìm ảnh.
 * Chưa có tài khoản nào → app rơi về mật khẩu chung env (giữ tương thích);
 * có tài khoản rồi thì đăng nhập bằng email + mật khẩu riêng (băm scrypt).
 */

// ---- Tài khoản ----

function bamMatKhau(matKhau: string): string {
  const muoi = randomBytes(16).toString("hex");
  return `${muoi}:${scryptSync(matKhau, muoi, 32).toString("hex")}`;
}

function khopMatKhau(matKhau: string, daBam: string): boolean {
  const [muoi, hash] = daBam.split(":");
  if (!muoi || !hash) return false;
  const thu = scryptSync(matKhau, muoi, 32);
  const dung = Buffer.from(hash, "hex");
  return thu.length === dung.length && timingSafeEqual(thu, dung);
}

export async function taoTaiKhoanQuanTri(
  prisma: PrismaClient,
  input: { email: string; hoTen: string; matKhau: string; vaiTro?: string }
) {
  const email = input.email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("EMAIL_KHONG_HOP_LE");
  if (input.matKhau.length < 8) throw new Error("MAT_KHAU_QUA_NGAN"); // ≥ 8 ký tự
  const vaiTro = input.vaiTro === "chu" ? "chu" : "phu";
  return prisma.taiKhoanQuanTri.create({
    data: { email, hoTen: input.hoTen.trim(), matKhau: bamMatKhau(input.matKhau), vaiTro },
    select: { id: true, email: true, hoTen: true, vaiTro: true },
  });
}

export async function kiemTraDangNhapQuanTri(prisma: PrismaClient, email: string, matKhau: string) {
  const tk = await prisma.taiKhoanQuanTri.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!tk || !khopMatKhau(matKhau, tk.matKhau)) return null;
  return { id: tk.id, email: tk.email, hoTen: tk.hoTen, vaiTro: tk.vaiTro };
}

export async function demTaiKhoanQuanTri(prisma: PrismaClient) {
  return prisma.taiKhoanQuanTri.count();
}

export async function danhSachTaiKhoanQuanTri(prisma: PrismaClient) {
  return prisma.taiKhoanQuanTri.findMany({
    orderBy: { id: "asc" },
    select: { id: true, email: true, hoTen: true, vaiTro: true, taoLuc: true },
  });
}

/** Xóa tài khoản — KHÔNG cho xóa tài khoản "chu" cuối cùng (tự khóa cửa). */
export async function xoaTaiKhoanQuanTri(prisma: PrismaClient, id: number) {
  const tk = await prisma.taiKhoanQuanTri.findUniqueOrThrow({ where: { id } });
  if (tk.vaiTro === "chu") {
    const soChu = await prisma.taiKhoanQuanTri.count({ where: { vaiTro: "chu" } });
    if (soChu <= 1) throw new Error("KHONG_XOA_CHU_CUOI");
  }
  return prisma.taiKhoanQuanTri.delete({ where: { id } });
}

// ---- Nhật ký thao tác ----

export async function ghiNhatKy(
  prisma: PrismaClient,
  email: string,
  hanhDong: string,
  chiTiet?: Record<string, unknown>
) {
  await prisma.nhatKyQuanTri.create({
    data: { email, hanhDong, chiTiet: (chiTiet ?? undefined) as Prisma.InputJsonValue | undefined },
  });
}

export async function danhSachNhatKy(prisma: PrismaClient, soLuong = 200) {
  return prisma.nhatKyQuanTri.findMany({ orderBy: { id: "desc" }, take: soLuong });
}

// ---- Lượt tải + thống kê mở rộng ----

export async function ghiLuotTai(
  prisma: PrismaClient,
  suKienId: number,
  loai: "goc" | "zip",
  tuyChon: { anhId?: number; soAnh?: number } = {}
) {
  await prisma.luotTaiAnh.create({
    data: { suKienId, loai, anhId: tuyChon.anhId, soAnh: tuyChon.soAnh ?? 1 },
  });
}

export interface ThongKeMoRong {
  luotTimTheoNgay: { ngay: string; soLuot: number; soThay: number }[]; // 14 ngày gần nhất
  tongLuotTim: number;
  tiLeThay: number; // 0..1 — lượt tìm có ≥1 ảnh
  tongAnhTai: number;
  topAnhTai: { anhId: number; tenTep: string; soLan: number }[];
}

export async function thongKeMoRong(prisma: PrismaClient, suKienId: number): Promise<ThongKeMoRong> {
  const [theoNgay, tong, thay, tai, top] = await Promise.all([
    prisma.$queryRaw<{ ngay: string; soLuot: number; soThay: number }[]>`
      SELECT to_char(date_trunc('day', "taoLuc"), 'YYYY-MM-DD') AS "ngay",
             count(*)::int AS "soLuot",
             count(*) FILTER (WHERE "soAnhTra" > 0)::int AS "soThay"
      FROM "LuotTimAnh"
      WHERE "suKienId" = ${suKienId} AND "taoLuc" > now() - interval '14 days'
      GROUP BY 1 ORDER BY 1`,
    prisma.luotTimAnh.count({ where: { suKienId } }),
    prisma.luotTimAnh.count({ where: { suKienId, soAnhTra: { gt: 0 } } }),
    prisma.luotTaiAnh.aggregate({ where: { suKienId }, _sum: { soAnh: true } }),
    prisma.$queryRaw<{ anhId: number; tenTep: string; soLan: number }[]>`
      SELECT lt."anhId", a."tenTep", count(*)::int AS "soLan"
      FROM "LuotTaiAnh" lt JOIN "AnhSuKien" a ON a."id" = lt."anhId"
      WHERE lt."suKienId" = ${suKienId} AND lt."anhId" IS NOT NULL
      GROUP BY lt."anhId", a."tenTep" ORDER BY count(*) DESC LIMIT 8`,
  ]);
  return {
    luotTimTheoNgay: theoNgay,
    tongLuotTim: tong,
    tiLeThay: tong === 0 ? 0 : thay / tong,
    tongAnhTai: tai._sum.soAnh ?? 0,
    topAnhTai: top,
  };
}
