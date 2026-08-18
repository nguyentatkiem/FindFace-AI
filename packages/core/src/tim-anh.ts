/**
 * Tìm ảnh khuôn mặt — phần logic THUẦN (không chạm DB/model):
 * gộp kết quả nhiều selfie, ngưỡng mặc định, sinh/kiểm mã sự kiện.
 */

/** Kết quả khớp một ảnh với một vector selfie: điểm là độ tương đồng cosine [−1..1]. */
export interface KetQuaKhop {
  anhId: number;
  diem: number;
}

/**
 * Ngưỡng cosine mặc định cho ArcFace buffalo_l — 0.38 cân giữa "bắt đủ ảnh" và "bắt nhầm
 * người giống"; tinh chỉnh bằng ảnh khóa học thật qua env TIM_ANH_NGUONG.
 */
export const NGUONG_TIM_ANH_MAC_DINH = 0.38;

/**
 * Gộp kết quả tìm từ NHIỀU selfie (2–3 góc mặt tăng độ phủ): mỗi ảnh lấy điểm CAO NHẤT
 * qua các lần khớp, sắp giảm dần theo điểm (hòa điểm thì id nhỏ trước — ổn định), cắt gioiHan.
 */
export function gopKetQuaTim(cacLan: KetQuaKhop[][], gioiHan = 500): KetQuaKhop[] {
  const totNhat = new Map<number, number>();
  for (const lan of cacLan) {
    for (const k of lan) {
      const cu = totNhat.get(k.anhId);
      if (cu === undefined || k.diem > cu) totNhat.set(k.anhId, k.diem);
    }
  }
  return [...totNhat.entries()]
    .map(([anhId, diem]) => ({ anhId, diem }))
    .sort((a, b) => b.diem - a.diem || a.anhId - b.anhId)
    .slice(0, gioiHan);
}

/** Bỏ dấu tiếng Việt + thường hóa ("Khóa Đào tạo" → "khoa dao tao") — nền cho slug mã sự kiện. */
export function boDauTiengViet(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("đ", "d")
    .replaceAll("Đ", "d")
    .toLowerCase();
}

/** Mã sự kiện hợp lệ: chữ thường/số/gạch nối, 4–32 ký tự, không bắt đầu/kết thúc bằng gạch. */
export function laMaSuKienHopLe(ma: string): boolean {
  return /^[a-z0-9][a-z0-9-]{2,30}[a-z0-9]$/.test(ma);
}

/**
 * Sinh mã sự kiện từ tên + hậu tố (hậu tố truyền vào — nơi gọi tự sinh ngẫu nhiên,
 * hàm giữ thuần để test được). "Khóa Marketing 2026" + "x7k2" → "khoa-marketing-2026-x7k2".
 */
export function taoMaSuKien(ten: string, hauTo: string): string {
  const slug = boDauTiengViet(ten)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/, "");
  return `${slug || "su-kien"}-${hauTo}`;
}

// ---- Chất lượng ảnh (lọc ảnh hỏng trước khi công bố) ----

export interface DanhGiaChatLuong {
  canhBao: boolean;
  lyDo: string | null; // "mo" | "toi" | "chay" | null
}

/**
 * Đánh giá ảnh từ hai số dịch vụ model trả về: doNet = phương sai Laplacian (thấp = mờ),
 * doSang = độ sáng trung bình 0..255. Ngưỡng chỉnh từ thực nghiệm ảnh sự kiện.
 */
export function danhGiaChatLuongAnh(doNet: number, doSang: number): DanhGiaChatLuong {
  if (doSang < 35) return { canhBao: true, lyDo: "toi" };
  if (doSang > 235) return { canhBao: true, lyDo: "chay" };
  if (doNet < 40) return { canhBao: true, lyDo: "mo" };
  return { canhBao: false, lyDo: null };
}

// ---- dHash: gom ảnh chụp liên thanh gần trùng ----

/** Khoảng cách Hamming giữa hai dHash hex cùng độ dài; khác độ dài → coi như xa hẳn. */
export function khoangCachHamming(a: string, b: string): number {
  if (a.length !== b.length) return Number.MAX_SAFE_INTEGER;
  let khac = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16);
    while (x) {
      khac += x & 1;
      x >>= 1;
    }
  }
  return khac;
}

/** Hai ảnh "gần trùng" (chụp liên thanh) khi dHash 64-bit lệch ≤ 6 bit. */
export function laGanTrung(h1: string | null | undefined, h2: string | null | undefined, nguong = 6): boolean {
  if (!h1 || !h2) return false;
  return khoangCachHamming(h1, h2) <= nguong;
}
