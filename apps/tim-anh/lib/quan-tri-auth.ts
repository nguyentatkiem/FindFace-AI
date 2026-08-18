import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Phiên quản trị app tìm ảnh: một mật khẩu chung (env TIM_ANH_MAT_KHAU_QUAN_TRI) cho
 * người tổ chức khóa học — không cần danh bạ nhân sự như app nội bộ.
 * Cookie ký HMAC-SHA256 cùng cơ chế internal/portal, hạn phiên nằm TRONG payload được ký.
 */

const TEN_COOKIE = "tim_anh_quan_tri";
export const HAN_PHIEN_GIAY = 12 * 3600;

const PHIEN_BI_MAT_DEV = "maros-dev-phien-bi-mat-khong-dung-o-production";
let daCanhBao = false;
function layBiMatPhien(): string {
  const biMat = process.env.PHIEN_BI_MAT;
  if (biMat) return biMat;
  if (!daCanhBao) {
    daCanhBao = true;
    console.warn("[tim-anh] Thiếu env PHIEN_BI_MAT — dùng bí mật dev cố định (KHÔNG an toàn cho production)");
  }
  return PHIEN_BI_MAT_DEV;
}

const MAT_KHAU_DEV = "quan-tri-dev";
let daCanhBaoMatKhau = false;
export function layMatKhauQuanTri(): string {
  const mk = process.env.TIM_ANH_MAT_KHAU_QUAN_TRI;
  if (mk) return mk;
  if (!daCanhBaoMatKhau) {
    daCanhBaoMatKhau = true;
    console.warn("[tim-anh] Thiếu env TIM_ANH_MAT_KHAU_QUAN_TRI — dùng mật khẩu dev 'quan-tri-dev' (đặt env khi lên máy chủ)");
  }
  return MAT_KHAU_DEV;
}

/** So mật khẩu thời gian cố định — không rò độ dài/vị trí sai qua đo thời gian phản hồi. */
export function dungMatKhau(thu: string): boolean {
  const dung = Buffer.from(layMatKhauQuanTri());
  const vao = Buffer.from(thu);
  return vao.length === dung.length && timingSafeEqual(vao, dung);
}

function kyPhien(email: string): string {
  const payload = `${email}|${Date.now() + HAN_PHIEN_GIAY * 1000}`;
  const chuKy = createHmac("sha256", layBiMatPhien()).update(payload).digest("hex");
  return `${payload}.${chuKy}`;
}

/** email = định danh ghi nhật ký; đăng nhập bằng mật khẩu chung thì là "quan-tri". */
export async function datPhienQuanTri(email = "quan-tri"): Promise<void> {
  (await cookies()).set(TEN_COOKIE, kyPhien(email), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: HAN_PHIEN_GIAY,
    path: "/",
  });
}

export async function xoaPhienQuanTri(): Promise<void> {
  (await cookies()).delete(TEN_COOKIE);
}

/** Email của phiên hợp lệ, hoặc null khi chưa đăng nhập/hết hạn/sai chữ ký. */
export async function emailPhienQuanTri(): Promise<string | null> {
  const giaTri = (await cookies()).get(TEN_COOKIE)?.value;
  if (!giaTri) return null;
  const viTri = giaTri.lastIndexOf(".");
  if (viTri <= 0) return null;
  const payload = giaTri.slice(0, viTri);
  const chuKy = Buffer.from(giaTri.slice(viTri + 1));
  const chuKyDung = Buffer.from(createHmac("sha256", layBiMatPhien()).update(payload).digest("hex"));
  if (chuKy.length !== chuKyDung.length || !timingSafeEqual(chuKy, chuKyDung)) return null;
  const cach = payload.lastIndexOf("|");
  const hetHan = Number(payload.slice(cach + 1));
  if (!Number.isFinite(hetHan) || hetHan < Date.now()) return null;
  return payload.slice(0, cach) || null;
}

export async function coPhienQuanTri(): Promise<boolean> {
  return (await emailPhienQuanTri()) !== null;
}
