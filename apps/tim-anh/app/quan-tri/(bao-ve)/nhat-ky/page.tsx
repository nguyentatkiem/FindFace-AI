import { danhSachNhatKy, prisma } from "@anh/db";

const TEN_HANH_DONG: Record<string, string> = {
  dang_nhap: "Đăng nhập",
  tao_su_kien: "Tạo sự kiện",
  xoa_su_kien: "Xóa sự kiện",
  xoa_vector_ngay: "Xóa dữ liệu mặt ngay",
  bat_watermark: "Bật watermark",
  tat_watermark: "Tắt watermark",
  tao_tai_khoan: "Tạo tài khoản",
  xoa_tai_khoan: "Xóa tài khoản",
  nhap_drive: "Nhập từ Google Drive",
  gui_moi: "Gửi lời mời",
};

/** Nhật ký thao tác quản trị — 200 dòng gần nhất, mới trước. */
export default async function TrangNhatKy() {
  const nhatKy = await danhSachNhatKy(prisma, 200);
  return (
    <div className="the">
      <h1 style={{ fontSize: 22 }}>Nhật ký thao tác</h1>
      {nhatKy.length === 0 ? (
        <p className="mo-ta">Chưa có thao tác nào được ghi.</p>
      ) : (
        <table className="bang">
          <thead><tr><th>Lúc</th><th>Ai</th><th>Việc</th><th>Chi tiết</th></tr></thead>
          <tbody>
            {nhatKy.map((n) => (
              <tr key={String(n.id)}>
                <td className="so">{n.luc.toLocaleString("vi-VN")}</td>
                <td>{n.email}</td>
                <td>{TEN_HANH_DONG[n.hanhDong] ?? n.hanhDong}</td>
                <td className="mo-ta">{n.chiTiet ? JSON.stringify(n.chiTiet) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
