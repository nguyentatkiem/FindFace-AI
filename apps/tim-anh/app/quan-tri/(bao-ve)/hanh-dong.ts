"use server";

import { readdir, rm, unlink } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  capNhatSuKien,
  dangKyAnh,
  danhSachDuongDanAnh,
  doiTenThuMuc,
  duongDanThumb,
  laTepAnh,
  prisma,
  taoSuKienAnh,
  taoThuMuc,
  thuMucAnhGoc,
  xoaSuKienAnh,
  xoaThuMuc,
} from "@anh/db";
import { coPhienQuanTri, emailPhienQuanTri, xoaPhienQuanTri } from "@/lib/quan-tri-auth";
import {
  ghiNhatKy,
  gomCumKhuonMat,
  taoTaiKhoanQuanTri,
  xoaTaiKhoanQuanTri,
} from "@anh/db";

/** Mọi action đều tự kiểm phiên — action là endpoint công khai, không dựa mỗi layout. */
async function batBuocPhien(): Promise<string> {
  const email = await emailPhienQuanTri();
  if (!email) redirect("/quan-tri/dang-nhap");
  return email;
}

export async function taoSuKien(formData: FormData): Promise<void> {
  const nguoiLam = await batBuocPhien();
  const ten = String(formData.get("ten") ?? "");
  const ngay = String(formData.get("ngay") ?? "");
  const ma = String(formData.get("ma") ?? "").trim().toLowerCase() || undefined;
  const hanXoaNgay = Number(formData.get("han_xoa") ?? 90);
  let suKienId: number;
  try {
    const sk = await taoSuKienAnh(prisma, { ten, ngay, ma, hanXoaNgay });
    suKienId = sk.id;
  } catch (e) {
    // Prisma trùng unique = mã P2002 (message bắt đầu bằng "\nInvalid `prisma..." — startsWith("Unique") không bao giờ đúng)
    const loi = (e as { code?: string }).code === "P2002" ? "MA_TRUNG" : (e as Error).message;
    redirect(`/quan-tri?loi=${encodeURIComponent(loi.slice(0, 60))}`);
  }
  await ghiNhatKy(prisma, nguoiLam, "tao_su_kien", { suKienId: suKienId! });
  revalidatePath("/quan-tri");
  redirect(`/quan-tri/${suKienId!}`);
}

export async function xoaSuKien(formData: FormData): Promise<void> {
  const nguoiLam = await batBuocPhien();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) redirect("/quan-tri");

  // Dọn file TRƯỚC khi xóa bản ghi: thumbnail mọi ảnh + ảnh gốc do web upload (nằm trong kho
  // quản lý). Ảnh đồng bộ từ thư mục NGOÀI kho (máy nhiếp ảnh gia) giữ nguyên — không phải của mình.
  const anhs = await danhSachDuongDanAnh(prisma, id);
  const khoGoc = thuMucAnhGoc(id);
  const { duongDanChuyenDoi, duongDanThumb1600 } = await import("@anh/db");
  for (const anh of anhs) {
    await unlink(duongDanThumb(anh.id)).catch(() => {});
    await unlink(duongDanThumb1600(anh.id)).catch(() => {});
    await unlink(duongDanChuyenDoi(anh.id)).catch(() => {});
    if (anh.duongDan.startsWith(khoGoc)) await unlink(anh.duongDan).catch(() => {});
  }
  await rm(khoGoc, { recursive: true, force: true }).catch(() => {});
  await xoaSuKienAnh(prisma, id);
  await ghiNhatKy(prisma, nguoiLam, "xoa_su_kien", { suKienId: id, soAnh: anhs.length });
  revalidatePath("/quan-tri");
  redirect("/quan-tri");
}

/**
 * Đăng ký toàn bộ ảnh trong một thư mục trên máy chủ vào hàng chờ chỉ mục.
 * Mỗi thư mục con CẤP MỘT tự thành một "thư mục" trong sự kiện (Buổi sáng, Lễ trao…);
 * tệp nằm ngay gốc thì vào "chưa phân". Chạy lại không nhân đôi.
 */
export async function dongBoThuMuc(formData: FormData): Promise<void> {
  await batBuocPhien();
  const suKienId = Number(formData.get("id"));
  const thuMuc = String(formData.get("thu_muc") ?? "").trim();
  if (!Number.isInteger(suKienId) || !path.isAbsolute(thuMuc)) {
    redirect(`/quan-tri/${suKienId}?loi=${encodeURIComponent("Cần đường dẫn tuyệt đối của thư mục ảnh")}`);
  }

  let daThem = 0;
  let boQua = 0;
  try {
    const quetTepTrong = async (goc: string): Promise<{ tenTep: string; duongDan: string }[]> => {
      const muc = await readdir(goc, { withFileTypes: true, recursive: true });
      return muc
        .filter((m) => m.isFile() && laTepAnh(m.name))
        .map((m) => ({ tenTep: m.name, duongDan: path.join(m.parentPath, m.name) }));
    };

    const capMot = await readdir(thuMuc, { withFileTypes: true });
    const tepGoc = capMot
      .filter((m) => m.isFile() && laTepAnh(m.name))
      .map((m) => ({ tenTep: m.name, duongDan: path.join(thuMuc, m.name) }));
    if (tepGoc.length > 0) {
      const kq = await dangKyAnh(prisma, suKienId, tepGoc);
      daThem += kq.daThem;
      boQua += kq.boQua;
    }
    for (const m of capMot.filter((m) => m.isDirectory())) {
      const teps = await quetTepTrong(path.join(thuMuc, m.name));
      if (teps.length === 0) continue;
      const tm = await taoThuMuc(prisma, suKienId, m.name);
      const kq = await dangKyAnh(prisma, suKienId, teps, tm.id);
      daThem += kq.daThem;
      boQua += kq.boQua;
    }
  } catch {
    redirect(`/quan-tri/${suKienId}?loi=${encodeURIComponent("Không đọc được thư mục — kiểm tra đường dẫn")}`);
  }
  if (daThem + boQua === 0) {
    redirect(`/quan-tri/${suKienId}?loi=${encodeURIComponent("Thư mục không có tệp ảnh (jpg/png/webp)")}`);
  }

  revalidatePath(`/quan-tri/${suKienId}`);
  redirect(`/quan-tri/${suKienId}?dong_bo=${daThem}-${boQua}`);
}

// ---- Thư mục trong sự kiện ----

export async function taoThuMucHanhDong(formData: FormData): Promise<void> {
  await batBuocPhien();
  const suKienId = Number(formData.get("id"));
  const ten = String(formData.get("ten") ?? "");
  if (ten.trim()) await taoThuMuc(prisma, suKienId, ten);
  revalidatePath(`/quan-tri/${suKienId}`);
  redirect(`/quan-tri/${suKienId}`);
}

export async function doiTenThuMucHanhDong(formData: FormData): Promise<void> {
  await batBuocPhien();
  const suKienId = Number(formData.get("id"));
  const thuMucId = Number(formData.get("thu_muc_id"));
  const ten = String(formData.get("ten") ?? "");
  if (ten.trim()) await doiTenThuMuc(prisma, thuMucId, ten);
  revalidatePath(`/quan-tri/${suKienId}`);
  redirect(`/quan-tri/${suKienId}`);
}

export async function xoaThuMucHanhDong(formData: FormData): Promise<void> {
  await batBuocPhien();
  const suKienId = Number(formData.get("id"));
  const thuMucId = Number(formData.get("thu_muc_id"));
  await xoaThuMuc(prisma, thuMucId); // ảnh không mất — chỉ về "chưa phân"
  revalidatePath(`/quan-tri/${suKienId}`);
  redirect(`/quan-tri/${suKienId}`);
}

/** Bật/tắt cho học viên duyệt TOÀN BỘ thư viện (ngoài tìm bằng selfie). */
export async function batTatThuVien(formData: FormData): Promise<void> {
  await batBuocPhien();
  const suKienId = Number(formData.get("id"));
  const bat = String(formData.get("bat")) === "1";
  await capNhatSuKien(prisma, suKienId, { choPhepXemTatCa: bat });
  revalidatePath(`/quan-tri/${suKienId}`);
  redirect(`/quan-tri/${suKienId}`);
}

/** Đưa các ảnh lỗi về hàng chờ để worker chỉ mục lại (sau khi sửa nguyên nhân). */
export async function chiMucLaiLoi(formData: FormData): Promise<void> {
  await batBuocPhien();
  const suKienId = Number(formData.get("id"));
  await prisma.anhSuKien.updateMany({
    where: { suKienId, trangThai: "loi" },
    data: { trangThai: "cho_chi_muc", loi: null },
  });
  revalidatePath(`/quan-tri/${suKienId}`);
  redirect(`/quan-tri/${suKienId}`);
}

/** Xóa vector sinh trắc NGAY (trước hạn) — sự kiện dừng tìm kiếm, ảnh gốc giữ nguyên. */
export async function xoaVectorNgay(formData: FormData): Promise<void> {
  const nguoiLam = await batBuocPhien();
  const suKienId = Number(formData.get("id"));
  await prisma.$transaction([
    prisma.khuonMat.deleteMany({ where: { suKienId } }),
    prisma.suKienAnh.update({ where: { id: suKienId }, data: { daXoaMat: true } }),
    prisma.$executeRaw`UPDATE "AlbumCaNhan" SET "emb" = NULL WHERE "suKienId" = ${suKienId}`,
  ]);
  await ghiNhatKy(prisma, nguoiLam, "xoa_vector_ngay", { suKienId });
  revalidatePath(`/quan-tri/${suKienId}`);
  redirect(`/quan-tri/${suKienId}`);
}

export async function dangXuat(): Promise<void> {
  await xoaPhienQuanTri();
  redirect("/quan-tri/dang-nhap");
}


/** Bật/tắt watermark (đóng mờ tên sự kiện) lên ảnh xem lớn + ảnh tải về. */
export async function batTatWatermark(formData: FormData): Promise<void> {
  const nguoiLam = await batBuocPhien();
  const suKienId = Number(formData.get("id"));
  const bat = String(formData.get("bat")) === "1";
  await prisma.suKienAnh.update({ where: { id: suKienId }, data: { watermark: bat } });
  await ghiNhatKy(prisma, nguoiLam, bat ? "bat_watermark" : "tat_watermark", { suKienId });
  revalidatePath(`/quan-tri/${suKienId}`);
  redirect(`/quan-tri/${suKienId}`);
}

/** Gom cụm khuôn mặt NGAY (ngoài nhịp 03:00 hằng đêm). */
export async function gomCumNgay(formData: FormData): Promise<void> {
  await batBuocPhien();
  const suKienId = Number(formData.get("id"));
  await gomCumKhuonMat(prisma, suKienId);
  revalidatePath(`/quan-tri/${suKienId}`);
  redirect(`/quan-tri/${suKienId}#nhan-vat`);
}

// ---- Tài khoản quản trị ----

export async function taoTaiKhoan(formData: FormData): Promise<void> {
  const nguoiLam = await batBuocPhien();
  try {
    const tk = await taoTaiKhoanQuanTri(prisma, {
      email: String(formData.get("email") ?? ""),
      hoTen: String(formData.get("ho_ten") ?? ""),
      matKhau: String(formData.get("mat_khau") ?? ""),
      vaiTro: String(formData.get("vai_tro") ?? "phu"),
    });
    await ghiNhatKy(prisma, nguoiLam, "tao_tai_khoan", { email: tk.email, vaiTro: tk.vaiTro });
  } catch (e) {
    redirect(`/quan-tri/tai-khoan?loi=${encodeURIComponent((e as Error).message.slice(0, 60))}`);
  }
  revalidatePath("/quan-tri/tai-khoan");
  redirect("/quan-tri/tai-khoan");
}

export async function xoaTaiKhoan(formData: FormData): Promise<void> {
  const nguoiLam = await batBuocPhien();
  try {
    const tk = await xoaTaiKhoanQuanTri(prisma, Number(formData.get("id")));
    await ghiNhatKy(prisma, nguoiLam, "xoa_tai_khoan", { email: tk.email });
  } catch (e) {
    redirect(`/quan-tri/tai-khoan?loi=${encodeURIComponent((e as Error).message.slice(0, 60))}`);
  }
  revalidatePath("/quan-tri/tai-khoan");
  redirect("/quan-tri/tai-khoan");
}

// ---- Nhập ảnh từ Google Drive (thư mục chia sẻ công khai, cần env GOOGLE_API_KEY) ----

export async function nhapTuDrive(formData: FormData): Promise<void> {
  const nguoiLam = await batBuocPhien();
  const suKienId = Number(formData.get("id"));
  const link = String(formData.get("link") ?? "").trim();
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    redirect(`/quan-tri/${suKienId}?loi=${encodeURIComponent("Chưa đặt env GOOGLE_API_KEY — xem docs/tim-anh.md mục Google Drive")}`);
  }
  const folderId = /folders\/([\w-]+)/.exec(link)?.[1] ?? /[?&]id=([\w-]+)/.exec(link)?.[1];
  if (!folderId) {
    redirect(`/quan-tri/${suKienId}?loi=${encodeURIComponent("Link Drive không đúng dạng thư mục chia sẻ")}`);
  }

  const { mkdir, writeFile } = await import("node:fs/promises");
  const thuMuc = thuMucAnhGoc(suKienId);
  await mkdir(thuMuc, { recursive: true });
  const teps: { tenTep: string; duongDan: string }[] = [];
  try {
    let pageToken = "";
    do {
      const url = new URL("https://www.googleapis.com/drive/v3/files");
      url.searchParams.set("q", `'${folderId}' in parents and mimeType contains 'image/'`);
      url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType)");
      url.searchParams.set("pageSize", "200");
      url.searchParams.set("key", apiKey!);
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const ds = await fetch(url).then((r) => r.json()) as {
        nextPageToken?: string;
        files?: { id: string; name: string }[];
        error?: { message: string };
      };
      if (ds.error) throw new Error(ds.error.message);
      for (const f of ds.files ?? []) {
        if (teps.length >= 500 || !laTepAnh(f.name)) continue;
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&key=${apiKey}`);
        if (!res.ok) continue;
        const ten = `drive-${f.id}-${path.basename(f.name)}`.replace(/[/\\:*?"<>|]/g, "_");
        const duongDan = path.join(thuMuc, ten);
        await writeFile(duongDan, new Uint8Array(await res.arrayBuffer()));
        teps.push({ tenTep: f.name, duongDan });
      }
      pageToken = ds.nextPageToken ?? "";
    } while (pageToken && teps.length < 500);
  } catch (e) {
    redirect(`/quan-tri/${suKienId}?loi=${encodeURIComponent(`Drive: ${(e as Error).message.slice(0, 80)}`)}`);
  }
  if (teps.length === 0) {
    redirect(`/quan-tri/${suKienId}?loi=${encodeURIComponent("Thư mục Drive không có ảnh (hoặc chưa chia sẻ công khai)")}`);
  }
  const kq = await dangKyAnh(prisma, suKienId, teps);
  await ghiNhatKy(prisma, nguoiLam, "nhap_drive", { suKienId, daThem: kq.daThem });
  revalidatePath(`/quan-tri/${suKienId}`);
  redirect(`/quan-tri/${suKienId}?dong_bo=${kq.daThem}-${kq.boQua}`);
}
