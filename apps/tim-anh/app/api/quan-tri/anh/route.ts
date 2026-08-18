import { NextRequest, NextResponse } from "next/server";
import { unlink } from "node:fs/promises";
import { chuyenAnhVaoThuMuc, danhSachAnhThuVien, duongDanChuyenDoi, duongDanThumb, duongDanThumb1600, prisma, thuMucAnhGoc, xoaAnhChon } from "@anh/db";
import { coPhienQuanTri } from "@/lib/quan-tri-auth";

/**
 * Quản trị ảnh trong sự kiện:
 *   GET  ?suKienId=&tm=&sau=            → trang ảnh đã chỉ mục (lưới quản lý)
 *   POST {viec:"chuyen", suKienId, ids, thuMucId|null}
 *   POST {viec:"xoa",    suKienId, ids} → xóa bản ghi + file thumbnail; ảnh gốc chỉ xóa
 *                                          khi nằm trong kho upload (goc/<id>/) — ảnh đồng bộ
 *                                          từ thư mục ngoài giữ nguyên trên đĩa.
 */
export async function GET(req: NextRequest) {
  if (!(await coPhienQuanTri())) return NextResponse.json({ loi: "CHUA_DANG_NHAP" }, { status: 401 });
  const q = req.nextUrl.searchParams;
  const suKienId = Number(q.get("suKienId"));
  if (!Number.isInteger(suKienId)) return NextResponse.json({ loi: "THIEU_DU_LIEU" }, { status: 422 });
  const tmRaw = q.get("tm");
  const thuMucId = tmRaw === null || tmRaw === "" ? undefined : tmRaw === "0" ? null : Number(tmRaw);
  const sauId = q.get("sau") ? Number(q.get("sau")) : undefined;

  const kq = await danhSachAnhThuVien(prisma, suKienId, { thuMucId, sauId, soLuong: 100 });
  return NextResponse.json({
    anhs: kq.anhs.map((a) => ({ id: a.id, tenTep: a.tenTep, rongPx: a.rongPx, caoPx: a.caoPx, thuMucId: a.thuMucId })),
    conNua: kq.conNua,
  });
}

export async function POST(req: NextRequest) {
  if (!(await coPhienQuanTri())) return NextResponse.json({ loi: "CHUA_DANG_NHAP" }, { status: 401 });
  const body = (await req.json()) as { viec?: string; suKienId?: number; ids?: number[]; thuMucId?: number | null };
  const suKienId = Number(body.suKienId);
  const ids = (body.ids ?? []).map(Number).filter((n) => Number.isInteger(n)).slice(0, 500);
  if (!Number.isInteger(suKienId) || ids.length === 0) {
    return NextResponse.json({ loi: "THIEU_DU_LIEU" }, { status: 422 });
  }

  if (body.viec === "chuyen") {
    const thuMucId = body.thuMucId === null || body.thuMucId === undefined ? null : Number(body.thuMucId);
    try {
      const soAnh = await chuyenAnhVaoThuMuc(prisma, suKienId, ids, thuMucId);
      return NextResponse.json({ soAnh });
    } catch (e) {
      return NextResponse.json({ loi: (e as Error).message }, { status: 422 });
    }
  }

  if (body.viec === "xoa") {
    const daXoa = await xoaAnhChon(prisma, suKienId, ids);
    const khoGoc = thuMucAnhGoc(suKienId);
    for (const anh of daXoa) {
      // dọn đủ bộ file suy diễn: thumb 520 + cache 1600 + bản JPEG chuyển từ HEIC
      await unlink(duongDanThumb(anh.id)).catch(() => {});
      await unlink(duongDanThumb1600(anh.id)).catch(() => {});
      await unlink(duongDanChuyenDoi(anh.id)).catch(() => {});
      if (anh.duongDan.startsWith(khoGoc)) await unlink(anh.duongDan).catch(() => {});
    }
    return NextResponse.json({ soAnh: daXoa.length });
  }

  return NextResponse.json({ loi: "VIEC_KHONG_HOP_LE" }, { status: 422 });
}
