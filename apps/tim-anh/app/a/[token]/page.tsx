import { revalidatePath } from "next/cache";
import { capNhatLienHeAlbum, layAlbumTheoToken, prisma } from "@anh/db";
import { LuoiAnh } from "../../luoi-anh";
import { kyAnh } from "@/lib/chu-ky-anh";

/**
 * Album cá nhân của học viên — link riêng theo token, quay lại xem không cần selfie lại.
 * Ảnh chụp bổ sung tự nạp vào (khi sự kiện còn hạn sinh trắc); có email thì được báo.
 */
export default async function TrangAlbum({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const kq = await layAlbumTheoToken(prisma, token);

  if (!kq) {
    return (
      <div className="khung">
        <div className="the">
          <h1>Không tìm thấy album</h1>
          <p className="mo-ta">Link album không đúng hoặc album đã bị xóa cùng sự kiện.</p>
          <a className="nut nut-phu" href="/">Về trang chủ</a>
        </div>
      </div>
    );
  }
  const { album, conCapNhat, anhs } = kq;

  async function luuEmail(formData: FormData) {
    "use server";
    try {
      await capNhatLienHeAlbum(prisma, token, String(formData.get("lien_he") ?? ""));
    } catch {
      // email xấu → giữ nguyên, trang không đổi
    }
    revalidatePath(`/a/${token}`);
  }

  return (
    <div className="khung">
      <div className="hero" style={{ minHeight: 150 }}>
        {anhs[0] && (
          <img className="phu" alt="" aria-hidden
            src={`/api/anh/${anhs[0].id}/thumb?ma=${encodeURIComponent(album.suKien.ma)}&k=1600&s=${kyAnh(anhs[0].id, album.suKien.ma)}`} />
        )}
        <div className="lop" />
        <div className="noi-dung">
          <h1>Album của bạn · {album.suKien.ten}</h1>
          <div className="meta">
            {anhs.length.toLocaleString("vi-VN")} ảnh ·{" "}
            {conCapNhat
              ? "ảnh mới chụp sẽ tự xuất hiện ở đây"
              : "album đã chốt (hết hạn cập nhật theo cam kết riêng tư)"}
          </div>
          <div className="hanh-dong">
            {anhs.length > 0 && (
              <form method="post" action="/api/tai-goi">
                <input type="hidden" name="ma" value={album.suKien.ma} />
                <input type="hidden" name="ids" value={anhs.slice(0, 300).map((a) => a.id).join(",")} />
                <input type="hidden" name="sigs" value={anhs.slice(0, 300).map((a) => kyAnh(a.id, album.suKien.ma)).join(",")} />
                <button className="nut" type="submit">⬇ Tải cả album</button>
              </form>
            )}
            <a className="nut nut-trang" href={`/s/${album.suKien.ma}`}>Trang sự kiện</a>
          </div>
        </div>
      </div>

      {conCapNhat && (
        <div className="the">
          <form action={luuEmail} className="hang-nut">
            <span className="mo-ta" style={{ margin: 0, flex: "1 1 260px" }}>
              {album.lienHe
                ? <>Đang báo ảnh mới về <strong>{album.lienHe}</strong> — đổi email:</>
                : "Nhận email khi có ảnh mới của bạn (không bắt buộc):"}
            </span>
            <input className="o-nhap" name="lien_he" type="email" placeholder="email@cua-ban.vn"
              defaultValue={album.lienHe ?? ""} style={{ flex: "1 1 200px" }} />
            <button className="nut nut-phu nut-nho" type="submit">Lưu</button>
          </form>
          <p className="ghi-chu-phap-ly" style={{ marginBottom: 0 }}>
            Giữ link này để quay lại xem — ai có link sẽ xem được album, đừng đăng công khai.
          </p>
        </div>
      )}

      {anhs.length === 0 ? (
        <div className="the">
          <p className="mo-ta" style={{ margin: 0 }}>
            Chưa có ảnh nào — kho ảnh đang chỉ mục dần, ảnh của bạn sẽ tự xuất hiện tại đây.
          </p>
        </div>
      ) : (
        <LuoiAnh
          ma={album.suKien.ma}
          hienDiem
          hienTrinhChieu
          anhsDau={anhs.map((a) => ({
            id: a.id,
            tenTep: a.tenTep,
            diem: a.diem,
            s: kyAnh(a.id, album.suKien.ma), // sự kiện đóng thư viện vẫn xem được album của mình
            // tỉ lệ rộng/cao kẹp [0.45, 2.6] — cùng công thức anhTuApi (hàm đó thuộc file client)
            ar: Math.min(Math.max(a.rongPx && a.caoPx ? a.rongPx / a.caoPx : 1, 0.45), 2.6),
          }))}
        />
      )}
    </div>
  );
}
