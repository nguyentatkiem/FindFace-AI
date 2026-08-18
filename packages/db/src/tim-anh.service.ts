import { PrismaClient } from "@prisma/client";
import {
  NGUONG_TIM_ANH_MAC_DINH,
  gopKetQuaTim,
  laMaSuKienHopLe,
  taoMaSuKien,
  type KetQuaKhop,
} from "@anh/core";
import { randomBytes } from "node:crypto";

/**
 * Tìm ảnh khuôn mặt (app tim-anh) — service layer.
 * Vector 512 chiều (ArcFace, chuẩn hóa L2) lưu cột pgvector `KhuonMat.embedding` —
 * Prisma client không đọc/ghi được kiểu Unsupported nên mọi thao tác vector đi qua
 * $queryRaw có kiểm tra đầu vào chặt (chỉ số hữu hạn, đúng 512 chiều).
 */

/** Một khuôn mặt do dịch vụ model (apps/dich-vu-khuon-mat) trả về khi chỉ mục một ảnh. */
export interface MatChiMuc {
  bbox: number[]; // [x1, y1, x2, y2]
  diem: number; // điểm phát hiện 0..1
  vector: number[]; // 512 chiều, ||v|| = 1
}

const SO_CHIEU = 512;
// HNSW mặc định ef_search=40 — phải nâng ≥ LIMIT để mỗi câu tìm trả đủ ứng viên
const GIOI_HAN_MOI_VECTOR = 200;
const EF_SEARCH = 240;

/** Đổi mảng số thành chuỗi pgvector '[a,b,…]' — chặn NaN/Infinity/kiểu lạ lọt vào SQL. */
function vectorText(v: number[]): string {
  if (!Array.isArray(v) || v.length !== SO_CHIEU) throw new Error("VECTOR_PHAI_512_CHIEU");
  for (const x of v) {
    if (typeof x !== "number" || !Number.isFinite(x)) throw new Error("VECTOR_GIA_TRI_KHONG_HOP_LE");
  }
  return `[${v.join(",")}]`;
}

// ---- Sự kiện ----

export async function taoSuKienAnh(
  prisma: PrismaClient,
  input: { ten: string; ngay: string; ma?: string; hanXoaNgay?: number }
) {
  const ten = input.ten.trim();
  if (!ten) throw new Error("TEN_SU_KIEN_TRONG");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.ngay)) throw new Error("NGAY_SAI_DINH_DANG");
  const hanXoaNgay = input.hanXoaNgay ?? 90;
  if (!Number.isInteger(hanXoaNgay) || hanXoaNgay < 1 || hanXoaNgay > 3650)
    throw new Error("HAN_XOA_NGOAI_KHOANG");

  // Không truyền mã → sinh từ tên + hậu tố ngẫu nhiên 4 ký tự (đủ tránh trùng giữa các khóa học)
  const ma = input.ma?.trim() || taoMaSuKien(ten, randomBytes(3).toString("hex").slice(0, 4));
  if (!laMaSuKienHopLe(ma)) throw new Error("MA_SU_KIEN_KHONG_HOP_LE");

  return prisma.suKienAnh.create({ data: { ma, ten, ngay: new Date(input.ngay), hanXoaNgay } });
}

export async function laySuKienTheoMa(prisma: PrismaClient, ma: string) {
  return prisma.suKienAnh.findUnique({ where: { ma } });
}

/** Danh sách sự kiện kèm số liệu tổng hợp cho màn admin. */
export async function danhSachSuKienAnh(prisma: PrismaClient) {
  const suKiens = await prisma.suKienAnh.findMany({
    orderBy: { ngay: "desc" },
    include: { _count: { select: { anhs: true, luotTims: true } } },
  });
  const nhom = await prisma.anhSuKien.groupBy({
    by: ["suKienId", "trangThai"],
    _count: { _all: true },
    _sum: { soMat: true },
  });
  return suKiens.map((sk) => {
    const cuaSk = nhom.filter((n) => n.suKienId === sk.id);
    const dem = (trangThai: string) => cuaSk.find((n) => n.trangThai === trangThai)?._count._all ?? 0;
    return {
      ...sk,
      tongAnh: sk._count.anhs,
      luotTim: sk._count.luotTims,
      daChiMuc: dem("xong"),
      choChiMuc: dem("cho_chi_muc") + dem("dang_chi_muc"),
      loiChiMuc: dem("loi"),
      tongMat: cuaSk.reduce((s, n) => s + (n._sum.soMat ?? 0), 0),
    };
  });
}

export async function thongKeSuKien(prisma: PrismaClient, suKienId: number) {
  const [nhom, luotTim] = await Promise.all([
    prisma.anhSuKien.groupBy({
      by: ["trangThai"],
      where: { suKienId },
      _count: { _all: true },
      _sum: { soMat: true },
    }),
    prisma.luotTimAnh.count({ where: { suKienId } }),
  ]);
  const dem = (t: string) => nhom.find((n) => n.trangThai === t)?._count._all ?? 0;
  return {
    tongAnh: nhom.reduce((s, n) => s + n._count._all, 0),
    choChiMuc: dem("cho_chi_muc"),
    dangChiMuc: dem("dang_chi_muc"),
    daChiMuc: dem("xong"),
    loiChiMuc: dem("loi"),
    tongMat: nhom.reduce((s, n) => s + (n._sum.soMat ?? 0), 0),
    luotTim,
  };
}

/** Đường dẫn mọi ảnh của sự kiện — nơi gọi dùng để dọn file trước khi xóa sự kiện. */
export async function danhSachDuongDanAnh(prisma: PrismaClient, suKienId: number) {
  const anhs = await prisma.anhSuKien.findMany({ where: { suKienId }, select: { id: true, duongDan: true } });
  return anhs;
}

/** Xóa sự kiện — cascade kéo theo ảnh, khuôn mặt, lượt tìm (file trên đĩa do nơi gọi dọn). */
export async function xoaSuKienAnh(prisma: PrismaClient, id: number) {
  return prisma.suKienAnh.delete({ where: { id } });
}

// ---- Chỉ mục ảnh (worker) ----

/** Đăng ký ảnh vào hàng chờ chỉ mục; trùng đường dẫn (đăng ký lại) thì bỏ qua êm. */
export async function dangKyAnh(
  prisma: PrismaClient,
  suKienId: number,
  teps: { tenTep: string; duongDan: string }[],
  thuMucId?: number | null
) {
  await prisma.suKienAnh.findUniqueOrThrow({ where: { id: suKienId }, select: { id: true } });
  const kq = await prisma.anhSuKien.createMany({
    data: teps.map((t) => ({ suKienId, tenTep: t.tenTep, duongDan: t.duongDan, thuMucId: thuMucId ?? null })),
    skipDuplicates: true,
  });
  return { daThem: kq.count, boQua: teps.length - kq.count };
}

// ---- Thư mục trong sự kiện (buổi sáng, lễ trao chứng chỉ…) ----

/** Tạo thư mục — trùng tên trong cùng sự kiện thì trả về thư mục sẵn có (đồng bộ lại không nhân đôi). */
export async function taoThuMuc(prisma: PrismaClient, suKienId: number, ten: string) {
  const tenChuan = ten.trim().slice(0, 80);
  if (!tenChuan) throw new Error("TEN_THU_MUC_TRONG");
  return prisma.thuMucAnh.upsert({
    where: { suKienId_ten: { suKienId, ten: tenChuan } },
    update: {},
    create: { suKienId, ten: tenChuan },
  });
}

export async function danhSachThuMuc(prisma: PrismaClient, suKienId: number) {
  const thuMucs = await prisma.thuMucAnh.findMany({
    where: { suKienId },
    orderBy: [{ thuTu: "asc" }, { ten: "asc" }],
    include: { _count: { select: { anhs: true } } },
  });
  const chuaPhan = await prisma.anhSuKien.count({ where: { suKienId, thuMucId: null } });
  return {
    thuMucs: thuMucs.map((t) => ({ id: t.id, ten: t.ten, soAnh: t._count.anhs })),
    chuaPhan,
  };
}

export async function doiTenThuMuc(prisma: PrismaClient, id: number, ten: string) {
  const tenChuan = ten.trim().slice(0, 80);
  if (!tenChuan) throw new Error("TEN_THU_MUC_TRONG");
  return prisma.thuMucAnh.update({ where: { id }, data: { ten: tenChuan } });
}

/** Xóa thư mục — ảnh trong đó KHÔNG mất, chỉ về "chưa phân" (FK SetNull). */
export async function xoaThuMuc(prisma: PrismaClient, id: number) {
  return prisma.thuMucAnh.delete({ where: { id } });
}

/** Chuyển lô ảnh vào thư mục (null = bỏ phân loại) — chỉ ảnh thuộc đúng sự kiện. */
export async function chuyenAnhVaoThuMuc(
  prisma: PrismaClient,
  suKienId: number,
  anhIds: number[],
  thuMucId: number | null
) {
  if (thuMucId !== null) {
    const tm = await prisma.thuMucAnh.findFirst({ where: { id: thuMucId, suKienId }, select: { id: true } });
    if (!tm) throw new Error("THU_MUC_KHONG_THUOC_SU_KIEN");
  }
  const kq = await prisma.anhSuKien.updateMany({
    where: { id: { in: anhIds }, suKienId },
    data: { thuMucId },
  });
  return kq.count;
}

/** Xóa lô ảnh khỏi sự kiện — trả về đường dẫn để nơi gọi dọn file/thumbnail. */
export async function xoaAnhChon(prisma: PrismaClient, suKienId: number, anhIds: number[]) {
  const anhs = await prisma.anhSuKien.findMany({
    where: { id: { in: anhIds }, suKienId },
    select: { id: true, duongDan: true },
  });
  await prisma.anhSuKien.deleteMany({ where: { id: { in: anhs.map((a) => a.id) } } });
  return anhs;
}

/**
 * Thư viện ảnh phân trang kiểu con trỏ (id tăng dần) — chỉ ảnh đã chỉ mục xong (có thumbnail).
 * thuMucId: undefined = tất cả, null = chưa phân, số = đúng thư mục.
 */
export async function danhSachAnhThuVien(
  prisma: PrismaClient,
  suKienId: number,
  tuyChon: { thuMucId?: number | null; sauId?: number; soLuong?: number } = {}
) {
  const soLuong = Math.min(tuyChon.soLuong ?? 100, 200);
  // Vệ sinh đầu vào từ query string: NaN (?tm=abc, ?sau=xyz) từng làm Prisma nổ 500 cả trang
  const thuMucId =
    typeof tuyChon.thuMucId === "number" && !Number.isInteger(tuyChon.thuMucId) ? undefined : tuyChon.thuMucId;
  const sauId = Number.isInteger(tuyChon.sauId) ? tuyChon.sauId : undefined;
  const anhs = await prisma.anhSuKien.findMany({
    where: {
      suKienId,
      trangThai: "xong",
      ...(thuMucId !== undefined ? { thuMucId } : {}),
      ...(sauId ? { id: { gt: sauId } } : {}),
    },
    orderBy: { id: "asc" },
    take: soLuong + 1, // lấy dư 1 để biết còn trang sau không
    select: { id: true, tenTep: true, rongPx: true, caoPx: true, soMat: true, thuMucId: true },
  });
  const conNua = anhs.length > soLuong;
  return { anhs: conNua ? anhs.slice(0, soLuong) : anhs, conNua };
}

/** Ảnh bìa sự kiện: tấm có nhiều mặt nhất trong 50 tấm đầu đã chỉ mục (ảnh tập thể lên bìa). */
export async function anhBiaSuKien(prisma: PrismaClient, suKienId: number) {
  const ung = await prisma.anhSuKien.findMany({
    where: { suKienId, trangThai: "xong" },
    orderBy: { id: "asc" },
    take: 50,
    select: { id: true, soMat: true },
  });
  if (ung.length === 0) return null;
  return ung.reduce((tot, a) => (a.soMat > tot.soMat ? a : tot), ung[0]!);
}

export async function capNhatSuKien(
  prisma: PrismaClient,
  id: number,
  data: { ten?: string; choPhepXemTatCa?: boolean; hanXoaNgay?: number; trangThai?: string }
) {
  if (data.hanXoaNgay !== undefined && (!Number.isInteger(data.hanXoaNgay) || data.hanXoaNgay < 1 || data.hanXoaNgay > 3650)) {
    throw new Error("HAN_XOA_NGOAI_KHOANG");
  }
  return prisma.suKienAnh.update({ where: { id }, data });
}

/**
 * Nhận lô ảnh chờ chỉ mục — UPDATE…SELECT FOR UPDATE SKIP LOCKED nên nhiều worker
 * chạy song song cũng không nhặt trùng ảnh của nhau.
 */
export async function nhanAnhChoChiMuc(prisma: PrismaClient, soLuong = 8) {
  // chiMucLuc tạm ghi MỐC NHẬN (now() của DB) — luuKetQuaChiMuc sẽ ghi đè mốc xong thật;
  // nhờ đó traLaiAnhKet chỉ giải cứu ảnh kẹt lâu, không cướp ảnh worker khác đang làm dở
  return prisma.$queryRaw<{ id: number; suKienId: number; duongDan: string; tenTep: string }[]>`
    UPDATE "AnhSuKien" SET "trangThai" = 'dang_chi_muc', "chiMucLuc" = now()
    WHERE "id" IN (
      SELECT "id" FROM "AnhSuKien" WHERE "trangThai" = 'cho_chi_muc'
      ORDER BY "id" LIMIT ${soLuong} FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "suKienId", "duongDan", "tenTep"`;
}

/**
 * Trả ảnh KẸT ở 'dang_chi_muc' quá 15 phút (worker chết giữa chừng) về hàng chờ.
 * Có mốc thời gian nên hai tiến trình chạy song song không cướp ảnh đang làm dở của
 * nhau nữa; so now()-với-cột NGAY TRONG SQL để tránh bẫy múi giờ timestamp naive.
 */
export async function traLaiAnhKet(prisma: PrismaClient) {
  const kq = await prisma.$executeRaw`
    UPDATE "AnhSuKien" SET "trangThai" = 'cho_chi_muc'
    WHERE "trangThai" = 'dang_chi_muc' AND "chiMucLuc" < now() - interval '15 minutes'`;
  return kq;
}

/** Lưu kết quả chỉ mục một ảnh — chỉ mục lại thì thay thế trọn (không nhân đôi khuôn mặt). */
export async function luuKetQuaChiMuc(
  prisma: PrismaClient,
  anhId: number,
  kq: {
    rongPx: number;
    caoPx: number;
    mats: MatChiMuc[];
    doNet?: number;
    doSang?: number;
    canhBaoChatLuong?: boolean;
    dHash?: string;
    clip?: number[]; // CLIP 512 chiều — tìm theo mô tả (chỉ khi dịch vụ bật CLIP)
  }
) {
  return prisma.$transaction(async (tx) => {
    const anh = await tx.anhSuKien.findUniqueOrThrow({ where: { id: anhId }, select: { suKienId: true } });
    await tx.khuonMat.deleteMany({ where: { anhId } });
    for (const mat of kq.mats) {
      await tx.$executeRaw`
        INSERT INTO "KhuonMat" ("anhId", "suKienId", "bbox", "diemPhatHien", "embedding")
        VALUES (${anhId}, ${anh.suKienId}, ${JSON.stringify(mat.bbox)}::jsonb, ${mat.diem}, ${vectorText(mat.vector)}::vector)`;
    }
    if (kq.clip) {
      await tx.$executeRaw`UPDATE "AnhSuKien" SET "clipEmb" = ${vectorText(kq.clip)}::vector WHERE "id" = ${anhId}`;
    }
    return tx.anhSuKien.update({
      where: { id: anhId },
      data: {
        trangThai: "xong",
        soMat: kq.mats.length,
        rongPx: kq.rongPx,
        caoPx: kq.caoPx,
        doNet: kq.doNet,
        doSang: kq.doSang,
        canhBaoChatLuong: kq.canhBaoChatLuong ?? false,
        dHash: kq.dHash,
        chiMucLuc: new Date(),
        loi: null,
      },
    });
  });
}

/** Tìm ảnh theo MÔ TẢ (vector CLIP của câu chữ) trong một sự kiện — bật khi dịch vụ có CLIP. */
export async function timAnhTheoMoTa(
  prisma: PrismaClient,
  suKienId: number,
  clipVanBan: number[],
  tuyChon: { nguong?: number; gioiHan?: number } = {}
) {
  // CLIP ảnh-vs-chữ: cosine thường 0.2–0.35 với cặp khớp — thấp hơn hẳn thang mặt-vs-mặt
  const nguong = tuyChon.nguong ?? 0.23;
  const gioiHan = tuyChon.gioiHan ?? 100;
  const vt = vectorText(clipVanBan);
  const rows = await prisma.$queryRaw<{ id: number; tenTep: string; rongPx: number | null; caoPx: number | null; diem: number }[]>`
    SELECT "id", "tenTep", "rongPx", "caoPx", (1 - ("clipEmb" <=> ${vt}::vector))::float AS "diem"
    FROM "AnhSuKien"
    WHERE "suKienId" = ${suKienId} AND "clipEmb" IS NOT NULL AND "trangThai" = 'xong'
    ORDER BY "clipEmb" <=> ${vt}::vector
    LIMIT ${gioiHan}`;
  return rows.filter((r) => r.diem >= nguong);
}

export async function danhDauLoiChiMuc(prisma: PrismaClient, anhId: number, loi: string) {
  return prisma.anhSuKien.update({
    where: { id: anhId },
    data: { trangThai: "loi", loi: loi.slice(0, 500) },
  });
}

// ---- Tìm kiếm (học viên) ----

export interface AnhTimThay extends KetQuaKhop {
  tenTep: string;
  duongDan: string;
  rongPx: number | null;
  caoPx: number | null;
}

/**
 * Tìm ảnh theo 1..n vector selfie trong MỘT sự kiện: mỗi vector chạy một câu KNN
 * trên chỉ mục HNSW, lọc theo ngưỡng cosine, rồi gộp (mỗi ảnh giữ điểm cao nhất).
 */
export async function timAnhTheoVector(
  prisma: PrismaClient,
  suKienId: number,
  vectors: number[][],
  tuyChon: { nguong?: number; gioiHan?: number } = {}
): Promise<AnhTimThay[]> {
  const nguong = tuyChon.nguong ?? NGUONG_TIM_ANH_MAC_DINH;
  const gioiHan = tuyChon.gioiHan ?? 500;
  if (vectors.length === 0) return [];

  const cacLan = await prisma.$transaction(async (tx) => {
    // SET LOCAL chỉ sống trong transaction — không rò cấu hình sang kết nối dùng chung.
    // SET không nhận bind param → nội suy chuỗi, an toàn vì EF_SEARCH là hằng số của module.
    // iterative_scan (pgvector ≥0.8): quét tiếp khi lọc suKienId loại bớt ứng viên, khỏi hụt kết quả.
    await tx.$executeRawUnsafe(`SET LOCAL hnsw.ef_search = ${EF_SEARCH}`);
    await tx.$executeRawUnsafe(`SET LOCAL hnsw.iterative_scan = 'relaxed_order'`);
    const kq: KetQuaKhop[][] = [];
    for (const v of vectors) {
      const vt = vectorText(v);
      const rows = await tx.$queryRaw<{ anhId: number; diem: number }[]>`
        SELECT "anhId", 1 - ("embedding" <=> ${vt}::vector) AS "diem"
        FROM "KhuonMat"
        WHERE "suKienId" = ${suKienId} AND "embedding" IS NOT NULL
        ORDER BY "embedding" <=> ${vt}::vector
        LIMIT ${GIOI_HAN_MOI_VECTOR}`;
      kq.push(
        rows
          .map((r) => ({ anhId: r.anhId, diem: Number(r.diem) }))
          .filter((r) => r.diem >= nguong)
      );
    }
    return kq;
  });

  const gop = gopKetQuaTim(cacLan, gioiHan);
  if (gop.length === 0) return [];

  const anhs = await prisma.anhSuKien.findMany({
    where: { id: { in: gop.map((k) => k.anhId) } },
    select: { id: true, tenTep: true, duongDan: true, rongPx: true, caoPx: true },
  });
  const theoId = new Map(anhs.map((a) => [a.id, a]));
  return gop.flatMap((k) => {
    const a = theoId.get(k.anhId);
    return a ? [{ ...k, tenTep: a.tenTep, duongDan: a.duongDan, rongPx: a.rongPx, caoPx: a.caoPx }] : [];
  });
}

/** Ảnh thuộc đúng sự kiện có mã đã cho — chốt kiểm quyền khi phát file ảnh. */
export async function layAnhTheoMaSuKien(prisma: PrismaClient, anhId: number, ma: string) {
  return prisma.anhSuKien.findFirst({
    where: { id: anhId, suKien: { ma } },
    select: { id: true, tenTep: true, duongDan: true, suKienId: true },
  });
}

export async function ghiLuotTim(
  prisma: PrismaClient,
  suKienId: number,
  soMatSelfie: number,
  soAnhTra: number
) {
  return prisma.luotTimAnh.create({ data: { suKienId, soMatSelfie, soAnhTra } });
}

// ---- Riêng tư: dọn dữ liệu sinh trắc hết hạn (Nghị định 13/2023) ----

/**
 * Xóa vector khuôn mặt của các sự kiện đã qua hạn (ngày sự kiện + hanXoaNgay).
 * Ảnh gốc GIỮ NGUYÊN — chỉ dữ liệu sinh trắc bị xóa; sự kiện đánh dấu daXoaMat.
 */
export async function xoaDuLieuMatHetHan(prisma: PrismaClient, homNay: Date = new Date()) {
  // CHỦ Ý dùng Date thô (serialize theo giờ máy): "ngay" là cột DATE thuần — mốc LỊCH nghiệp vụ,
  // ranh giới "qua ngày chót" phải theo lịch địa phương của máy chủ. Đây là phép so DUY NHẤT
  // với cột DATE, không dính cột timestamp do ORM ghi UTC nên không mắc bẫy múi giờ như album.
  const suKiens = await prisma.$queryRaw<{ id: number }[]>`
    SELECT "id" FROM "SuKienAnh"
    WHERE "daXoaMat" = false AND "ngay" + make_interval(days => "hanXoaNgay") <= ${homNay}`;
  let soMat = 0;
  for (const sk of suKiens) {
    const [xoa] = await prisma.$transaction([
      prisma.khuonMat.deleteMany({ where: { suKienId: sk.id } }),
      prisma.suKienAnh.update({ where: { id: sk.id }, data: { daXoaMat: true } }),
      // album cùng sự kiện mất vector chủ → đóng băng (ảnh cũ vẫn xem, không nạp mới)
      prisma.$executeRaw`UPDATE "AlbumCaNhan" SET "emb" = NULL WHERE "suKienId" = ${sk.id}`,
    ]);
    soMat += xoa.count;
  }
  return { soSuKien: suKiens.length, soMat };
}
