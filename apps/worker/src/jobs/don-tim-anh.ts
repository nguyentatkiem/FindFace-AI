/**
 * Job DỌN DỮ LIỆU TÌM ẢNH (riêng tư — Nghị định 13/2023): vector khuôn mặt là dữ liệu
 * sinh trắc học, chỉ giữ đến hết hạn cam kết với học viên (SuKienAnh.hanXoaNgay, mặc định
 * 90 ngày sau sự kiện) rồi xóa hẳn. Ảnh gốc GIỮ NGUYÊN — chỉ dữ liệu sinh trắc bị dọn.
 */
import { prisma, xoaDuLieuMatHetHan } from "@anh/db";

export async function donTimAnh(): Promise<{ soSuKien: number; soMat: number }> {
  return xoaDuLieuMatHetHan(prisma);
}
