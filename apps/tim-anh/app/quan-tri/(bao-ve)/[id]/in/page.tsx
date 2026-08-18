import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@anh/db";
import { NutIn } from "./nut-in";

/** Trang in QR khổ A4: treo lớp / chiếu cuối buổi — bấm In là ra PDF/giấy. */
export default async function TrangInQr({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const suKien = await prisma.suKienAnh.findUnique({ where: { id: Number(id) } });
  if (!suKien) notFound();

  const h = await headers();
  const goc = process.env.TIM_ANH_URL_GOC ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3002"}`;
  const link = `${goc}/s/${suKien.ma}`;
  const qr = await QRCode.toString(link, { type: "svg", margin: 0, width: 480 });

  return (
    <>
      <style>{`
        @media print {
          .thanh-tren, .khong-in { display: none !important; }
          .khung, .khung-rong { max-width: none; padding: 0; }
          .to-in { border: none !important; min-height: 96vh; }
        }
        .to-in {
          background: #fff; border: 1px dashed var(--line); border-radius: 12px;
          padding: 48px 40px; text-align: center; max-width: 640px; margin: 0 auto;
          display: flex; flex-direction: column; align-items: center; gap: 18px; min-height: 780px;
          justify-content: center;
        }
        .to-in .qr-lon svg { width: min(420px, 70vw); height: auto; }
        .buoc-in { display: flex; gap: 22px; justify-content: center; flex-wrap: wrap; }
        .buoc-in div { max-width: 150px; font-size: 14px; color: var(--mut); }
        .buoc-in strong { display: block; font-size: 26px; color: var(--green); margin-bottom: 4px; }
      `}</style>
      <div className="hang-nut khong-in" style={{ marginBottom: 14 }}>
        <a className="nut nut-phu nut-nho" href={`/quan-tri/${suKien.id}`}>← Quay lại</a>
        <NutIn />
        <span className="mo-ta" style={{ margin: 0 }}>Chọn khổ A4 khi in; muốn standee thì phóng theo khổ ở hộp thoại in.</span>
      </div>
      <div className="to-in">
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "0.12em", color: "var(--green)", textTransform: "uppercase" }}>
          Nhận ảnh của bạn
        </div>
        <h1 style={{ fontSize: 34, margin: 0, letterSpacing: "-0.02em" }}>{suKien.ten}</h1>
        <div className="qr-lon" dangerouslySetInnerHTML={{ __html: qr }} />
        <div style={{ fontSize: 15, color: "var(--mut)", wordBreak: "break-all" }}>{link}</div>
        <div className="buoc-in">
          <div><strong>1</strong>Quét mã QR bằng camera điện thoại</div>
          <div><strong>2</strong>Chụp một tấm selfie ngay trên trang</div>
          <div><strong>3</strong>Nhận toàn bộ ảnh có bạn — tải về miễn phí</div>
        </div>
      </div>
    </>
  );
}
