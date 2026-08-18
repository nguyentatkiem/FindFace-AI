import { danhSachTaiKhoanQuanTri, prisma } from "@anh/db";
import { taoTaiKhoan, xoaTaiKhoan } from "../hanh-dong";
import { NutXacNhan } from "../nut-xac-nhan";

/** Quản lý tài khoản quản trị — có ≥1 tài khoản thì mật khẩu chung env bị tắt hẳn. */
export default async function TrangTaiKhoan({
  searchParams,
}: {
  searchParams: Promise<{ loi?: string }>;
}) {
  const { loi } = await searchParams;
  const taiKhoans = await danhSachTaiKhoanQuanTri(prisma);

  return (
    <>
      <div className="the">
        <h1 style={{ fontSize: 22 }}>Tài khoản quản trị</h1>
        <p className="mo-ta">
          {taiKhoans.length === 0
            ? "Chưa có tài khoản — cả hệ đang dùng mật khẩu chung. Tạo tài khoản đầu tiên (vai trò Chủ) để mỗi người một đăng nhập, thao tác có nhật ký theo tên."
            : "Đăng nhập bằng email + mật khẩu riêng; vai trò Chủ được quản lý tài khoản."}
        </p>
        {loi && <div className="loi-hop">{loi === "KHONG_XOA_CHU_CUOI" ? "Không thể xóa tài khoản Chủ cuối cùng." : loi}</div>}
        <form action={taoTaiKhoan}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
            <div>
              <label className="nhan-truong">Họ tên</label>
              <input className="o-nhap" name="ho_ten" required placeholder="Nguyễn Văn A" />
            </div>
            <div>
              <label className="nhan-truong">Email</label>
              <input className="o-nhap" name="email" type="email" required placeholder="a@don-vi.vn" />
            </div>
            <div>
              <label className="nhan-truong">Mật khẩu (≥ 8 ký tự)</label>
              <input className="o-nhap" name="mat_khau" type="password" required minLength={8} />
            </div>
            <div>
              <label className="nhan-truong">Vai trò</label>
              <select className="o-nhap" name="vai_tro" defaultValue={taiKhoans.length === 0 ? "chu" : "phu"} style={{ width: "100%" }}>
                <option value="chu">Chủ (quản tài khoản)</option>
                <option value="phu">Phụ (vận hành)</option>
              </select>
            </div>
          </div>
          <button className="nut" type="submit" style={{ marginTop: 12 }}>＋ Tạo tài khoản</button>
        </form>
      </div>

      {taiKhoans.length > 0 && (
        <div className="the">
          <table className="bang">
            <thead><tr><th>Họ tên</th><th>Email</th><th>Vai trò</th><th>Tạo lúc</th><th></th></tr></thead>
            <tbody>
              {taiKhoans.map((tk) => (
                <tr key={tk.id}>
                  <td>{tk.hoTen}</td>
                  <td>{tk.email}</td>
                  <td>{tk.vaiTro === "chu" ? <span className="badge badge-xanh">Chủ</span> : <span className="badge badge-xam">Phụ</span>}</td>
                  <td className="mo-ta">{tk.taoLuc.toLocaleDateString("vi-VN")}</td>
                  <td>
                    <form action={xoaTaiKhoan}>
                      <input type="hidden" name="id" value={tk.id} />
                      <NutXacNhan lop="nut nut-nguy nut-nho" hoi={`Xóa tài khoản ${tk.email}?`}>Xóa</NutXacNhan>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
