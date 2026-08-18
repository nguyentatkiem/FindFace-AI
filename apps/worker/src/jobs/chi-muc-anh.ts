/**
 * Job CHỈ MỤC ẢNH (app tim-anh): nhặt ảnh chờ trong hàng đợi → gửi dịch vụ khuôn mặt
 * (apps/dich-vu-khuon-mat, Python) lấy vector 512 chiều → lưu pgvector + sinh thumbnail.
 *
 * Mỗi ảnh còn nhận thêm: chất lượng (mờ/tối/cháy → cảnh báo cho admin duyệt), dHash
 * (gom ảnh chụp liên thanh), vector CLIP (tìm theo mô tả — khi dịch vụ bật CLIP).
 * HEIC (iPhone): dịch vụ /jpeg chuyển một lần, bản JPEG cache ở kho chuyen-doi/.
 * Xong mỗi đợt thì nạp ảnh mới vào các album cá nhân còn hạn.
 *
 * Chạy đến CẠN hàng đợi trong một lần gọi — khóa chống overlap ở index.ts; nhiều tiến
 * trình song song vẫn an toàn nhờ nhanAnhChoChiMuc dùng FOR UPDATE SKIP LOCKED.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { danhGiaChatLuongAnh } from "@anh/core";
import {
  prisma,
  capNhatCacAlbum,
  danhDauLoiChiMuc,
  duongDanChuyenDoi,
  duongDanThumb,
  laTepHeic,
  luuKetQuaChiMuc,
  nhanAnhChoChiMuc,
  thuMucChuyenDoi,
  thuMucThumb,
  traLaiAnhKet,
  type MatChiMuc,
} from "@anh/db";

const DICH_VU_URL = process.env.DICH_VU_KHUON_MAT_URL ?? "http://127.0.0.1:8100";
const RONG_THUMB = 520;

interface KetQuaVector {
  rongPx: number;
  caoPx: number;
  doNet: number;
  doSang: number;
  mats: MatChiMuc[];
  clip?: number[];
}

async function goiDichVu(duong: string, buf: Buffer, tenTep: string): Promise<Response> {
  const form = new FormData();
  form.append("anh", new Blob([new Uint8Array(buf)]), tenTep);
  const res = await fetch(`${DICH_VU_URL}${duong}`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`DICH_VU_KHUON_MAT_${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

/** dHash 64-bit: thu 9x8 xám, so cột kề nhau — ảnh liên thanh gần trùng sẽ có hash sát nhau. */
async function tinhDHash(buf: Buffer): Promise<string> {
  const { data } = await sharp(buf).rotate().grayscale().resize(9, 8, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  let hash = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      hash = (hash << 1n) | (data[y * 9 + x]! > data[y * 9 + x + 1]! ? 1n : 0n);
    }
  }
  return hash.toString(16).padStart(16, "0");
}

export async function chiMucAnh(): Promise<{ daXong: number; loi: number; soMat: number }> {
  const song = await fetch(`${DICH_VU_URL}/suc-khoe`).then((r) => r.ok).catch(() => false);
  if (!song) {
    console.warn(`[chi-muc-anh] dịch vụ khuôn mặt không phản hồi tại ${DICH_VU_URL} — bỏ qua nhịp này`);
    return { daXong: 0, loi: 0, soMat: 0 };
  }

  await traLaiAnhKet(prisma); // ảnh kẹt 'dang_chi_muc' từ lần chết giữa chừng → về hàng chờ
  await mkdir(thuMucThumb(), { recursive: true });
  await mkdir(thuMucChuyenDoi(), { recursive: true });

  let daXong = 0;
  let loi = 0;
  let soMat = 0;
  const suKienCoAnhMoi = new Set<number>();

  for (;;) {
    const lo = await nhanAnhChoChiMuc(prisma, 8);
    if (lo.length === 0) break;

    for (const anh of lo) {
      try {
        let buf = await readFile(anh.duongDan);
        if (laTepHeic(anh.tenTep)) {
          // HEIC → JPEG một lần, cache lại để trang web phát bản JPEG này
          const jpeg = Buffer.from(await (await goiDichVu("/jpeg", buf, anh.tenTep)).arrayBuffer());
          await writeFile(duongDanChuyenDoi(anh.id), new Uint8Array(jpeg));
          buf = jpeg;
        }
        const kq = (await (await goiDichVu("/vector", buf, anh.tenTep)).json()) as KetQuaVector;
        const chatLuong = danhGiaChatLuongAnh(kq.doNet, kq.doSang);
        await luuKetQuaChiMuc(prisma, anh.id, {
          ...kq,
          canhBaoChatLuong: chatLuong.canhBao,
          dHash: await tinhDHash(buf),
        });
        await sharp(buf)
          .rotate()
          .resize({ width: RONG_THUMB, withoutEnlargement: true })
          .jpeg({ quality: 78 })
          .toFile(duongDanThumb(anh.id));
        daXong += 1;
        soMat += kq.mats.length;
        suKienCoAnhMoi.add(anh.suKienId);
      } catch (e) {
        loi += 1;
        // ảnh có thể vừa bị admin XÓA giữa chừng — đánh dấu lỗi thất bại thì bỏ qua êm,
        // không để P2025 trong catch giết cả lượt chạy
        await danhDauLoiChiMuc(prisma, anh.id, e instanceof Error ? e.message : String(e)).catch(() => {});
      }
    }
    if ((daXong + loi) % 200 < 8) {
      console.log(`[chi-muc-anh] đã xử lý ${daXong + loi} ảnh (${soMat} mặt, ${loi} lỗi)…`);
    }
  }

  // Ảnh mới → nạp vào các album cá nhân còn hạn của những sự kiện vừa có ảnh
  for (const suKienId of suKienCoAnhMoi) {
    const kq = await capNhatCacAlbum(prisma, suKienId);
    if (kq.soAnhMoi > 0) console.log(`[chi-muc-anh] album sự kiện ${suKienId}: +${kq.soAnhMoi} ảnh mới`);
  }

  return { daXong, loi, soMat };
}
