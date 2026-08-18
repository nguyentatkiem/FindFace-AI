import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { danhSachCum, danhSachThuMuc, prisma, thongKeMoRong, thongKeSuKien } from "@anh/db";
import {
  batTatThuVien,
  batTatWatermark,
  chiMucLaiLoi,
  dongBoThuMuc,
  gomCumNgay,
  nhapTuDrive,
  taoThuMucHanhDong,
  xoaThuMucHanhDong,
  xoaVectorNgay,
} from "../hanh-dong";
import { BieuDoLuotTim } from "./bieu-do";
import { NutCopy } from "../nut-copy";
import { NutXacNhan } from "../nut-xac-nhan";
import { QuanLyAnh } from "./quan-ly-anh";
import { TaiLen } from "./tai-len";

/** Chi tiết sự kiện: chia sẻ link/QR · thư mục & ảnh · nạp ảnh · tiến độ · riêng tư. */
export default async function TrangChiTiet({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ loi?: string; dong_bo?: string }>;
}) {
  const { id } = await params;
  const { loi, dong_bo } = await searchParams;
  const suKienId = Number(id);
  if (!Number.isInteger(suKienId)) notFound();

  const suKien = await prisma.suKienAnh.findUnique({ where: { id: suKienId } });
  if (!suKien) notFound();
  const [tk, dsThuMuc, tkMoRong, cums] = await Promise.all([
    thongKeSuKien(prisma, suKienId),
    danhSachThuMuc(prisma, suKienId),
    thongKeMoRong(prisma, suKienId),
    danhSachCum(prisma, suKienId),
  ]);

  const h = await headers();
  const goc = process.env.TIM_ANH_URL_GOC ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3002"}`;
  const linkSuKien = `${goc}/s/${suKien.ma}`;
  const linkThuVien = `${linkSuKien}/thu-vien`;
  const qrSvg = await QRCode.toString(linkSuKien, { type: "svg", margin: 1, width: 168 });

  const phanTram = tk.tongAnh === 0 ? 0 : Math.round((tk.daChiMuc / tk.tongAnh) * 100);
  const anhLoi = tk.loiChiMuc > 0
    ? await prisma.anhSuKien.findMany({ where: { suKienId, trangThai: "loi" }, take: 20, select: { tenTep: true, loi: true } })
    : [];

  return (
    <>
      <div className="the">
        <p className="mo-ta" style={{ marginTop: 0 }}><a href="/quan-tri">← Danh sách sự kiện</a></p>
        <div className="hang-nut" style={{ justifyContent: "space-between" }}>
          <h1 style={{ margin: 0 }}>{suKien.ten}</h1>
          {suKien.daXoaMat ? (
            <span className="badge badge-xam">đã xóa dữ liệu mặt</span>
          ) : tk.choChiMuc + tk.dangChiMuc > 0 ? (
            <span className="badge badge-vang">đang chỉ mục</span>
          ) : (
            <span className="badge badge-xanh">sẵn sàng</span>
          )}
        </div>
        <p className="mo-ta" style={{ marginBottom: 0 }}>
          Ngày {suKien.ngay.toLocaleDateString("vi-VN", { timeZone: "UTC" })} · mã <strong>{suKien.ma}</strong> ·
          dữ liệu mặt xóa sau {suKien.hanXoaNgay} ngày
        </p>
        {loi && <div className="loi-hop">{loi}</div>}
        {dong_bo && (
          <div className="canh-bao">
            Đồng bộ thư mục: thêm <strong>{dong_bo.split("-")[0]}</strong> ảnh mới (bỏ qua {dong_bo.split("-")[1]} đã có);
            thư mục con tự thành thư mục ảnh. Worker chỉ mục dần — xem tiến độ bên dưới.
          </div>
        )}
      </div>

      <div className="day-so-lieu">
        <div className="o-so-lieu"><div className="nhan">Tổng ảnh</div><div className="gia-tri">{tk.tongAnh.toLocaleString("vi-VN")}</div></div>
        <div className="o-so-lieu"><div className="nhan">Đã chỉ mục</div><div className="gia-tri">{tk.daChiMuc.toLocaleString("vi-VN")}<span style={{ fontSize: 14, color: "var(--mut)" }}> ({phanTram}%)</span></div></div>
        <div className="o-so-lieu"><div className="nhan">Khuôn mặt</div><div className="gia-tri">{tk.tongMat.toLocaleString("vi-VN")}</div></div>
        <div className="o-so-lieu"><div className="nhan">Lượt tìm</div><div className="gia-tri">{tk.luotTim.toLocaleString("vi-VN")}</div></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 340px) 1fr", gap: 14, alignItems: "start" }}>
        <div>
          <div className="the">
            <h2>Chia sẻ cho học viên</h2>
            <div className="qr-hop" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <div className="hang-nut" style={{ margin: "10px 0 4px" }}>
              <a className="nut nut-phu nut-nho" href={`/quan-tri/${suKienId}/in`}>🖨 Trang in A4</a>
              <a className="nut nut-phu nut-nho" href={`/quan-tri/${suKienId}/moi`}>✉ Gửi hàng loạt</a>
            </div>
            <div className="nhan-truong">Trang sự kiện (selfie tìm ảnh)</div>
            <div className="o-link"><code>{linkSuKien}</code><NutCopy noiDung={linkSuKien} /></div>
            <div className="nhan-truong">Thư viện toàn bộ ảnh</div>
            <div className="o-link"><code>{linkThuVien}</code><NutCopy noiDung={linkThuVien} /></div>
            <hr className="vach" />
            <form action={batTatThuVien} className="hang-nut">
              <input type="hidden" name="id" value={suKienId} />
              <input type="hidden" name="bat" value={suKien.choPhepXemTatCa ? "0" : "1"} />
              <span className="mo-ta" style={{ margin: 0, flex: 1 }}>
                Thư viện công khai: <strong>{suKien.choPhepXemTatCa ? "đang mở" : "đang đóng"}</strong>
              </span>
              <button className="nut nut-trang nut-nho" type="submit">
                {suKien.choPhepXemTatCa ? "Đóng thư viện" : "Mở thư viện"}
              </button>
            </form>
            <p className="ghi-chu-phap-ly">
              Đóng thư viện thì học viên chỉ tìm được ảnh của chính mình qua selfie.
            </p>
            <form action={batTatWatermark} className="hang-nut">
              <input type="hidden" name="id" value={suKienId} />
              <input type="hidden" name="bat" value={suKien.watermark ? "0" : "1"} />
              <span className="mo-ta" style={{ margin: 0, flex: 1 }}>
                Watermark ảnh phát ra: <strong>{suKien.watermark ? "đang bật" : "đang tắt"}</strong>
              </span>
              <button className="nut nut-trang nut-nho" type="submit">
                {suKien.watermark ? "Tắt watermark" : "Bật watermark"}
              </button>
            </form>
            <p className="ghi-chu-phap-ly" style={{ marginBottom: 0 }}>
              Bật thì bản xem lớn + ảnh tải về đóng mờ tên sự kiện; ảnh gốc trên máy chủ giữ sạch.
            </p>
          </div>

          <div className="the">
            <h2>Nạp ảnh</h2>
            <TaiLen suKienId={suKienId} thuMucs={dsThuMuc.thuMucs} />
            <hr className="vach" />
            <form action={dongBoThuMuc}>
              <input type="hidden" name="id" value={suKienId} />
              <label className="nhan-truong" htmlFor="thu_muc">Đồng bộ thư mục trên máy chủ (kho vạn ảnh)</label>
              <input className="o-nhap" id="thu_muc" name="thu_muc" placeholder="/Users/anh-khoa-hoc/K12" />
              <p className="ghi-chu-phap-ly">
                Thư mục con cấp một (Buổi sáng, Lễ trao…) tự thành thư mục ảnh. Ảnh giữ nguyên chỗ cũ,
                đồng bộ lại không trùng.
              </p>
              <button className="nut nut-phu nut-nho" type="submit">Đồng bộ thư mục</button>
            </form>
            <hr className="vach" />
            <form action={nhapTuDrive}>
              <input type="hidden" name="id" value={suKienId} />
              <label className="nhan-truong" htmlFor="link_drive">Hoặc nhập từ Google Drive (thư mục chia sẻ công khai)</label>
              <input className="o-nhap" id="link_drive" name="link" placeholder="https://drive.google.com/drive/folders/…" />
              <p className="ghi-chu-phap-ly">Cần env GOOGLE_API_KEY; tải tối đa 500 ảnh/lần về kho máy chủ.</p>
              <button className="nut nut-phu nut-nho" type="submit">Nhập từ Drive</button>
            </form>
          </div>

          <div className="the">
            <h2>Tiến độ & riêng tư</h2>
            <div className="thanh-tien-do"><div style={{ width: `${phanTram}%` }} /></div>
            <p className="mo-ta" style={{ marginTop: 8 }}>
              {tk.daChiMuc}/{tk.tongAnh} ảnh · {tk.choChiMuc + tk.dangChiMuc} đang chờ · {tk.loiChiMuc} lỗi
            </p>
            {tk.loiChiMuc > 0 && (
              <>
                <table className="bang" style={{ marginBottom: 10 }}>
                  <thead><tr><th>Tệp lỗi</th><th>Lý do</th></tr></thead>
                  <tbody>
                    {anhLoi.map((a, i) => (
                      <tr key={i}><td>{a.tenTep}</td><td className="mo-ta">{a.loi}</td></tr>
                    ))}
                  </tbody>
                </table>
                <form action={chiMucLaiLoi} style={{ marginBottom: 10 }}>
                  <input type="hidden" name="id" value={suKienId} />
                  <button className="nut nut-phu nut-nho" type="submit">Chỉ mục lại các ảnh lỗi</button>
                </form>
              </>
            )}
            <hr className="vach" />
            <p className="ghi-chu-phap-ly">
              Vector khuôn mặt tự xóa sau {suKien.hanXoaNgay} ngày kể từ sự kiện (job chạy đêm). Cần dừng
              sớm — ví dụ có học viên yêu cầu — thì xóa ngay; ảnh gốc giữ nguyên.
            </p>
            {!suKien.daXoaMat && (
              <form action={xoaVectorNgay}>
                <input type="hidden" name="id" value={suKienId} />
                <NutXacNhan lop="nut nut-nguy nut-nho" hoi="Xóa toàn bộ vector khuôn mặt của sự kiện ngay bây giờ? Học viên sẽ không tìm bằng selfie được nữa.">
                  Xóa dữ liệu mặt ngay
                </NutXacNhan>
              </form>
            )}
          </div>
        </div>

        <div>
        <div className="the" id="nhan-vat">
          <div className="hang-nut" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <h2 style={{ margin: 0 }}>Nhân vật trong sự kiện {cums.length > 0 && <span className="badge badge-xam">{cums.length} người</span>}</h2>
            <form action={gomCumNgay}>
              <input type="hidden" name="id" value={suKienId} />
              <button className="nut nut-phu nut-nho" type="submit">↻ Gom lại ngay</button>
            </form>
          </div>
          {cums.length === 0 ? (
            <p className="mo-ta" style={{ margin: 0 }}>
              Chưa gom cụm — bấm "Gom lại ngay" sau khi chỉ mục xong (job cũng tự chạy 03:00 hằng đêm).
              Mỗi cụm là một người; thấy ngay ai nhiều/ít ảnh.
            </p>
          ) : (
            <div className="hang-nut" style={{ gap: 12 }}>
              {cums.slice(0, 36).map((c) => (
                <figure key={c.id} style={{ margin: 0, textAlign: "center", width: 74 }}>
                  {c.daiDien ? (
                    <img src={`/api/quan-tri/mat/${c.daiDien.id}`} alt="" width={64} height={64}
                      style={{ borderRadius: "50%", objectFit: "cover", border: "2px solid var(--line)" }} />
                  ) : (
                    <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--nen-mo)", margin: "0 auto" }} />
                  )}
                  <figcaption className="mo-ta" style={{ margin: "4px 0 0", fontSize: 12 }}>{c.soAnh} ảnh</figcaption>
                </figure>
              ))}
              {cums.length > 36 && <span className="mo-ta">… +{cums.length - 36} người nữa</span>}
            </div>
          )}
        </div>

        <div className="the">
          <h2>Thống kê</h2>
          <BieuDoLuotTim duLieu={tkMoRong.luotTimTheoNgay} />
          <p className="mo-ta" style={{ margin: "6px 0 10px" }}>
            {tkMoRong.tongLuotTim.toLocaleString("vi-VN")} lượt tìm ·{" "}
            {Math.round(tkMoRong.tiLeThay * 100)}% lượt có ảnh ·{" "}
            {tkMoRong.tongAnhTai.toLocaleString("vi-VN")} ảnh đã tải về
          </p>
          {tkMoRong.topAnhTai.length > 0 && (
            <>
              <div className="nhan-truong" style={{ margin: "0 0 6px" }}>Ảnh được tải nhiều nhất</div>
              <div className="hang-nut" style={{ gap: 8 }}>
                {tkMoRong.topAnhTai.map((a) => (
                  <figure key={a.anhId} style={{ margin: 0, width: 84 }} title={`${a.tenTep} — ${a.soLan} lượt tải`}>
                    <img src={`/api/anh/${a.anhId}/thumb?ma=${encodeURIComponent(suKien.ma)}`} alt={a.tenTep}
                      style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 8 }} />
                    <figcaption className="mo-ta" style={{ fontSize: 11.5, margin: "2px 0 0", textAlign: "center" }}>{a.soLan} lượt</figcaption>
                  </figure>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="the">
          <div className="hang-nut" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <h2 style={{ margin: 0 }}>Thư mục & ảnh</h2>
            <form action={taoThuMucHanhDong} className="hang-nut" style={{ gap: 6 }}>
              <input type="hidden" name="id" value={suKienId} />
              <input className="o-nhap" name="ten" placeholder="Thư mục mới (vd Buổi sáng)" style={{ width: 200, padding: "7px 12px", fontSize: 13.5 }} />
              <button className="nut nut-phu nut-nho" type="submit">＋ Tạo</button>
            </form>
          </div>
          {dsThuMuc.thuMucs.length > 0 && (
            <div className="day-chip" style={{ marginTop: 0 }}>
              {dsThuMuc.thuMucs.map((t) => (
                <span key={t.id} className="chip" style={{ cursor: "default" }}>
                  {t.ten} <span className="dem">{t.soAnh}</span>
                  <form action={xoaThuMucHanhDong} style={{ display: "inline", marginLeft: 2 }}>
                    <input type="hidden" name="id" value={suKienId} />
                    <input type="hidden" name="thu_muc_id" value={t.id} />
                    <NutXacNhan lop="bo-chip" hoi={`Xóa thư mục "${t.ten}"? Ảnh bên trong KHÔNG mất — chỉ về "chưa phân".`}>✕</NutXacNhan>
                  </form>
                </span>
              ))}
            </div>
          )}
          <QuanLyAnh ma={suKien.ma} suKienId={suKienId} thuMucs={dsThuMuc.thuMucs} chuaPhan={dsThuMuc.chuaPhan} />
        </div>
        </div>
      </div>
    </>
  );
}
