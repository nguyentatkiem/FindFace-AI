import { redirect } from "next/navigation";
import { anhBiaSuKien, danhSachSuKienAnh, prisma } from "@anh/db";

/**
 * Trang chủ học viên: sảnh TẤT CẢ album đang mở — bìa là ảnh đông người nhất của sự kiện,
 * bấm vào là vào thẳng. Sự kiện "tạm khóa" không hiện. Ô nhập mã giữ lại cho người đi
 * bằng QR/mã riêng (hoặc khi sự kiện chưa hiện trên sảnh).
 */
export default async function TrangChu() {
  const suKiens = (await danhSachSuKienAnh(prisma)).filter((sk) => sk.trangThai === "hoat_dong");
  const bias = new Map(
    await Promise.all(suKiens.map(async (sk) => [sk.id, await anhBiaSuKien(prisma, sk.id)] as const))
  );

  async function vaoSuKien(formData: FormData) {
    "use server";
    const ma = String(formData.get("ma") ?? "").trim().toLowerCase();
    redirect(ma ? `/s/${encodeURIComponent(ma)}` : "/");
  }

  return (
    <div className="khung khung-rong">
      <div className="hero" style={{ minHeight: 170 }}>
        <div className="lop" />
        <div className="noi-dung">
          <h1>Tìm ảnh của bạn trong hàng vạn tấm — bằng một tấm selfie</h1>
          <div className="meta">Chọn album của khóa học bên dưới, hoặc quét mã QR ban tổ chức phát.</div>
        </div>
      </div>

      {suKiens.length === 0 ? (
        <div className="the">
          <p className="mo-ta" style={{ margin: 0 }}>Chưa có album nào được mở — quay lại sau nhé.</p>
        </div>
      ) : (
        <div className="luoi-su-kien" style={{ marginBottom: 16 }}>
          {suKiens.map((sk) => {
            const bia = bias.get(sk.id);
            return (
              <a
                key={sk.id}
                className="the-su-kien"
                href={`/s/${sk.ma}`}
                style={{ textDecoration: "none" }}
              >
                <span className="bia">
                  {bia && <img src={`/api/anh/${bia.id}/thumb?ma=${encodeURIComponent(sk.ma)}`} alt="" />}
                </span>
                <span className="than">
                  <span className="ten">{sk.ten}</span>
                  <span className="mo-ta" style={{ margin: 0 }}>
                    {sk.ngay.toLocaleDateString("vi-VN", { timeZone: "UTC" })} ·{" "}
                    {sk.daChiMuc.toLocaleString("vi-VN")} ảnh
                    {sk.daXoaMat ? " · chỉ xem thư viện" : ""}
                  </span>
                  <span className="hang-nut" style={{ marginTop: 2 }}>
                    <span className="badge badge-xanh">📷 Tìm ảnh của tôi</span>
                    {sk.choPhepXemTatCa && <span className="badge badge-xam">Thư viện</span>}
                  </span>
                </span>
              </a>
            );
          })}
        </div>
      )}

      <div className="the" style={{ maxWidth: 560 }}>
        <h2>Có mã sự kiện riêng?</h2>
        <form action={vaoSuKien}>
          <div className="hang-nut">
            <input className="o-nhap" name="ma" placeholder="vd: khoa-marketing-2026-ab12"
              required style={{ flex: 1, minWidth: 200 }} />
            <button className="nut" type="submit">Vào album</button>
          </div>
        </form>
      </div>
    </div>
  );
}
