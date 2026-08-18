import { headers } from "next/headers";
import { anhBiaSuKien, danhSachSuKienAnh, prisma } from "@anh/db";
import { taoSuKien, xoaSuKien } from "./hanh-dong";
import { NutCopy } from "./nut-copy";
import { NutXacNhan } from "./nut-xac-nhan";

/** Màn chính quản trị: số liệu tổng + thẻ sự kiện (bìa, tiến độ, link) + tạo sự kiện. */
export default async function TrangQuanTri({
  searchParams,
}: {
  searchParams: Promise<{ loi?: string }>;
}) {
  const { loi } = await searchParams;
  const suKiens = await danhSachSuKienAnh(prisma);
  const bias = new Map(
    await Promise.all(
      suKiens.map(async (sk) => [sk.id, await anhBiaSuKien(prisma, sk.id)] as const)
    )
  );
  const h = await headers();
  const goc = process.env.TIM_ANH_URL_GOC ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3002"}`;

  const tong = suKiens.reduce(
    (s, sk) => ({ anh: s.anh + sk.tongAnh, mat: s.mat + sk.tongMat, tim: s.tim + sk.luotTim }),
    { anh: 0, mat: 0, tim: 0 }
  );

  return (
    <>
      <div className="day-so-lieu">
        <div className="o-so-lieu"><div className="nhan">Sự kiện</div><div className="gia-tri">{suKiens.length}</div></div>
        <div className="o-so-lieu"><div className="nhan">Tổng ảnh</div><div className="gia-tri">{tong.anh.toLocaleString("vi-VN")}</div></div>
        <div className="o-so-lieu"><div className="nhan">Khuôn mặt</div><div className="gia-tri">{tong.mat.toLocaleString("vi-VN")}</div></div>
        <div className="o-so-lieu"><div className="nhan">Lượt tìm</div><div className="gia-tri">{tong.tim.toLocaleString("vi-VN")}</div></div>
      </div>

      <details className="the" open={suKiens.length === 0}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>＋ Tạo sự kiện mới</summary>
        {loi && <div className="loi-hop">Không tạo được: {loi}</div>}
        <form action={taoSuKien} style={{ marginTop: 10 }}>
          <label className="nhan-truong" htmlFor="ten">Tên sự kiện / khóa học</label>
          <input className="o-nhap" id="ten" name="ten" placeholder="Khóa Marketing Dược K12" required />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <div>
              <label className="nhan-truong" htmlFor="ngay">Ngày sự kiện</label>
              <input className="o-nhap" id="ngay" name="ngay" type="date" required />
            </div>
            <div>
              <label className="nhan-truong" htmlFor="ma">Mã trong link (bỏ trống → tự sinh)</label>
              <input className="o-nhap" id="ma" name="ma" placeholder="khoa-k12" pattern="[a-z0-9][a-z0-9-]{2,30}[a-z0-9]" />
            </div>
            <div>
              <label className="nhan-truong" htmlFor="han_xoa">Xóa dữ liệu mặt sau (ngày)</label>
              <input className="o-nhap" id="han_xoa" name="han_xoa" type="number" defaultValue={90} min={1} max={3650} />
            </div>
          </div>
          <p className="ghi-chu-phap-ly">
            Vector khuôn mặt là dữ liệu sinh trắc học (Nghị định 13/2023) — hệ thống tự xóa sau số ngày trên; ảnh gốc giữ nguyên.
          </p>
          <button className="nut" type="submit">Tạo sự kiện</button>
        </form>
      </details>

      {suKiens.length === 0 ? (
        <div className="the"><p className="mo-ta" style={{ margin: 0 }}>Chưa có sự kiện nào — tạo sự kiện đầu tiên ở trên.</p></div>
      ) : (
        <div className="luoi-su-kien">
          {suKiens.map((sk) => {
            const bia = bias.get(sk.id);
            const phanTram = sk.tongAnh === 0 ? 0 : Math.round((sk.daChiMuc / sk.tongAnh) * 100);
            const link = `${goc}/s/${sk.ma}`;
            return (
              <div className="the-su-kien" key={sk.id}>
                <a className="bia" href={`/quan-tri/${sk.id}`}>
                  {bia && <img src={`/api/anh/${bia.id}/thumb?ma=${encodeURIComponent(sk.ma)}`} alt="" />}
                </a>
                <div className="than">
                  <div className="hang-nut" style={{ justifyContent: "space-between", gap: 6 }}>
                    <a className="ten" href={`/quan-tri/${sk.id}`}>{sk.ten}</a>
                    {sk.daXoaMat ? (
                      <span className="badge badge-xam">đã xóa dữ liệu mặt</span>
                    ) : sk.choChiMuc > 0 ? (
                      <span className="badge badge-vang">đang chỉ mục</span>
                    ) : (
                      <span className="badge badge-xanh">sẵn sàng</span>
                    )}
                  </div>
                  <div className="mo-ta" style={{ margin: 0 }}>
                    {sk.ngay.toLocaleDateString("vi-VN", { timeZone: "UTC" })} · {sk.tongAnh.toLocaleString("vi-VN")} ảnh
                    · {sk.tongMat.toLocaleString("vi-VN")} mặt · {sk.luotTim.toLocaleString("vi-VN")} lượt tìm
                    {sk.loiChiMuc > 0 && <span style={{ color: "var(--red)" }}> · {sk.loiChiMuc} lỗi</span>}
                  </div>
                  <div className="thanh-tien-do" title={`Đã chỉ mục ${phanTram}%`}><div style={{ width: `${phanTram}%` }} /></div>
                  <div className="hang-nut" style={{ marginTop: 4 }}>
                    <a className="nut nut-nho" href={`/quan-tri/${sk.id}`}>Quản lý</a>
                    <NutCopy noiDung={link} />
                    <a className="nut nut-trang nut-nho" href={link} target="_blank" rel="noreferrer">Mở trang học viên</a>
                    <form action={xoaSuKien} style={{ marginLeft: "auto" }}>
                      <input type="hidden" name="id" value={sk.id} />
                      <NutXacNhan lop="nut nut-nguy nut-nho" hoi={`Xóa sự kiện "${sk.ten}" cùng toàn bộ ảnh upload, vector và lượt tìm?`}>
                        Xóa
                      </NutXacNhan>
                    </form>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
