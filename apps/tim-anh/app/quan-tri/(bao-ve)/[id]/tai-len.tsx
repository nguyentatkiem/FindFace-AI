"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Upload ảnh kéo-thả cho admin: chọn thư mục đích, gửi theo lô 5 tệp/lượt,
 * hiện tiến độ, xong thì refresh số liệu trang.
 */
export function TaiLen({
  suKienId,
  thuMucs,
}: {
  suKienId: number;
  thuMucs: { id: number; ten: string }[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [keoVao, setKeoVao] = useState(false);
  const [tienDo, setTienDo] = useState<string | null>(null);
  const [thuMucId, setThuMucId] = useState<string>("");

  async function gui(files: File[]) {
    const anhs = files.filter((f) => /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name));
    if (anhs.length === 0) return;
    let daGui = 0;
    let daThem = 0;
    // lô 3 tệp/lượt — ảnh điện thoại 5–8MB/tấm vẫn nằm dưới ngưỡng proxy/tunnel
    for (let i = 0; i < anhs.length; i += 3) {
      const lo = anhs.slice(i, i + 3);
      const form = new FormData();
      form.append("suKienId", String(suKienId));
      if (thuMucId) form.append("thuMucId", thuMucId);
      lo.forEach((f) => form.append("tep", f, f.name));
      const res = await fetch("/api/quan-tri/tai-len", { method: "POST", body: form });
      if (!res.ok) {
        setTienDo(`Lỗi khi gửi (${res.status}) — đã nạp ${daGui}/${anhs.length} tệp.`);
        router.refresh();
        return;
      }
      const kq = (await res.json()) as { daThem: number };
      daThem += kq.daThem;
      daGui += lo.length;
      setTienDo(`Đang gửi ${daGui}/${anhs.length} tệp…`);
    }
    setTienDo(`Xong: nạp ${daThem} ảnh mới vào hàng chờ chỉ mục.`);
    router.refresh();
  }

  return (
    <>
      {thuMucs.length > 0 && (
        <div className="hang-nut" style={{ marginBottom: 8, gap: 6 }}>
          <span className="nhan-truong" style={{ margin: 0 }}>Nạp vào:</span>
          <select className="o-nhap" value={thuMucId} onChange={(e) => setThuMucId(e.target.value)}
            style={{ padding: "6px 10px", fontSize: 13.5 }}>
            <option value="">— Chưa phân thư mục —</option>
            {thuMucs.map((t) => <option key={t.id} value={t.id}>{t.ten}</option>)}
          </select>
        </div>
      )}
      <div
        className={`o-keo-tha${keoVao ? " keo-vao" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setKeoVao(true); }}
        onDragLeave={() => setKeoVao(false)}
        onDrop={(e) => {
          e.preventDefault();
          setKeoVao(false);
          void gui([...e.dataTransfer.files]);
        }}
      >
        Kéo thả ảnh vào đây hoặc bấm để chọn<br />
        <span style={{ fontSize: 12.5 }}>(jpg/png/webp/heic — ảnh iPhone dùng thẳng, chọn được nhiều tệp)</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        multiple
        hidden
        onChange={(e) => {
          void gui([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      {tienDo && <p className="mo-ta" style={{ marginTop: 8 }}>{tienDo}</p>}
    </>
  );
}
