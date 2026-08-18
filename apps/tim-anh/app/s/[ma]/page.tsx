import { anhBiaSuKien, coTimTheoMoTa, danhSachAnhThuVien, danhSachThuMuc, laySuKienTheoMa, prisma, thongKeSuKien } from "@anh/db";
import { ThuVien } from "./thu-vien/thu-vien";
import { kyAnh } from "@/lib/chu-ky-anh";

/** Trang sự kiện: hero ảnh bìa + TOÀN BỘ album hiện ngay bên dưới (khi thư viện mở). */
export default async function TrangSuKien({
  params,
  searchParams,
}: {
  params: Promise<{ ma: string }>;
  searchParams: Promise<{ tm?: string }>;
}) {
  const { ma } = await params;
  const { tm } = await searchParams;
  const suKien = await laySuKienTheoMa(prisma, ma.toLowerCase());

  if (!suKien || suKien.trangThai !== "hoat_dong") {
    return (
      <div className="the">
        <h1>Không tìm thấy sự kiện</h1>
        <p className="mo-ta">
          Mã <strong>{ma}</strong> không tồn tại hoặc đã tạm khóa. Kiểm tra lại mã trên QR/tin nhắn
          của ban tổ chức.
        </p>
        <a className="nut nut-phu" href="/">Nhập mã khác</a>
      </div>
    );
  }

  const thuMucId = tm === undefined || tm === "" ? undefined : tm === "0" ? null : Number(tm);
  const [bia, tk, dsThuMuc, trangDau, coMoTa] = await Promise.all([
    anhBiaSuKien(prisma, suKien.id),
    thongKeSuKien(prisma, suKien.id),
    suKien.choPhepXemTatCa ? danhSachThuMuc(prisma, suKien.id) : Promise.resolve({ thuMucs: [], chuaPhan: 0 }),
    suKien.choPhepXemTatCa
      ? danhSachAnhThuVien(prisma, suKien.id, { thuMucId, soLuong: 100 })
      : Promise.resolve({ anhs: [], conNua: false }),
    suKien.choPhepXemTatCa ? coTimTheoMoTa(prisma, suKien.id) : Promise.resolve(false),
  ]);
  const ngay = suKien.ngay.toLocaleDateString("vi-VN", { timeZone: "UTC" });

  return (
    <>
      <div className="hero">
        {bia && (
          <img className="phu" alt="" aria-hidden
            src={`/api/anh/${bia.id}/thumb?ma=${encodeURIComponent(suKien.ma)}&k=1600&s=${kyAnh(bia.id, suKien.ma)}`} />
        )}
        <div className="lop" />
        <div className="noi-dung">
          <h1>{suKien.ten}</h1>
          <div className="meta">
            {ngay} · {tk.daChiMuc.toLocaleString("vi-VN")} ảnh
            {tk.choChiMuc + tk.dangChiMuc > 0 ? " · đang bổ sung thêm" : ""}
          </div>
          <div className="hanh-dong">
            <a className="nut" href={`/s/${suKien.ma}/tim`}>📷 Tìm ảnh của tôi bằng selfie</a>
          </div>
        </div>
      </div>

      {suKien.daXoaMat && (
        <div className="the">
          <p className="mo-ta" style={{ margin: 0 }}>
            Tính năng tìm bằng selfie đã kết thúc: theo cam kết riêng tư, dữ liệu khuôn mặt chỉ lưu{" "}
            {suKien.hanXoaNgay} ngày sau sự kiện và đã được xóa.
            {suKien.choPhepXemTatCa ? " Bạn vẫn xem và tải ảnh được từ thư viện bên dưới." : ""}
          </p>
        </div>
      )}

      {suKien.choPhepXemTatCa && (
        <ThuVien
          ma={suKien.ma}
          gocUrl={`/s/${suKien.ma}`}
          tmDangChon={tm ?? ""}
          thuMucs={dsThuMuc.thuMucs}
          chuaPhan={dsThuMuc.chuaPhan}
          anhsDau={trangDau.anhs.map((a) => ({ id: a.id, tenTep: a.tenTep, rongPx: a.rongPx, caoPx: a.caoPx }))}
          conNua={trangDau.conNua}
          coTimMoTa={coMoTa}
        />
      )}
    </>
  );
}
