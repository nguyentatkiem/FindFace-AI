"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Lưới ảnh kiểu Google Photos dùng chung cho thư viện + kết quả tìm:
 * hàng justified theo tỉ lệ ảnh thật, chọn nhiều → tải zip, lightbox phím mũi tên,
 * cuộn vô hạn khi truyền taiThemUrl (API trả {anhs, conNua}).
 */

export interface AnhHienThi {
  id: number;
  ar: number; // tỉ lệ rộng/cao — quyết định bề rộng ô trong hàng justified
  tenTep?: string;
  diem?: number; // % khớp (chỉ ở kết quả tìm selfie)
  s?: string; // chữ ký mở ảnh — bắt buộc khi sự kiện đóng thư viện
}

export function anhTuApi(a: { id: number; tenTep?: string; rongPx?: number | null; caoPx?: number | null; diem?: number; s?: string }): AnhHienThi {
  const ar = a.rongPx && a.caoPx ? a.rongPx / a.caoPx : 1;
  return { id: a.id, ar: Math.min(Math.max(ar, 0.45), 2.6), tenTep: a.tenTep, diem: a.diem, s: a.s };
}

export function LuoiAnh({
  ma,
  anhsDau,
  taiThemUrl,
  hienDiem = false,
  hienTrinhChieu = false,
}: {
  ma: string;
  anhsDau: AnhHienThi[];
  taiThemUrl?: string | null; // ví dụ /api/thu-vien?ma=x&tm=2 — component tự nối &sau=
  hienDiem?: boolean;
  hienTrinhChieu?: boolean;
}) {
  const [anhs, setAnhs] = useState<AnhHienThi[]>(anhsDau);
  const [conNua, setConNua] = useState(Boolean(taiThemUrl));
  const [dangTai, setDangTai] = useState(false);
  const [chon, setChon] = useState<Set<number>>(new Set());
  const [xem, setXem] = useState<number | null>(null); // index trong anhs
  const [trinhChieu, setTrinhChieu] = useState(false);
  const molRef = useRef<HTMLDivElement>(null);

  // đổi bộ ảnh đầu (chuyển thư mục) → reset
  useEffect(() => {
    setAnhs(anhsDau);
    setConNua(Boolean(taiThemUrl));
    setChon(new Set());
  }, [anhsDau, taiThemUrl]);

  const taiThem = useCallback(async () => {
    if (!taiThemUrl || dangTai || !conNua || anhs.length === 0) return;
    setDangTai(true);
    try {
      const res = await fetch(`${taiThemUrl}&sau=${anhs[anhs.length - 1]!.id}`);
      if (!res.ok) { setConNua(false); return; }
      const json = (await res.json()) as { anhs: { id: number; tenTep: string; rongPx: number | null; caoPx: number | null }[]; conNua: boolean };
      setAnhs((cu) => [...cu, ...json.anhs.map(anhTuApi)]);
      setConNua(json.conNua);
    } finally {
      setDangTai(false);
    }
  }, [taiThemUrl, dangTai, conNua, anhs]);

  // cuộn vô hạn
  useEffect(() => {
    const moc = molRef.current;
    if (!moc || !taiThemUrl) return;
    const ob = new IntersectionObserver((es) => es[0]?.isIntersecting && void taiThem(), { rootMargin: "600px" });
    ob.observe(moc);
    return () => ob.disconnect();
  }, [taiThem, taiThemUrl]);

  // trình chiếu: tự sang ảnh mỗi 3.5s, hết thì quay đầu
  useEffect(() => {
    if (!trinhChieu || xem === null) return;
    const nhip = setInterval(() => {
      setXem((i) => (i === null ? 0 : i + 1 >= anhs.length ? 0 : i + 1));
      void taiThem();
    }, 3500);
    return () => clearInterval(nhip);
  }, [trinhChieu, xem, anhs.length, taiThem]);

  // phím lightbox
  useEffect(() => {
    if (xem === null) return;
    const phim = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setXem(null); setTrinhChieu(false); }
      if (e.key === "ArrowLeft") setXem((i) => (i !== null && i > 0 ? i - 1 : i));
      if (e.key === "ArrowRight") {
        setXem((i) => (i !== null && i < anhs.length - 1 ? i + 1 : i));
        if (xem >= anhs.length - 3) void taiThem();
      }
    };
    window.addEventListener("keydown", phim);
    return () => window.removeEventListener("keydown", phim);
  }, [xem, anhs.length, taiThem]);

  function docChon(id: number) {
    setChon((cu) => {
      const moi = new Set(cu);
      if (moi.has(id)) moi.delete(id);
      else moi.add(id);
      return moi;
    });
  }

  const theoId = new Map(anhs.map((a) => [a.id, a.s]));
  const themS = (id: number) => (theoId.get(id) ? `&s=${theoId.get(id)}` : "");
  const urlThumb = (id: number) => `/api/anh/${id}/thumb?ma=${encodeURIComponent(ma)}${themS(id)}`;
  const urlLon = (id: number) => `/api/anh/${id}/thumb?ma=${encodeURIComponent(ma)}&k=1600${themS(id)}`;
  const urlTai = (id: number) => `/api/anh/${id}/goc?ma=${encodeURIComponent(ma)}&tai=1${themS(id)}`;
  const anhXem = xem !== null ? anhs[xem] : undefined;

  return (
    <>
      {hienTrinhChieu && anhs.length > 1 && (
        <div className="hang-nut" style={{ margin: "0 0 10px" }}>
          <button className="chip" type="button" onClick={() => { setXem(0); setTrinhChieu(true); }}>
            ▶ Trình chiếu
          </button>
        </div>
      )}
      <div className={`gp-luoi${chon.size > 0 ? " dang-chon-che-do" : ""}`}>
        {anhs.map((a, i) => (
          <figure
            key={a.id}
            className={`gp-o${chon.has(a.id) ? " da-chon" : ""}`}
            style={{ ["--ar" as string]: a.ar, margin: 0 }}
            onClick={() => (chon.size > 0 ? docChon(a.id) : setXem(i))}
          >
            <button
              type="button"
              className="gp-chon"
              aria-label="Chọn ảnh"
              onClick={(e) => { e.stopPropagation(); docChon(a.id); }}
            >
              ✓
            </button>
            <img src={urlThumb(a.id)} alt={a.tenTep ?? `Ảnh ${a.id}`} loading="lazy" />
            {hienDiem && a.diem !== undefined && <figcaption className="diem">{Math.round(a.diem * 100)}%</figcaption>}
          </figure>
        ))}
      </div>
      {taiThemUrl && conNua && (
        <div ref={molRef} style={{ textAlign: "center", padding: 18, color: "var(--mut)", fontSize: 13.5 }}>
          {dangTai ? "Đang tải thêm…" : " "}
        </div>
      )}

      {chon.size > 0 && (
        <div className="thanh-chon">
          <span className="so">{chon.size} ảnh đã chọn</span>
          <form method="post" action="/api/tai-goi" style={{ display: "inline" }}>
            <input type="hidden" name="ma" value={ma} />
            <input type="hidden" name="ids" value={[...chon].join(",")} />
            <input type="hidden" name="sigs" value={[...chon].map((id) => theoId.get(id) ?? "").join(",")} />
            <button className="nut nut-nho" type="submit">Tải xuống</button>
          </form>
          <button className="bo" type="button" onClick={() => setChon(new Set())}>Bỏ chọn</button>
        </div>
      )}

      {anhXem && (
        <div className="lb-phu" role="dialog" aria-label={anhXem.tenTep ?? "Xem ảnh"}>
          <div className="lb-tren">
            <button className="lb-nut" type="button" aria-label="Đóng"
              onClick={() => { setXem(null); setTrinhChieu(false); }}>←</button>
            <div className="ten">
              {anhXem.tenTep ?? `Ảnh ${anhXem.id}`}
              {hienDiem && anhXem.diem !== undefined ? ` · khớp ${Math.round(anhXem.diem * 100)}%` : ""}
              {` · ${xem! + 1}/${anhs.length}`}
            </div>
            <div className="gian" />
            <button className="lb-nut" type="button" title={trinhChieu ? "Dừng trình chiếu" : "Trình chiếu"}
              aria-label="Trình chiếu" onClick={() => setTrinhChieu(!trinhChieu)}>{trinhChieu ? "⏸" : "▶"}</button>
            <a className="lb-nut" href={urlTai(anhXem.id)} aria-label="Tải ảnh gốc" title="Tải ảnh gốc">⬇</a>
          </div>
          <div className="lb-giua" onClick={() => { setXem(null); setTrinhChieu(false); }}>
            <img src={urlLon(anhXem.id)} alt={anhXem.tenTep ?? ""} onClick={(e) => e.stopPropagation()} />
            {xem! > 0 && (
              <button className="lb-truoc" type="button" aria-label="Ảnh trước"
                onClick={(e) => { e.stopPropagation(); setXem(xem! - 1); }}>‹</button>
            )}
            {xem! < anhs.length - 1 && (
              <button className="lb-sau" type="button" aria-label="Ảnh sau"
                onClick={(e) => { e.stopPropagation(); setXem(xem! + 1); if (xem! >= anhs.length - 3) void taiThem(); }}>›</button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
