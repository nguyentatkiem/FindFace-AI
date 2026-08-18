import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { NGUONG_TIM_ANH_MAC_DINH, type KetQuaKhop } from "@anh/core";

/**
 * Album cá nhân + gom cụm khuôn mặt.
 * Album giữ MỘT vector mặt chủ album (emb) khi học viên đồng ý — nhờ đó ảnh chụp bổ sung
 * được tự nạp vào album và báo qua email. emb xóa cùng hạn sinh trắc của sự kiện
 * (job don-tim-anh) → album "đóng băng": ảnh cũ vẫn xem, không nạp mới nữa.
 */

const SO_CHIEU = 512;

function vectorText(v: number[]): string {
  if (!Array.isArray(v) || v.length !== SO_CHIEU) throw new Error("VECTOR_PHAI_512_CHIEU");
  for (const x of v) if (typeof x !== "number" || !Number.isFinite(x)) throw new Error("VECTOR_GIA_TRI_KHONG_HOP_LE");
  return `[${v.join(",")}]`;
}

// ---- Album cá nhân ----

export async function taoAlbumCaNhan(
  prisma: PrismaClient,
  suKienId: number,
  emb: number[],
  ketQua: KetQuaKhop[],
  lienHe?: string | null
) {
  const token = randomBytes(16).toString("base64url"); // 22 ký tự — chính là "chìa khóa" album
  const lienHeChuan = lienHe?.trim().toLowerCase() || null;
  if (lienHeChuan && !/^\S+@\S+\.\S+$/.test(lienHeChuan)) throw new Error("EMAIL_KHONG_HOP_LE");

  // Tạo bằng ORM với mốc giờ truyền tay (KHÔNG để DB default now(), KHÔNG truyền Date qua
  // $queryRaw): cột timestamp không múi giờ mà now() ghi giờ máy chủ, ORM ghi UTC còn tham số
  // Date trong raw lại serialize giờ địa phương — trộn nguồn làm so sánh thời gian lệch 7 tiếng.
  const luc = new Date();
  const embText = vectorText(emb); // kiểm CHẶT trước khi mở transaction
  // Một transaction trọn gói — đứt giữa chừng không để lại album mồ côi thiếu vector
  return prisma.$transaction(async (tx) => {
    const album = await tx.albumCaNhan.create({
      data: { token, suKienId, lienHe: lienHeChuan, taoLuc: luc, capNhatLuc: luc },
      select: { id: true },
    });
    await tx.$executeRaw`UPDATE "AlbumCaNhan" SET "emb" = ${embText}::vector WHERE "id" = ${album.id}`;
    if (ketQua.length > 0) {
      await tx.anhAlbum.createMany({
        // ảnh có sẵn lúc tạo coi như "đã báo" — email chỉ nói về ảnh MỚI sau này
        data: ketQua.map((k) => ({ albumId: album.id, anhId: k.anhId, diem: k.diem, daBao: true })),
        skipDuplicates: true,
      });
      await tx.albumCaNhan.update({ where: { id: album.id }, data: { soAnh: ketQua.length } });
    }
    return { id: album.id, token };
  });
}

export async function layAlbumTheoToken(prisma: PrismaClient, token: string) {
  const album = await prisma.albumCaNhan.findUnique({
    where: { token },
    include: { suKien: true },
  });
  if (!album) return null;
  const anhs = await prisma.anhAlbum.findMany({
    where: { albumId: album.id },
    orderBy: [{ diem: "desc" }],
    include: { anh: { select: { id: true, tenTep: true, rongPx: true, caoPx: true } } },
  });
  const [conEmb] = await prisma.$queryRaw<{ co: boolean }[]>`
    SELECT ("emb" IS NOT NULL) AS "co" FROM "AlbumCaNhan" WHERE "id" = ${album.id}`;
  return {
    album,
    conCapNhat: Boolean(conEmb?.co), // false = đã đóng băng theo hạn riêng tư
    anhs: anhs.map((a) => ({ ...a.anh, diem: a.diem })),
  };
}

/**
 * Nạp ảnh MỚI chỉ mục xong vào các album còn vector (worker gọi sau mỗi đợt chỉ mục).
 * Chỉ quét ảnh có chiMucLuc > capNhatLuc của từng album — kho cũ không bị quét lại.
 */
export async function capNhatCacAlbum(prisma: PrismaClient, suKienId?: number) {
  // Lọc sự kiện NGAY TRONG SQL — mỗi album kéo theo ~6KB vector text, lọc ở JS là
  // tải cả kho album về chỉ để vứt đi
  const albums = suKienId
    ? await prisma.$queryRaw<{ id: number; suKienId: number; emb: string }[]>`
      SELECT a."id", a."suKienId", a."emb"::text AS "emb"
      FROM "AlbumCaNhan" a
      JOIN "SuKienAnh" s ON s."id" = a."suKienId"
      WHERE a."emb" IS NOT NULL AND s."daXoaMat" = false AND s."trangThai" = 'hoat_dong'
        AND a."suKienId" = ${suKienId}`
    : await prisma.$queryRaw<{ id: number; suKienId: number; emb: string }[]>`
      SELECT a."id", a."suKienId", a."emb"::text AS "emb"
      FROM "AlbumCaNhan" a
      JOIN "SuKienAnh" s ON s."id" = a."suKienId"
      WHERE a."emb" IS NOT NULL AND s."daXoaMat" = false AND s."trangThai" = 'hoat_dong'`;
  let tongMoi = 0;
  for (const al of albums) {
    // Mốc "mới hơn lần quét trước" so CỘT-với-CỘT trong SQL (subselect) — cả hai đều do ORM
    // ghi UTC nên nhất quán; tuyệt đối không đưa Date làm tham số raw (bị serialize giờ máy).
    const moi = await prisma.$queryRaw<{ anhId: number; diem: number }[]>`
      SELECT km."anhId", max(1 - (km."embedding" <=> ${al.emb}::vector))::float AS "diem"
      FROM "KhuonMat" km
      JOIN "AnhSuKien" anh ON anh."id" = km."anhId"
      WHERE km."suKienId" = ${al.suKienId} AND km."embedding" IS NOT NULL
        AND anh."chiMucLuc" > (SELECT "capNhatLuc" FROM "AlbumCaNhan" WHERE "id" = ${al.id})
      GROUP BY km."anhId"
      HAVING max(1 - (km."embedding" <=> ${al.emb}::vector)) >= ${NGUONG_TIM_ANH_MAC_DINH}`;
    if (moi.length > 0) {
      await prisma.anhAlbum.createMany({
        data: moi.map((m) => ({ albumId: al.id, anhId: m.anhId, diem: m.diem })),
        skipDuplicates: true,
      });
      tongMoi += moi.length;
    }
    const soAnh = await prisma.anhAlbum.count({ where: { albumId: al.id } });
    await prisma.albumCaNhan.update({
      where: { id: al.id },
      data: { soAnh, capNhatLuc: new Date() },
    });
  }
  return { soAlbum: albums.length, soAnhMoi: tongMoi };
}

/** Album có ảnh mới chưa báo + có email — đầu vào cho job gửi "bạn có thêm N ảnh". */
export async function danhSachAlbumCanBao(prisma: PrismaClient) {
  // Trả kèm danh sách anhId chưa báo — job đánh dấu ĐÚNG các ảnh đã nằm trong email,
  // ảnh nạp thêm trong lúc đang gửi không bị "coi như đã báo" oan
  return prisma.$queryRaw<{ id: number; token: string; lienHe: string; suKienTen: string; soMoi: number; anhIds: number[] }[]>`
    SELECT a."id", a."token", a."lienHe", s."ten" AS "suKienTen",
           count(*)::int AS "soMoi", array_agg(aa."anhId") AS "anhIds"
    FROM "AlbumCaNhan" a
    JOIN "AnhAlbum" aa ON aa."albumId" = a."id" AND aa."daBao" = false
    JOIN "SuKienAnh" s ON s."id" = a."suKienId"
    WHERE a."lienHe" IS NOT NULL
    GROUP BY a."id", a."token", a."lienHe", s."ten"`;
}

export async function danhDauAlbumDaBao(prisma: PrismaClient, albumId: number, anhIds?: number[]) {
  const kq = await prisma.anhAlbum.updateMany({
    where: { albumId, daBao: false, ...(anhIds ? { anhId: { in: anhIds } } : {}) },
    data: { daBao: true },
  });
  return kq.count;
}

// ---- Gom cụm khuôn mặt ("một người" trong sự kiện) ----

const NGUONG_CUM = 0.55; // chặt hơn ngưỡng tìm — vào cụm là "chắc chắn cùng người"
const TOI_DA_MAT_GOM = 30_000;

function docVector(text: string): Float64Array {
  return Float64Array.from(text.slice(1, -1).split(","), Number);
}

/** Gom lại TOÀN BỘ cụm của một sự kiện (greedy theo centroid, mặt nét nhất làm hạt giống). */
export async function gomCumKhuonMat(prisma: PrismaClient, suKienId: number) {
  const mats = await prisma.$queryRaw<{ id: number; anhId: number; diem: number; emb: string }[]>`
    SELECT "id", "anhId", "diemPhatHien" AS "diem", "embedding"::text AS "emb"
    FROM "KhuonMat"
    WHERE "suKienId" = ${suKienId} AND "embedding" IS NOT NULL
    ORDER BY "diemPhatHien" DESC
    LIMIT ${TOI_DA_MAT_GOM}`;

  interface Cum { tong: Float64Array; soMat: number; matIds: number[]; anhIds: Set<number>; daiDien: number }
  const cums: Cum[] = [];
  for (const m of mats) {
    const v = docVector(m.emb);
    let tot: Cum | null = null;
    let totCos = NGUONG_CUM;
    for (const c of cums) {
      // cosine với centroid = dot(v, tong) / ||tong|| (v đã chuẩn hóa L2)
      let dot = 0;
      let chuan = 0;
      for (let i = 0; i < SO_CHIEU; i++) {
        dot += v[i]! * c.tong[i]!;
        chuan += c.tong[i]! * c.tong[i]!;
      }
      const cos = dot / Math.sqrt(chuan);
      if (cos >= totCos) {
        totCos = cos;
        tot = c;
      }
    }
    if (tot) {
      for (let i = 0; i < SO_CHIEU; i++) tot.tong[i]! += v[i]!;
      tot.soMat += 1;
      tot.matIds.push(m.id);
      tot.anhIds.add(m.anhId);
    } else {
      cums.push({ tong: Float64Array.from(v), soMat: 1, matIds: [m.id], anhIds: new Set([m.anhId]), daiDien: m.id });
    }
  }

  // Ghi đè kết quả cũ trong một transaction — cụm là dữ liệu suy diễn, dựng lại được.
  // Khóa advisory theo sự kiện: cron 03:00 và nút "Gom lại ngay" chạy trùng sẽ xếp hàng
  // thay vì cùng delete-rồi-create làm nhân đôi cụm (bài học sync-ads).
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"gom-cum:" + suKienId}, 0))`;
    await tx.cumKhuonMat.deleteMany({ where: { suKienId } }); // cumId trên KhuonMat tự về null (SetNull)
    for (const c of cums) {
      const moi = await tx.cumKhuonMat.create({
        data: { suKienId, soMat: c.soMat, soAnh: c.anhIds.size, matDaiDienId: c.daiDien },
      });
      for (let i = 0; i < c.matIds.length; i += 2000) {
        await tx.khuonMat.updateMany({
          where: { id: { in: c.matIds.slice(i, i + 2000) } },
          data: { cumId: moi.id },
        });
      }
    }
  });
  return { soCum: cums.length, soMat: mats.length };
}

/** Danh sách cụm kèm mặt đại diện (anhId + bbox để crop) — admin xem "ai nhiều/ít ảnh". */
export async function danhSachCum(prisma: PrismaClient, suKienId: number) {
  const cums = await prisma.cumKhuonMat.findMany({
    where: { suKienId },
    orderBy: { soAnh: "desc" },
  });
  const matIds = cums.map((c) => c.matDaiDienId).filter((x): x is number => x !== null);
  const mats = await prisma.khuonMat.findMany({
    where: { id: { in: matIds } },
    select: { id: true, anhId: true, bbox: true },
  });
  const theoId = new Map(mats.map((m) => [m.id, m]));
  return cums.map((c) => ({
    id: c.id,
    soMat: c.soMat,
    soAnh: c.soAnh,
    daiDien: c.matDaiDienId ? theoId.get(c.matDaiDienId) ?? null : null,
  }));
}

/** Ảnh thuộc một cụm (admin bấm vào một "người"). */
export async function danhSachAnhTheoCum(prisma: PrismaClient, cumId: number) {
  const mats = await prisma.khuonMat.findMany({
    where: { cumId },
    select: { anhId: true },
  });
  const anhIds = [...new Set(mats.map((m) => m.anhId))];
  return prisma.anhSuKien.findMany({
    where: { id: { in: anhIds } },
    orderBy: { id: "asc" },
    select: { id: true, tenTep: true, rongPx: true, caoPx: true },
  });
}

/** Học viên bổ sung/đổi email nhận báo ảnh mới trên trang album. */
export async function capNhatLienHeAlbum(prisma: PrismaClient, token: string, lienHe: string | null) {
  const chuan = lienHe?.trim().toLowerCase() || null;
  if (chuan && !/^\S+@\S+\.\S+$/.test(chuan)) throw new Error("EMAIL_KHONG_HOP_LE");
  return prisma.albumCaNhan.update({ where: { token }, data: { lienHe: chuan } });
}

/** Sự kiện đã có ảnh mang vector CLIP chưa — quyết định có hiện ô "tìm theo mô tả". */
export async function coTimTheoMoTa(prisma: PrismaClient, suKienId: number): Promise<boolean> {
  const [r] = await prisma.$queryRaw<{ co: boolean }[]>`
    SELECT EXISTS(SELECT 1 FROM "AnhSuKien" WHERE "suKienId" = ${suKienId} AND "clipEmb" IS NOT NULL) AS "co"`;
  return Boolean(r?.co);
}
