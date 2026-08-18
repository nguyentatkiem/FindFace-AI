/**
 * Job BÁO ẢNH MỚI: album cá nhân nào có ảnh mới chưa báo + học viên có để lại email
 * → gửi "bạn có thêm N ảnh" kèm link album. Cần cấu hình SMTP (env SMTP_HOST/PORT/
 * SMTP_USER/SMTP_PASS/SMTP_FROM) — chưa cấu hình thì để nguyên hàng chờ, không mất gì:
 * học viên mở album vẫn thấy ảnh mới.
 */
import nodemailer from "nodemailer";
import { prisma, danhDauAlbumDaBao, danhSachAlbumCanBao } from "@anh/db";

export async function baoAnhMoi(): Promise<{ daGui: number; choSmtp: number }> {
  const canBao = await danhSachAlbumCanBao(prisma);
  if (canBao.length === 0) return { daGui: 0, choSmtp: 0 };

  const host = process.env.SMTP_HOST;
  if (!host) {
    console.warn(`[bao-anh-moi] ${canBao.length} album chờ báo — chưa cấu hình SMTP_HOST nên chưa gửi`);
    return { daGui: 0, choSmtp: canBao.length };
  }

  const goc = process.env.TIM_ANH_URL_GOC ?? "http://localhost:3002";
  const mailer = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_PORT === "465",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });

  let daGui = 0;
  for (const al of canBao) {
    try {
      await mailer.sendMail({
        from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
        to: al.lienHe,
        subject: `Bạn có thêm ${al.soMoi} ảnh mới — ${al.suKienTen}`,
        text: `Kho ảnh "${al.suKienTen}" vừa bổ sung ${al.soMoi} ảnh có mặt bạn.\n\nXem album của bạn: ${goc}/a/${al.token}\n\n(Email tự động — album tự xóa dữ liệu khuôn mặt theo cam kết riêng tư của sự kiện.)`,
      });
      await danhDauAlbumDaBao(prisma, al.id, al.anhIds); // chỉ đánh dấu ảnh ĐÃ nằm trong email này
      daGui += 1;
    } catch (e) {
      // lỗi gửi từng album không chặn các album khác; lần chạy sau thử lại
      console.warn(`[bao-anh-moi] gửi ${al.lienHe} lỗi: ${e instanceof Error ? e.message : e}`);
    }
  }
  return { daGui, choSmtp: 0 };
}
