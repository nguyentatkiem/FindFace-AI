import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { demTaiKhoanQuanTri, ghiNhanTanSuat, ghiNhatKy, kiemTraDangNhapQuanTri, prisma } from "@anh/db";
import { datPhienQuanTri, dungMatKhau } from "@/lib/quan-tri-auth";
import { layIp } from "@/lib/dich-vu-khuon-mat";

/**
 * Đăng nhập quản trị — rate-limit 10 lần/giờ/IP chống dò.
 * Đã tạo tài khoản (trang Tài khoản) → đăng nhập email + mật khẩu riêng, có nhật ký theo người;
 * chưa có tài khoản nào → mật khẩu chung env như trước.
 */
export default async function TrangDangNhap({
  searchParams,
}: {
  searchParams: Promise<{ loi?: string }>;
}) {
  const { loi } = await searchParams;
  const coTaiKhoan = (await demTaiKhoanQuanTri(prisma)) > 0;

  async function dangNhap(formData: FormData) {
    "use server";
    const ip = layIp(await headers());
    const { biChan } = await ghiNhanTanSuat(prisma, `tim-anh-qt-dn:${ip}`, 10, 60 * 60_000);
    if (biChan) redirect("/quan-tri/dang-nhap?loi=qua-nhieu");

    const matKhau = String(formData.get("mat_khau") ?? "");
    if ((await demTaiKhoanQuanTri(prisma)) > 0) {
      const email = String(formData.get("email") ?? "");
      const tk = await kiemTraDangNhapQuanTri(prisma, email, matKhau);
      if (!tk) redirect("/quan-tri/dang-nhap?loi=sai");
      await datPhienQuanTri(tk.email);
      await ghiNhatKy(prisma, tk.email, "dang_nhap");
    } else {
      if (!dungMatKhau(matKhau)) redirect("/quan-tri/dang-nhap?loi=sai");
      await datPhienQuanTri("quan-tri");
    }
    redirect("/quan-tri");
  }

  return (
    <div className="khung">
      <div className="the" style={{ maxWidth: 420, margin: "40px auto" }}>
        <h1>Quản trị ảnh khóa học</h1>
        <p className="mo-ta">Khu vực của ban tổ chức.</p>
        {loi === "sai" && <div className="loi-hop">Thông tin đăng nhập chưa đúng.</div>}
        {loi === "qua-nhieu" && <div className="loi-hop">Thử quá nhiều lần — chờ một lát rồi thử lại.</div>}
        <form action={dangNhap}>
          {coTaiKhoan && (
            <>
              <label className="nhan-truong" htmlFor="email">Email</label>
              <input className="o-nhap" id="email" name="email" type="email" required autoFocus />
            </>
          )}
          <label className="nhan-truong" htmlFor="mat_khau">
            {coTaiKhoan ? "Mật khẩu" : "Mật khẩu quản trị (chung)"}
          </label>
          <input className="o-nhap" id="mat_khau" name="mat_khau" type="password" required autoFocus={!coTaiKhoan} />
          <div style={{ marginTop: 14 }}>
            <button className="nut" type="submit">Đăng nhập</button>
          </div>
        </form>
      </div>
    </div>
  );
}
