"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LuoiAnh, anhTuApi, type AnhHienThi } from "../../luoi-anh";

/**
 * Luồng học viên: đồng ý điều khoản → mở camera trước → chụp 1–3 selfie → gửi tìm → lưới kết quả.
 * Selfie CHỤP TRỰC TIẾP từ camera (không cho chọn ảnh từ thư viện) — hạn chế cầm ảnh chân dung
 * người khác đi tìm hộ. Ảnh chụp chỉ gửi đi tìm rồi bỏ, server không lưu selfie.
 */

interface AnhKetQua {
  id: number;
  diem: number;
  tenTep?: string;
  rongPx?: number | null;
  caoPx?: number | null;
}

type Buoc = "dong_y" | "camera" | "dang_tim" | "ket_qua";

export function ChupSelfie({ ma, hanXoaNgay, batLiveness = false }: { ma: string; hanXoaNgay: number; batLiveness?: boolean }) {
  const [buoc, setBuoc] = useState<Buoc>("dong_y");
  const [loi, setLoi] = useState<string | null>(null);
  const [selfies, setSelfies] = useState<Blob[]>([]);
  const [xemTruoc, setXemTruoc] = useState<string[]>([]);
  const [ketQua, setKetQua] = useState<AnhHienThi[] | null>(null);
  const [albumToken, setAlbumToken] = useState<string | null>(null);
  const [dangTaoAlbum, setDangTaoAlbum] = useState(false);
  const [emailAlbum, setEmailAlbum] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const tepRef = useRef<HTMLInputElement>(null);
  const chupMayRef = useRef<HTMLInputElement>(null); // capture="user" → app CHỤP ẢNH của máy (máy cũ)
  const [coCamera, setCoCamera] = useState(false);
  const [chopFlash, setChopFlash] = useState(false);
  const [trongApp, setTrongApp] = useState<string | null>(null); // đang mở trong webview app nào

  useEffect(() => {
    const ua = navigator.userAgent;
    if (/Zalo/i.test(ua)) setTrongApp("Zalo");
    else if (/FBAN|FBAV|FB_IAB/i.test(ua)) setTrongApp("Facebook/Messenger");
    else if (/Instagram/i.test(ua)) setTrongApp("Instagram");
    else if (/TikTok|musical_ly|Bytedance/i.test(ua)) setTrongApp("TikTok");
    else if (/Line\//i.test(ua)) setTrongApp("LINE");
  }, []);

  const tatCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCoCamera(false);
  }, []);
  // Cleanup khi rời trang: đọc danh sách URL qua ref — closure cũ từng đóng băng mảng RỖNG
  // của lần render đầu nên không revoke được gì (rò object URL)
  const xemTruocRef = useRef<string[]>([]);
  xemTruocRef.current = xemTruoc;
  useEffect(() => () => { tatCamera(); xemTruocRef.current.forEach(URL.revokeObjectURL); }, [tatCamera]);

  // Gắn stream vào thẻ <video> NGAY SAU khi nó xuất hiện trong DOM (coCamera vừa bật,
  // hoặc quay lại màn camera sau khi xem kết quả) — nguồn lỗi "chụp không được" trước đây.
  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!coCamera || !video || !stream) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    const phat = () => video.play().catch(() => {});
    phat();
    video.addEventListener("loadedmetadata", phat);
    // Chó canh khung đen: 4 giây chưa có khung hình nào (webview chặn ngầm, driver kẹt…)
    // thì nói thẳng thay vì để học viên nhìn màn đen
    const canh = setTimeout(() => {
      if (video.videoWidth === 0) {
        tatCamera(); // nhả camera + lộ hàng nút dự phòng (chụp bằng app máy / chọn ảnh)
        setLoi(
          trongApp
            ? `Camera không lên hình trong ${trongApp}. Bấm ⋯ chọn "Mở bằng trình duyệt", hoặc dùng nút Chọn ảnh có sẵn.`
            : "Camera không lên hình — bấm \"📸 Chụp bằng máy ảnh của máy\" bên dưới (máy đời cũ nên dùng cách này), hoặc Chọn ảnh có sẵn."
        );
      }
    }, 4000);
    return () => {
      video.removeEventListener("loadedmetadata", phat);
      clearTimeout(canh);
    };
  }, [coCamera, buoc, trongApp]);

  /** Xin camera theo THANG ràng buộc lùi dần — một số máy Android/webview không nuốt
   *  được ràng buộc độ phân giải, thử tiếp cấu hình đơn giản hơn thay vì bó tay. */
  async function xinCamera(): Promise<MediaStream> {
    const cacMuc: MediaStreamConstraints[] = [
      { video: { facingMode: "user", width: { ideal: 1080 }, height: { ideal: 1440 } }, audio: false },
      { video: { facingMode: "user" }, audio: false },
      { video: true, audio: false },
    ];
    let loiCuoi: unknown;
    for (const muc of cacMuc) {
      try {
        return await navigator.mediaDevices.getUserMedia(muc);
      } catch (e) {
        loiCuoi = e;
        // quyền bị từ chối thì thử tiếp cũng vô ích — dừng sớm cho đỡ hỏi quyền nhiều lần
        if ((e as DOMException)?.name === "NotAllowedError") break;
      }
    }
    throw loiCuoi;
  }

  async function moCamera() {
    setLoi(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new DOMException("", "SecurityError");
      const stream = await xinCamera();
      streamRef.current = stream;
      setCoCamera(true);
      setBuoc("camera");
      // KHÔNG gắn srcObject ở đây: thẻ <video> chỉ xuất hiện sau khi React render lại
      // với coCamera=true — useEffect bên dưới gắn stream đúng thời điểm, hết cảnh
      // "khung đen, bấm chụp không ăn" do requestAnimationFrame chạy trước lượt render.
    } catch (e) {
      setBuoc("camera"); // vẫn vào màn tìm — còn đường "Chọn ảnh có sẵn"
      const ten = (e as DOMException)?.name ?? "";
      const goiYApp = trongApp
        ? ` Bạn đang mở trong ${trongApp} — hãy bấm nút ⋯ và chọn "Mở bằng trình duyệt" (Chrome/Safari).`
        : "";
      if (ten === "NotAllowedError") {
        setLoi(`Quyền camera đang bị chặn. Bấm biểu tượng 🔒 cạnh thanh địa chỉ → cho phép Camera, rồi bấm Mở camera lại.${goiYApp} Hoặc dùng nút Chọn ảnh có sẵn.`);
      } else if (ten === "NotFoundError" || ten === "OverconstrainedError") {
        setLoi("Máy này không thấy camera trước — dùng nút Chọn ảnh có sẵn bên dưới nhé.");
      } else if (ten === "NotReadableError") {
        setLoi("Camera đang bị ứng dụng khác giữ (Zoom/Meet/Camera?). Đóng ứng dụng đó rồi bấm Mở camera lại.");
      } else if (ten === "SecurityError") {
        setLoi(`Trình duyệt này chặn camera trên trang không bảo mật.${goiYApp || " Hãy mở bằng link https (quét QR chính thức)."} Hoặc dùng nút Chọn ảnh có sẵn.`);
      } else {
        setLoi(`Không mở được camera.${goiYApp} Bạn vẫn tìm được bằng nút Chọn ảnh có sẵn bên dưới.`);
      }
    }
  }

  /** Chọn 1–3 ảnh có sẵn từ máy (đường thay thế khi không dùng camera). */
  function chonTep(files: FileList | null) {
    if (!files) return;
    const anhs = [...files]
      .filter((f) => f.type.startsWith("image/") && f.size <= 8 * 1024 * 1024)
      .slice(0, 3);
    if (anhs.length === 0) return;
    setLoi(null);
    setSelfies((cu) => [...cu, ...anhs].slice(0, 3));
    setXemTruoc((cu) => [...cu, ...anhs.map((f) => URL.createObjectURL(f))].slice(0, 3));
    if (buoc === "dong_y") setBuoc("camera");
  }

  /** canvas → Blob JPEG, kèm dự phòng toDataURL cho trình duyệt cũ (toBlob null/ném lỗi). */
  function canvasRaBlob(canvas: HTMLCanvasElement, chatLuong: number): Promise<Blob | null> {
    return new Promise((xong) => {
      const duPhong = () => {
        try {
          const chuoi = canvas.toDataURL("image/jpeg", chatLuong);
          const [dau, than] = chuoi.split(",");
          if (!than || !dau?.includes("image/")) return xong(null);
          const nhi = atob(than);
          const mang = new Uint8Array(nhi.length);
          for (let i = 0; i < nhi.length; i++) mang[i] = nhi.charCodeAt(i);
          xong(new Blob([mang], { type: "image/jpeg" }));
        } catch {
          xong(null);
        }
      };
      try {
        canvas.toBlob((b) => (b ? xong(b) : duPhong()), "image/jpeg", chatLuong);
      } catch {
        duPhong();
      }
    });
  }

  function chupMotTam() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      // stream chưa chảy (camera đang khởi động / bị hệ điều hành thu hồi) — gắn lại và báo rõ
      if (video && streamRef.current) {
        video.srcObject = streamRef.current;
        video.play().catch(() => {});
      }
      setLoi("Camera đang khởi động — chờ thấy hình mình trong khung rồi bấm lại nhé.");
      return;
    }
    setLoi(null);
    setChopFlash(true);
    setTimeout(() => setChopFlash(false), 200);
    const canvas = document.createElement("canvas");
    // Thu về cạnh dài 960px — đủ cho nhận diện, gửi nhanh trên 4G
    const tiLe = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * tiLe);
    canvas.height = Math.round(video.videoHeight * tiLe);
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
    void canvasRaBlob(canvas, 0.9).then((blob) => {
      if (!blob) {
        setLoi("Máy không tạo được ảnh từ camera trong trang — bấm \"📸 Chụp bằng máy ảnh của máy\" bên dưới nhé.");
        return;
      }
      setSelfies((cu) => [...cu, blob].slice(0, 3));
      setXemTruoc((cu) => [...cu, URL.createObjectURL(blob)].slice(0, 3));
    });
  }

  function boSelfie(i: number) {
    URL.revokeObjectURL(xemTruoc[i]!);
    setSelfies((cu) => cu.filter((_, j) => j !== i));
    setXemTruoc((cu) => cu.filter((_, j) => j !== i));
  }

  /** Chụp một khung từ video thành Blob JPEG (dùng cho kiểm tra người thật). */
  function chupKhung(): Promise<Blob | null> {
    return new Promise((xong) => {
      const video = videoRef.current;
      if (!video || video.videoWidth === 0) return xong(null);
      const canvas = document.createElement("canvas");
      const tiLe = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.round(video.videoWidth * tiLe);
      canvas.height = Math.round(video.videoHeight * tiLe);
      canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => xong(b), "image/jpeg", 0.85);
    });
  }

  async function timAnh() {
    if (selfies.length === 0) return;

    // Kiểm tra người thật (khi bật): chụp 5 khung trong 2 giây, học viên quay nhẹ đầu trái–phải
    if (batLiveness && coCamera) {
      setLoi("Giữ máy, quay nhẹ đầu sang trái rồi sang phải trong 2 giây…");
      const khungs: Blob[] = [];
      for (let i = 0; i < 5; i++) {
        const k = await chupKhung();
        if (k) khungs.push(k);
        await new Promise((r) => setTimeout(r, 400));
      }
      setLoi(null);
      if (khungs.length >= 3) {
        const form = new FormData();
        khungs.forEach((k, i) => form.append("khung", k, `khung-${i}.jpg`));
        try {
          const res = await fetch("/api/song", { method: "POST", body: form });
          const json = (await res.json()) as { song?: boolean };
          if (res.ok && json.song === false) {
            setLoi("Chưa xác nhận được bạn đang ở trước camera — quay nhẹ đầu trái–phải khi bấm tìm nhé.");
            return;
          }
        } catch {
          // dịch vụ bận thì bỏ qua bước kiểm, không chặn học viên
        }
      }
    }

    const dungCam = coCamera; // nhớ trước khi tắt — lỗi thì chỉ mở lại nếu đang dùng camera
    setBuoc("dang_tim");
    setLoi(null);
    tatCamera();
    try {
      const form = new FormData();
      form.append("ma", ma);
      selfies.forEach((s, i) => form.append("selfie", s, `selfie-${i + 1}.jpg`));
      const res = await fetch("/api/tim", { method: "POST", body: form });
      const json = (await res.json()) as { anhs?: AnhKetQua[]; loi?: string };
      if (!res.ok || json.loi) {
        // mở camera TRƯỚC rồi mới đặt thông điệp — moCamera() xóa lỗi nên đặt trước sẽ bị nuốt
        setBuoc("camera");
        if (dungCam) await moCamera();
        setLoi(thongDiepLoi(json.loi ?? `HTTP_${res.status}`));
        return;
      }
      setKetQua((json.anhs ?? []).map(anhTuApi));
      setBuoc("ket_qua");
    } catch {
      setBuoc("camera");
      if (dungCam) await moCamera();
      setLoi("Mạng chập chờn, gửi ảnh không thành công — thử lại giúp mình nhé.");
    }
  }

  function lamLai() {
    xemTruoc.forEach(URL.revokeObjectURL);
    setSelfies([]);
    setXemTruoc([]);
    setKetQua(null);
    setAlbumToken(null);
    setLoi(null);
    moCamera();
  }

  // Lưu album cá nhân: gửi lại selfie ĐẦU (vẫn trong RAM trình duyệt) kèm sự đồng ý —
  // server chỉ giữ vector mặt + danh sách ảnh, không giữ selfie
  async function luuAlbum() {
    if (selfies.length === 0 || dangTaoAlbum) return;
    setDangTaoAlbum(true);
    try {
      const form = new FormData();
      form.append("ma", ma);
      form.append("selfie", selfies[0]!, "selfie.jpg");
      if (emailAlbum.trim()) form.append("lien_he", emailAlbum.trim());
      const res = await fetch("/api/album", { method: "POST", body: form });
      const json = (await res.json()) as { token?: string; loi?: string };
      if (res.ok && json.token) setAlbumToken(json.token);
      else setLoi(thongDiepLoi(json.loi ?? "LOI"));
    } catch {
      setLoi("Mạng chập chờn — thử lưu album lại nhé.");
    } finally {
      setDangTaoAlbum(false);
    }
  }

  if (buoc === "dong_y") {
    return (
      <div className="the">
        <h2>Trước khi bắt đầu</h2>
        <p className="mo-ta">
          Để tìm ảnh, hệ thống sẽ phân tích khuôn mặt trên tấm selfie bạn chụp và so với kho ảnh
          của sự kiện. Đây là dữ liệu sinh trắc học của bạn, nên cần bạn đồng ý trước:
        </p>
        <ul className="mo-ta" style={{ paddingLeft: 18, marginTop: 0 }}>
          <li>Ảnh bạn chụp/chọn chỉ dùng để tìm trong lượt này, <strong>không lưu lại</strong> trên máy chủ.</li>
          <li>Dữ liệu khuôn mặt của kho ảnh tự động xóa sau <strong>{hanXoaNgay} ngày</strong> kể từ sự kiện.</li>
          <li>Dữ liệu không dùng cho bất kỳ mục đích nào khác ngoài việc tìm ảnh của chính bạn.</li>
        </ul>
        {trongApp && (
          <div className="canh-bao">
            Bạn đang mở trong ứng dụng <strong>{trongApp}</strong> — camera hay bị chặn ở đây.
            Tốt nhất bấm nút <strong>⋯</strong> (góc màn hình) → <strong>"Mở bằng trình duyệt"</strong>;
            hoặc dùng "Chọn ảnh có sẵn".
          </div>
        )}
        {loi && <div className="loi-hop">{loi}</div>}
        <div className="hang-nut">
          <button className="nut" onClick={moCamera}>Đồng ý và mở camera</button>
          <button className="nut nut-trang" onClick={() => tepRef.current?.click()}>
            🖼 Đồng ý, chọn ảnh có sẵn
          </button>
        </div>
      </div>
    );
  }

  if (buoc === "camera" || buoc === "dang_tim") {
    const dangTim = buoc === "dang_tim";
    return (
      <div className="the">
        <h2>Chụp selfie</h2>
        <p className="mo-ta">
          Đưa mặt vào khung, đủ sáng, bỏ khẩu trang/kính râm — rồi <strong>bấm nút tròn trắng</strong> để
          chụp. Chụp 2–3 tấm ở góc hơi khác sẽ tìm được nhiều ảnh hơn.
        </p>
        {!dangTim && coCamera && (
          <div className="khung-camera">
            <video ref={videoRef} autoPlay playsInline muted />
            <div className="khung-ngam" />
            <span className="dem-chup">{selfies.length}/3 tấm</span>
            {chopFlash && <div className="chop-flash" />}
            <div className="nut-chup-wrap">
              <button
                type="button"
                className="nut-chup"
                aria-label="Chụp một tấm selfie"
                onClick={chupMotTam}
                disabled={selfies.length >= 3}
              />
              <span className="nhan-chup">
                {selfies.length === 0 ? "Bấm nút tròn để chụp" : selfies.length >= 3 ? "Đủ 3 tấm rồi" : "Chụp thêm góc khác (không bắt buộc)"}
              </span>
            </div>
          </div>
        )}
        {!dangTim && !coCamera && selfies.length === 0 && (
          <div className="o-keo-tha" onClick={() => tepRef.current?.click()}>
            Bấm để chọn 1–3 ảnh có mặt bạn từ máy<br />
            <span style={{ fontSize: 12.5 }}>(ảnh selfie/chân dung rõ mặt cho kết quả tốt nhất)</span>
          </div>
        )}
        {xemTruoc.length > 0 && (
          <div className="day-selfie">
            {xemTruoc.map((url, i) => (
              <button key={url} onClick={() => boSelfie(i)} title="Bấm để bỏ tấm này"
                style={{ border: "none", background: "none", padding: 0, cursor: "pointer" }}>
                <img src={url} alt={`Selfie ${i + 1}`} />
              </button>
            ))}
          </div>
        )}
        {loi && <div className="loi-hop">{loi}</div>}
        <div style={{ marginTop: 12 }}>
          <button className="nut nut-tim-lon" onClick={timAnh} disabled={dangTim || selfies.length === 0}>
            {dangTim
              ? "⏳ Đang tìm trong kho ảnh…"
              : selfies.length === 0
                ? "Chụp hoặc chọn ảnh trước đã nhé"
                : `🔍 Tìm ảnh của tôi ngay (${selfies.length} tấm)`}
          </button>
          <div className="hang-nut" style={{ marginTop: 10, justifyContent: "center" }}>
            {!coCamera && (
              <button className="nut nut-phu nut-nho" onClick={moCamera} disabled={dangTim}>📷 Mở camera</button>
            )}
            {!coCamera && (
              <button className="nut nut-phu nut-nho" onClick={() => chupMayRef.current?.click()}
                disabled={dangTim || selfies.length >= 3}>
                📸 Chụp bằng máy ảnh của máy
              </button>
            )}
            <button className="nut nut-trang nut-nho" onClick={() => tepRef.current?.click()}
              disabled={dangTim || selfies.length >= 3}>
              🖼 Chọn ảnh có sẵn từ máy
            </button>
          </div>
        </div>
        <input ref={tepRef} type="file" accept="image/*" multiple hidden
          onChange={(e) => { chonTep(e.target.files); e.target.value = ""; }} />
        <input ref={chupMayRef} type="file" accept="image/*" capture="user" hidden
          onChange={(e) => { chonTep(e.target.files); e.target.value = ""; }} />
      </div>
    );
  }

  // buoc === "ket_qua"
  const anhs = ketQua ?? [];
  return (
    <>
      <div className="the">
        <h2 style={{ fontSize: 20 }}>
          {anhs.length > 0 ? `Tìm thấy ${anhs.length} ảnh có bạn 🎉` : "Chưa tìm thấy ảnh nào"}
        </h2>
        {anhs.length === 0 ? (
          <p className="mo-ta">
            Có thể ảnh của bạn chụp hơi xa/nghiêng, hoặc kho ảnh đang chỉ mục chưa xong. Thử chụp lại
            selfie rõ mặt hơn, hoặc quay lại sau ít phút.
          </p>
        ) : (
          <p className="mo-ta">
            Bấm ảnh để xem lớn (phím ‹ › chuyển ảnh); tích ✓ để chọn nhiều tấm rồi tải một lần.
          </p>
        )}
        <div className="hang-nut">
          <button className="nut nut-phu" onClick={lamLai}>Chụp lại selfie</button>
          {anhs.length > 0 && (
            <form method="post" action="/api/tai-goi">
              <input type="hidden" name="ma" value={ma} />
              <input type="hidden" name="ids" value={anhs.map((a) => a.id).join(",")} />
              <input type="hidden" name="sigs" value={anhs.map((a) => a.s ?? "").join(",")} />
              <button className="nut" type="submit">⬇ Tải tất cả ({anhs.length})</button>
            </form>
          )}
        </div>
      </div>

      {anhs.length > 0 && (
        <div className="the">
          {albumToken ? (
            <>
              <h2>📒 Album của bạn đã sẵn sàng</h2>
              <p className="mo-ta">
                Mở link này bất cứ lúc nào để xem lại — ảnh chụp bổ sung của bạn sẽ tự xuất hiện,
                không cần selfie lại:
              </p>
              <div className="o-link">
                <code>{`${location.origin}/a/${albumToken}`}</code>
                <button className="nut nut-phu nut-nho" type="button"
                  onClick={() => navigator.clipboard.writeText(`${location.origin}/a/${albumToken}`)}>
                  Chép link
                </button>
              </div>
              <a className="nut" href={`/a/${albumToken}`}>Mở album của tôi</a>
            </>
          ) : (
            <>
              <h2>📒 Lưu thành album riêng của bạn?</h2>
              <p className="mo-ta">
                Bạn nhận một link cố định: quay lại xem không cần selfie, ảnh chụp bổ sung tự
                xuất hiện, và (nếu để lại email) được báo khi có ảnh mới. Hệ thống sẽ lưu MỘT
                đặc trưng khuôn mặt của bạn cho việc này, tự xóa theo hạn riêng tư của sự kiện.
              </p>
              <div className="hang-nut">
                <input className="o-nhap" type="email" placeholder="Email nhận báo ảnh mới (không bắt buộc)"
                  value={emailAlbum} onChange={(e) => setEmailAlbum(e.target.value)} style={{ flex: "1 1 220px" }} />
                <button className="nut" type="button" onClick={luuAlbum} disabled={dangTaoAlbum}>
                  {dangTaoAlbum ? "Đang tạo…" : "Đồng ý, tạo album"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {anhs.length > 0 && <LuoiAnh ma={ma} anhsDau={anhs} hienDiem />}
    </>
  );
}

function thongDiepLoi(ma: string): string {
  switch (ma) {
    case "KHONG_THAY_MAT":
      return "Không thấy khuôn mặt rõ trong selfie — chụp lại gần hơn, đủ sáng nhé.";
    case "THU_QUA_NHIEU_LAN":
      return "Bạn tìm hơi nhiều lần liên tiếp — chờ ít phút rồi thử lại.";
    case "SU_KIEN_HET_HAN":
      return "Đợt tìm ảnh của sự kiện đã kết thúc theo cam kết riêng tư.";
    case "DICH_VU_BAN":
      return "Hệ thống nhận diện đang bận, thử lại sau một lát.";
    default:
      return "Có lỗi khi tìm ảnh, thử lại giúp mình nhé.";
  }
}
