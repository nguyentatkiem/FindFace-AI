import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import nodemailer from "nodemailer";
import { ghiNhatKy, prisma } from "@anh/db";
import { emailPhienQuanTri } from "@/lib/quan-tri-auth";

/**
 * Gửi link sự kiện hàng loạt cho danh sách học viên (dán email, mỗi dòng/phẩy một địa chỉ).
 * Cần SMTP (env SMTP_HOST/PORT/USER/PASS/FROM) — chưa cấu hình thì báo rõ cách bật.
 */
export default async function TrangMoi({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kq?: string; loi?: string }>;
}) {
  const { id } = await params;
  const { kq, loi } = await searchParams;
  const suKien = await prisma.suKienAnh.findUnique({ where: { id: Number(id) } });
  if (!suKien) notFound();
  const coSmtp = Boolean(process.env.SMTP_HOST);

  const h = await headers();
  const goc = process.env.TIM_ANH_URL_GOC ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3002"}`;
  const link = `${goc}/s/${suKien.ma}`;

  async function guiMoi(formData: FormData) {
    "use server";
    const nguoiLam = await emailPhienQuanTri();
    if (!nguoiLam) redirect("/quan-tri/dang-nhap");
    const suKienId = Number(formData.get("id"));
    const sk = await prisma.suKienAnh.findUniqueOrThrow({ where: { id: suKienId } });
    const emails = [...new Set(
      String(formData.get("danh_sach") ?? "")
        .split(/[\n,;\s]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => /^\S+@\S+\.\S+$/.test(e))
    )].slice(0, 500);
    if (emails.length === 0) redirect(`/quan-tri/${suKienId}/moi?loi=${encodeURIComponent("Không có email hợp lệ trong danh sách")}`);
    if (!process.env.SMTP_HOST) redirect(`/quan-tri/${suKienId}/moi?loi=${encodeURIComponent("Chưa cấu hình SMTP — xem hướng dẫn cuối trang")}`);

    const gocGui = process.env.TIM_ANH_URL_GOC ?? "http://localhost:3002";
    const mailer = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_PORT === "465",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    let daGui = 0;
    for (const email of emails) {
      try {
        await mailer.sendMail({
          from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
          to: email,
          subject: `Ảnh của bạn tại "${sk.ten}" — chụp selfie là nhận`,
          text: `Chào bạn,\n\nẢnh của khóa "${sk.ten}" đã sẵn sàng. Mở link dưới đây, chụp một tấm selfie và nhận toàn bộ ảnh có mặt bạn:\n\n${gocGui}/s/${sk.ma}\n\n(Email tự động từ ban tổ chức.)`,
        });
        daGui += 1;
      } catch {
        // email hỏng lẻ tẻ không chặn cả đợt
      }
    }
    await ghiNhatKy(prisma, nguoiLam, "gui_moi", { suKienId, daGui, tong: emails.length });
    redirect(`/quan-tri/${suKienId}/moi?kq=${daGui}-${emails.length}`);
  }

  return (
    <div className="the" style={{ maxWidth: 720 }}>
      <p className="mo-ta" style={{ marginTop: 0 }}><a href={`/quan-tri/${suKien.id}`}>← {suKien.ten}</a></p>
      <h1 style={{ fontSize: 22 }}>Gửi link cho học viên</h1>
      <p className="mo-ta">
        Dán danh sách email (mỗi dòng một địa chỉ, hoặc cách nhau bằng phẩy — copy thẳng từ cột
        Excel cũng được). Mỗi người nhận một email mời kèm link <code>{link}</code>.
      </p>
      {kq && <div className="canh-bao">Đã gửi {kq.split("-")[0]}/{kq.split("-")[1]} email.</div>}
      {loi && <div className="loi-hop">{loi}</div>}
      <form action={guiMoi}>
        <input type="hidden" name="id" value={suKien.id} />
        <textarea className="o-nhap" name="danh_sach" rows={9} required
          placeholder={"hocvien1@gmail.com\nhocvien2@gmail.com\n…"} style={{ resize: "vertical" }} />
        <div className="hang-nut" style={{ marginTop: 12 }}>
          <button className="nut" type="submit" disabled={!coSmtp}>Gửi lời mời</button>
          {!coSmtp && <span className="badge badge-vang">chưa cấu hình SMTP</span>}
        </div>
      </form>
      {!coSmtp && (
        <p className="ghi-chu-phap-ly" style={{ marginTop: 12 }}>
          Bật gửi email: đặt env <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>,{" "}
          <code>SMTP_PASS</code>, <code>SMTP_FROM</code> (dùng được Gmail App Password / Brevo / Resend SMTP)
          rồi khởi động lại app. Cùng bộ env này bật luôn email "báo ảnh mới" của album cá nhân.
        </p>
      )}
    </div>
  );
}
