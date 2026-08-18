import path from "node:path";

/**
 * Kho file của app tìm ảnh — quy ước MỘT chỗ để worker (ghi thumbnail), app tim-anh
 * (nhận upload, phát file) cùng trỏ đúng nơi:
 *   <gốc>/goc/<suKienId>/<tên tệp>   ảnh gốc upload qua web (ảnh đồng bộ thư mục giữ nguyên chỗ cũ)
 *   <gốc>/thumb/<anhId>.jpg          thumbnail 520px do worker sinh khi chỉ mục
 * Gốc mặc định <repo>/du-lieu/tim-anh (cả hai app đều nằm ở apps/<x> — hai cấp dưới repo);
 * đổi bằng env TIM_ANH_THU_MUC (đường dẫn tuyệt đối) khi đưa lên máy chủ.
 */
export function thuMucDuLieuTimAnh(): string {
  return process.env.TIM_ANH_THU_MUC ?? path.resolve(process.cwd(), "..", "..", "du-lieu", "tim-anh");
}

export function thuMucAnhGoc(suKienId: number): string {
  return path.join(thuMucDuLieuTimAnh(), "goc", String(suKienId));
}

export function thuMucThumb(): string {
  return path.join(thuMucDuLieuTimAnh(), "thumb");
}

export function duongDanThumb(anhId: number): string {
  return path.join(thuMucThumb(), `${anhId}.jpg`);
}

/** Bản 1600px cho lightbox — sinh lười lần xem đầu, cache tại đây. */
export function duongDanThumb1600(anhId: number): string {
  return path.join(thuMucDuLieuTimAnh(), "thumb-1600", `${anhId}.jpg`);
}

/** Bản JPEG chuyển đổi từ HEIC (ảnh iPhone) — trình duyệt không hiển thị HEIC trực tiếp. */
export function thuMucChuyenDoi(): string {
  return path.join(thuMucDuLieuTimAnh(), "chuyen-doi");
}

export function duongDanChuyenDoi(anhId: number): string {
  return path.join(thuMucChuyenDoi(), `${anhId}.jpg`);
}

export function laTepHeic(tenTep: string): boolean {
  return [".heic", ".heif"].includes(path.extname(tenTep).toLowerCase());
}

/** Đuôi ảnh nhận chỉ mục — HEIC được dịch vụ Python chuyển JPEG lúc chỉ mục. */
export const DUOI_ANH_HOP_LE = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]);

export function laTepAnh(tenTep: string): boolean {
  return DUOI_ANH_HOP_LE.has(path.extname(tenTep).toLowerCase());
}
