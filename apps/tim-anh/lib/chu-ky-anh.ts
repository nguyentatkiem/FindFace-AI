import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Chữ ký phát ảnh cho SỰ KIỆN ĐÓNG THƯ VIỆN: route goc/thumb/zip chỉ kiểm "ảnh thuộc sự
 * kiện" là chưa đủ — id ảnh tuần tự + mã in trên QR nghĩa là ai có mã dò được cả kho.
 * Sự kiện đóng: mỗi ảnh trong kết quả selfie/album được ký HMAC riêng — chỉ ảnh CỦA MÌNH
 * mới mở được. Sự kiện mở thư viện thì không cần ký (ảnh vốn công khai trong sự kiện).
 */
function layBiMat(): string {
  return process.env.PHIEN_BI_MAT ?? "maros-dev-phien-bi-mat-khong-dung-o-production";
}

export function kyAnh(anhId: number, ma: string): string {
  return createHmac("sha256", layBiMat()).update(`anh|${anhId}|${ma}`).digest("hex").slice(0, 20);
}

export function dungChuKyAnh(anhId: number, ma: string, thu: string | null): boolean {
  if (!thu) return false;
  const dung = Buffer.from(kyAnh(anhId, ma));
  const vao = Buffer.from(thu);
  return vao.length === dung.length && timingSafeEqual(vao, dung);
}
