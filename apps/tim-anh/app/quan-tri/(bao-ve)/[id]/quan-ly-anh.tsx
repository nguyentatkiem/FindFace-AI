"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Lưới quản lý ảnh của admin: lọc theo thư mục, chọn lô → chuyển thư mục / xóa.
 * Chỉ hiện ảnh đã chỉ mục (đã có thumbnail); ảnh đang chờ nằm ở phần tiến độ.
 */

interface AnhQl {
  id: number;
  tenTep: string;
  ar: number;
}

export function QuanLyAnh({
  ma,
  suKienId,
  thuMucs,
  chuaPhan,
}: {
  ma: string;
  suKienId: number;
  thuMucs: { id: number; ten: string; soAnh: number }[];
  chuaPhan: number;
}) {
  const router = useRouter();
  const [tm, setTm] = useState<string>(""); // "" tất cả · "0" chưa phân · "<id>"
  const [anhs, setAnhs] = useState<AnhQl[]>([]);
  const [conNua, setConNua] = useState(false);
  const [dangTai, setDangTai] = useState(true);
  const [chon, setChon] = useState<Set<number>>(new Set());
  const [dichTm, setDichTm] = useState<string>("0");
  const molRef = useRef<HTMLDivElement>(null);

  const tai = useCallback(async (sau?: number) => {
    setDangTai(true);
    try {
      const res = await fetch(`/api/quan-tri/anh?suKienId=${suKienId}&tm=${tm}${sau ? `&sau=${sau}` : ""}`);
      if (!res.ok) return;
      const json = (await res.json()) as { anhs: { id: number; tenTep: string; rongPx: number | null; caoPx: number | null }[]; conNua: boolean };
      const moi = json.anhs.map((a) => ({
        id: a.id,
        tenTep: a.tenTep,
        ar: a.rongPx && a.caoPx ? Math.min(Math.max(a.rongPx / a.caoPx, 0.45), 2.6) : 1,
      }));
      setAnhs((cu) => (sau ? [...cu, ...moi] : moi));
      setConNua(json.conNua);
    } finally {
      setDangTai(false);
    }
  }, [suKienId, tm]);

  useEffect(() => {
    setChon(new Set());
    void tai();
  }, [tai]);

  useEffect(() => {
    const moc = molRef.current;
    if (!moc || !conNua) return;
    const ob = new IntersectionObserver(
      (es) => es[0]?.isIntersecting && !dangTai && anhs.length > 0 && void tai(anhs[anhs.length - 1]!.id),
      { rootMargin: "500px" }
    );
    ob.observe(moc);
    return () => ob.disconnect();
  }, [conNua, dangTai, anhs, tai]);

  function docChon(id: number) {
    setChon((cu) => {
      const moi = new Set(cu);
      if (moi.has(id)) moi.delete(id);
      else moi.add(id);
      return moi;
    });
  }

  async function goiViec(viec: "chuyen" | "xoa") {
    const ids = [...chon];
    if (ids.length === 0) return;
    if (viec === "xoa" && !confirm(`Xóa ${ids.length} ảnh khỏi sự kiện? Ảnh upload qua web sẽ xóa cả file trên máy chủ.`)) return;
    const res = await fetch("/api/quan-tri/anh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        viec,
        suKienId,
        ids,
        thuMucId: viec === "chuyen" ? (dichTm === "0" ? null : Number(dichTm)) : undefined,
      }),
    });
    if (res.ok) {
      setChon(new Set());
      await tai();
      router.refresh(); // cập nhật số đếm chip/thẻ phía server
    }
  }

  return (
    <>
      <div className="day-chip" style={{ marginTop: 4 }}>
        <button className={`chip${tm === "" ? " dang-chon" : ""}`} type="button" onClick={() => setTm("")}>Tất cả</button>
        {thuMucs.map((t) => (
          <button key={t.id} className={`chip${tm === String(t.id) ? " dang-chon" : ""}`} type="button" onClick={() => setTm(String(t.id))}>
            {t.ten} <span className="dem">{t.soAnh}</span>
          </button>
        ))}
        <button className={`chip${tm === "0" ? " dang-chon" : ""}`} type="button" onClick={() => setTm("0")}>
          Chưa phân <span className="dem">{chuaPhan}</span>
        </button>
      </div>

      {anhs.length === 0 && !dangTai ? (
        <p className="mo-ta">Chưa có ảnh đã chỉ mục trong mục này.</p>
      ) : (
        <div className={`gp-luoi${chon.size > 0 ? " dang-chon-che-do" : ""}`}>
          {anhs.map((a) => (
            <figure
              key={a.id}
              className={`gp-o${chon.has(a.id) ? " da-chon" : ""}`}
              style={{ ["--ar" as string]: a.ar, margin: 0, flexBasis: `calc(${a.ar} * 120px)` }}
              onClick={() => docChon(a.id)}
              title={a.tenTep}
            >
              <button type="button" className="gp-chon" aria-label="Chọn ảnh" onClick={(e) => { e.stopPropagation(); docChon(a.id); }}>✓</button>
              <img src={`/api/anh/${a.id}/thumb?ma=${encodeURIComponent(ma)}`} alt={a.tenTep} loading="lazy" />
            </figure>
          ))}
        </div>
      )}
      {conNua && <div ref={molRef} style={{ textAlign: "center", padding: 14, color: "var(--mut)", fontSize: 13 }}>{dangTai ? "Đang tải…" : " "}</div>}

      {chon.size > 0 && (
        <div className="thanh-chon">
          <span className="so">{chon.size} ảnh</span>
          <select className="o-nhap" value={dichTm} onChange={(e) => setDichTm(e.target.value)}
            style={{ padding: "6px 10px", fontSize: 13, borderRadius: 999, width: "auto" }}>
            <option value="0">— Bỏ phân loại —</option>
            {thuMucs.map((t) => <option key={t.id} value={t.id}>{t.ten}</option>)}
          </select>
          <button className="nut nut-nho" type="button" onClick={() => void goiViec("chuyen")}>Chuyển thư mục</button>
          <button className="nut nut-nguy nut-nho" type="button" onClick={() => void goiViec("xoa")}>Xóa</button>
          <button className="bo" type="button" onClick={() => setChon(new Set())}>Bỏ chọn</button>
        </div>
      )}
    </>
  );
}
