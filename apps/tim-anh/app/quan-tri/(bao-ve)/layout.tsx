import { redirect } from "next/navigation";
import { coPhienQuanTri } from "@/lib/quan-tri-auth";
import { dangXuat } from "./hanh-dong";

/** Khu quản trị: yêu cầu phiên hợp lệ, khung rộng, thanh phụ có lối về danh sách + đăng xuất. */
export default async function LayoutBaoVe({ children }: { children: React.ReactNode }) {
  if (!(await coPhienQuanTri())) redirect("/quan-tri/dang-nhap");
  return (
    <div className="khung khung-rong">
      <div className="hang-nut" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <nav className="hang-nut" style={{ gap: 6 }}>
          <a className="chip" href="/quan-tri">Sự kiện</a>
          <a className="chip" href="/quan-tri/tai-khoan">Tài khoản</a>
          <a className="chip" href="/quan-tri/nhat-ky">Nhật ký</a>
        </nav>
        <form action={dangXuat}>
          <button className="nut nut-trang nut-nho" type="submit">Đăng xuất</button>
        </form>
      </div>
      {children}
    </div>
  );
}
