import { laySuKienTheoMa, prisma } from "@anh/db";
import { ChupSelfie } from "../chup-selfie";

/** Luồng tìm ảnh bằng selfie: đồng ý điều khoản → camera → kết quả. */
export default async function TrangTim({ params }: { params: Promise<{ ma: string }> }) {
  const { ma } = await params;
  const suKien = await laySuKienTheoMa(prisma, ma.toLowerCase());

  if (!suKien || suKien.trangThai !== "hoat_dong") {
    return (
      <div className="the">
        <h1>Không tìm thấy sự kiện</h1>
        <a className="nut nut-phu" href="/">Nhập mã khác</a>
      </div>
    );
  }
  if (suKien.daXoaMat) {
    return (
      <div className="the">
        <h1>{suKien.ten}</h1>
        <p className="mo-ta">
          Đợt tìm bằng selfie đã kết thúc: dữ liệu khuôn mặt chỉ lưu {suKien.hanXoaNgay} ngày sau sự
          kiện và đã được xóa theo cam kết riêng tư.
        </p>
        {suKien.choPhepXemTatCa && (
          <a className="nut" href={`/s/${suKien.ma}/thu-vien`}>Xem toàn bộ thư viện</a>
        )}
      </div>
    );
  }

  return (
    <>
      <p className="mo-ta" style={{ margin: "2px 0 12px" }}>
        <a href={`/s/${suKien.ma}`}>← {suKien.ten}</a>
      </p>
      <ChupSelfie ma={suKien.ma} hanXoaNgay={suKien.hanXoaNgay} batLiveness={process.env.TIM_ANH_LIVENESS === "1"} />
    </>
  );
}
