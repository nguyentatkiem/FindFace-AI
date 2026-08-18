import { coTimTheoMoTa, danhSachAnhThuVien, danhSachThuMuc, laySuKienTheoMa, prisma } from "@anh/db";
import { ThuVien } from "./thu-vien";

/**
 * Thư viện toàn bộ ảnh sự kiện (khi admin bật cho phép): chip thư mục + lưới justified
 * + cuộn vô hạn. Trang đầu render từ server cho nhanh, các trang sau client tự tải.
 */
export default async function TrangThuVien({
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
        <a className="nut nut-phu" href="/">Nhập mã khác</a>
      </div>
    );
  }
  if (!suKien.choPhepXemTatCa) {
    return (
      <div className="the">
        <h1>{suKien.ten}</h1>
        <p className="mo-ta">Ban tổ chức chỉ mở tính năng tìm ảnh bằng selfie cho sự kiện này.</p>
        <a className="nut" href={`/s/${suKien.ma}/tim`}>📷 Tìm ảnh của tôi</a>
      </div>
    );
  }

  const thuMucId = tm === undefined || tm === "" ? undefined : tm === "0" ? null : Number(tm);
  const [dsThuMuc, trangDau, coMoTa] = await Promise.all([
    danhSachThuMuc(prisma, suKien.id),
    danhSachAnhThuVien(prisma, suKien.id, { thuMucId, soLuong: 100 }),
    coTimTheoMoTa(prisma, suKien.id),
  ]);

  return (
    <>
      <p className="mo-ta" style={{ margin: "2px 0 0" }}>
        <a href={`/s/${suKien.ma}`}>← {suKien.ten}</a>
      </p>
      <ThuVien
        ma={suKien.ma}
        tmDangChon={tm ?? ""}
        thuMucs={dsThuMuc.thuMucs}
        chuaPhan={dsThuMuc.chuaPhan}
        anhsDau={trangDau.anhs.map((a) => ({ id: a.id, tenTep: a.tenTep, rongPx: a.rongPx, caoPx: a.caoPx }))}
        conNua={trangDau.conNua}
        coTimMoTa={coMoTa}
      />
    </>
  );
}
