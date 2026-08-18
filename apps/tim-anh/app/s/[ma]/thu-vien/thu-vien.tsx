"use client";

import { useMemo, useState } from "react";
import { LuoiAnh, anhTuApi, type AnhHienThi } from "../../../luoi-anh";

/** Thư viện học viên: chip thư mục (điều hướng bằng query ?tm=) + lưới cuộn vô hạn. */
export function ThuVien({
  ma,
  tmDangChon,
  thuMucs,
  chuaPhan,
  anhsDau,
  conNua,
  coTimMoTa = false,
  gocUrl,
}: {
  ma: string;
  tmDangChon: string; // "" tất cả · "0" chưa phân · "<id>"
  thuMucs: { id: number; ten: string; soAnh: number }[];
  chuaPhan: number;
  anhsDau: { id: number; tenTep: string; rongPx: number | null; caoPx: number | null }[];
  conNua: boolean;
  coTimMoTa?: boolean;
  gocUrl?: string; // trang mang chip lọc (mặc định /s/<ma>/thu-vien; trang sự kiện truyền /s/<ma>)
}) {
  const anhs = useMemo(() => anhsDau.map(anhTuApi), [anhsDau]);
  const [tuKhoa, setTuKhoa] = useState("");
  const [ketQuaMoTa, setKetQuaMoTa] = useState<AnhHienThi[] | null>(null);
  const [dangTimMoTa, setDangTimMoTa] = useState(false);

  async function timMoTa(e: React.FormEvent) {
    e.preventDefault();
    if (tuKhoa.trim().length < 2) return;
    setDangTimMoTa(true);
    try {
      const res = await fetch(`/api/tim-mo-ta?ma=${encodeURIComponent(ma)}&q=${encodeURIComponent(tuKhoa.trim())}`);
      if (res.ok) {
        const json = (await res.json()) as { anhs: { id: number; tenTep: string; rongPx: number | null; caoPx: number | null }[] };
        setKetQuaMoTa(json.anhs.map(anhTuApi));
      }
    } finally {
      setDangTimMoTa(false);
    }
  }
  const goc = gocUrl ?? `/s/${ma}/thu-vien`;
  const taiThemUrl = conNua
    ? `/api/thu-vien?ma=${encodeURIComponent(ma)}&tm=${encodeURIComponent(tmDangChon)}`
    : null;
  const tongAnh = thuMucs.reduce((s, t) => s + t.soAnh, 0) + chuaPhan;

  return (
    <>
      {coTimMoTa && (
        <form onSubmit={timMoTa} className="hang-nut" style={{ margin: "12px 0 0" }}>
          <input className="o-nhap" value={tuKhoa} onChange={(e) => setTuKhoa(e.target.value)}
            placeholder='Tìm theo mô tả: "trao chứng chỉ", "chụp nhóm ngoài trời"…' style={{ flex: "1 1 240px" }} />
          <button className="nut nut-phu nut-nho" type="submit" disabled={dangTimMoTa}>
            {dangTimMoTa ? "Đang tìm…" : "Tìm"}
          </button>
          {ketQuaMoTa && (
            <button className="chip" type="button" onClick={() => { setKetQuaMoTa(null); setTuKhoa(""); }}>
              ✕ Xóa tìm kiếm ({ketQuaMoTa.length})
            </button>
          )}
        </form>
      )}
      {ketQuaMoTa ? (
        ketQuaMoTa.length === 0 ? (
          <div className="the" style={{ marginTop: 12 }}>
            <p className="mo-ta" style={{ margin: 0 }}>Không thấy ảnh khớp mô tả — thử câu khác cụ thể hơn.</p>
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            <LuoiAnh ma={ma} anhsDau={ketQuaMoTa} hienTrinhChieu />
          </div>
        )
      ) : (
      <>
      {thuMucs.length > 0 && (
        <nav className="day-chip" aria-label="Thư mục ảnh">
          <a className={`chip${tmDangChon === "" ? " dang-chon" : ""}`} href={goc}>
            Tất cả <span className="dem">{tongAnh.toLocaleString("vi-VN")}</span>
          </a>
          {thuMucs.map((t) => (
            <a key={t.id} className={`chip${tmDangChon === String(t.id) ? " dang-chon" : ""}`} href={`${goc}?tm=${t.id}`}>
              {t.ten} <span className="dem">{t.soAnh.toLocaleString("vi-VN")}</span>
            </a>
          ))}
          {chuaPhan > 0 && (
            <a className={`chip${tmDangChon === "0" ? " dang-chon" : ""}`} href={`${goc}?tm=0`}>
              Chưa phân <span className="dem">{chuaPhan.toLocaleString("vi-VN")}</span>
            </a>
          )}
        </nav>
      )}
      {anhs.length === 0 ? (
        <div className="the" style={{ marginTop: 12 }}>
          <p className="mo-ta" style={{ margin: 0 }}>
            Chưa có ảnh trong mục này — ảnh đang được xử lý dần, quay lại sau ít phút nhé.
          </p>
        </div>
      ) : (
        <div style={{ marginTop: thuMucs.length > 0 ? 0 : 12 }}>
          <LuoiAnh ma={ma} anhsDau={anhs} taiThemUrl={taiThemUrl} hienTrinhChieu />
        </div>
      )}
      </>
      )}
    </>
  );
}
