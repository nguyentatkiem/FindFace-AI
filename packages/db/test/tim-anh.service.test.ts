import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  dangKyAnh,
  danhDauLoiChiMuc,
  danhSachSuKienAnh,
  ghiLuotTim,
  layAnhTheoMaSuKien,
  laySuKienTheoMa,
  luuKetQuaChiMuc,
  nhanAnhChoChiMuc,
  taoSuKienAnh,
  thongKeSuKien,
  timAnhTheoVector,
  traLaiAnhKet,
  xoaDuLieuMatHetHan,
  xoaSuKienAnh,
} from "../src/tim-anh.service";
import { dongKetNoi, prismaTest, resetDb, stt } from "./helper";

beforeEach(resetDb);
afterAll(dongKetNoi);

// ---- Vector giả lập: trục cơ sở + vector "gần" có cosine biết trước — kiểm được ngưỡng chính xác ----

/** Vector 512 chiều chuẩn hóa L2 từ các cặp [chỉ số, giá trị]. */
function vec(...dau: [number, number][]): number[] {
  const v = new Array<number>(512).fill(0);
  for (const [i, gia] of dau) v[i] = gia;
  const chuan = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map((x) => x / chuan);
}
/** Trục cơ sở thứ i — "một người" riêng biệt. */
const truc = (i: number) => vec([i, 1]);
/** Vector lệch khỏi trục i với cosine đúng bằng `muc` (mặc định 0.9 — cùng người, khác góc chụp). */
const gan = (i: number, muc = 0.9) => vec([i, muc], [(i + 137) % 512, Math.sqrt(1 - muc * muc)]);

async function taoSuKienTest(over: { ngay?: string; hanXoaNgay?: number } = {}) {
  const n = stt();
  return taoSuKienAnh(prismaTest, {
    ten: `Khóa test ${n}`,
    ngay: over.ngay ?? "2026-08-01",
    ma: `khoa-test-${n}`,
    hanXoaNgay: over.hanXoaNgay,
  });
}

/** Đăng ký 1 ảnh + chỉ mục xong với các vector cho trước; trả về id ảnh. */
async function taoAnhDaChiMuc(suKienId: number, tenTep: string, vectors: number[][]) {
  await dangKyAnh(prismaTest, suKienId, [{ tenTep, duongDan: `/kho/${suKienId}/${tenTep}` }]);
  const anh = await prismaTest.anhSuKien.findFirstOrThrow({ where: { suKienId, tenTep } });
  await luuKetQuaChiMuc(prismaTest, anh.id, {
    rongPx: 4000,
    caoPx: 3000,
    mats: vectors.map((v, i) => ({ bbox: [i * 10, 0, i * 10 + 100, 120], diem: 0.9, vector: v })),
  });
  return anh.id;
}

describe("taoSuKienAnh — tạo sự kiện & mã", () => {
  it("mã tự sinh từ tên (bỏ dấu) khi không truyền; mã hợp lệ và tra lại được", async () => {
    const sk = await taoSuKienAnh(prismaTest, { ten: "Khóa Đào tạo Marketing", ngay: "2026-08-10" });
    expect(sk.ma).toMatch(/^khoa-dao-tao-marketing-[0-9a-f]{4}$/);
    expect((await laySuKienTheoMa(prismaTest, sk.ma))?.id).toBe(sk.id);
    expect(sk.hanXoaNgay).toBe(90); // mặc định 90 ngày cho dữ liệu sinh trắc
  });

  it("chặn mã sai định dạng, ngày sai, hạn xóa ngoài khoảng, mã trùng", async () => {
    await expect(taoSuKienAnh(prismaTest, { ten: "A B", ngay: "2026-08-10", ma: "Mã Có Dấu" })).rejects.toThrow(
      "MA_SU_KIEN_KHONG_HOP_LE"
    );
    await expect(taoSuKienAnh(prismaTest, { ten: "A B", ngay: "10/08/2026" })).rejects.toThrow("NGAY_SAI_DINH_DANG");
    await expect(
      taoSuKienAnh(prismaTest, { ten: "A B", ngay: "2026-08-10", hanXoaNgay: 0 })
    ).rejects.toThrow("HAN_XOA_NGOAI_KHOANG");
    await taoSuKienAnh(prismaTest, { ten: "A", ngay: "2026-08-10", ma: "trung-ma" });
    await expect(taoSuKienAnh(prismaTest, { ten: "B", ngay: "2026-08-11", ma: "trung-ma" })).rejects.toThrow();
  });
});

describe("dangKyAnh + hàng chờ chỉ mục", () => {
  it("đăng ký trùng đường dẫn thì bỏ qua êm — đồng bộ lại thư mục không nhân đôi", async () => {
    const sk = await taoSuKienTest();
    const teps = [
      { tenTep: "a.jpg", duongDan: "/kho/1/a.jpg" },
      { tenTep: "b.jpg", duongDan: "/kho/1/b.jpg" },
    ];
    expect(await dangKyAnh(prismaTest, sk.id, teps)).toEqual({ daThem: 2, boQua: 0 });
    // lần 2: 1 tệp cũ + 1 tệp mới
    const lan2 = await dangKyAnh(prismaTest, sk.id, [teps[0]!, { tenTep: "c.jpg", duongDan: "/kho/1/c.jpg" }]);
    expect(lan2).toEqual({ daThem: 1, boQua: 1 });
    expect(await prismaTest.anhSuKien.count({ where: { suKienId: sk.id } })).toBe(3);
  });

  it("nhanAnhChoChiMuc nhặt theo lô, không nhặt lại ảnh đã nhận; traLaiAnhKet đưa về hàng chờ", async () => {
    const sk = await taoSuKienTest();
    await dangKyAnh(
      prismaTest,
      sk.id,
      [1, 2, 3].map((i) => ({ tenTep: `${i}.jpg`, duongDan: `/kho/q/${i}.jpg` }))
    );
    const lo1 = await nhanAnhChoChiMuc(prismaTest, 2);
    expect(lo1).toHaveLength(2);
    const lo2 = await nhanAnhChoChiMuc(prismaTest, 2);
    expect(lo2).toHaveLength(1); // chỉ còn 1 ảnh chưa nhận
    expect(await nhanAnhChoChiMuc(prismaTest, 2)).toHaveLength(0);

    // ảnh vừa nhận (mốc giờ mới) KHÔNG bị trả lại — worker khác đang làm dở không bị cướp
    expect(await traLaiAnhKet(prismaTest)).toBe(0);
    // giả lập worker chết 20 phút trước → 3 ảnh kẹt được giải cứu về hàng chờ
    await prismaTest.$executeRaw`UPDATE "AnhSuKien" SET "chiMucLuc" = now() - interval '20 minutes' WHERE "trangThai" = 'dang_chi_muc'`;
    expect(await traLaiAnhKet(prismaTest)).toBe(3);
    expect(await nhanAnhChoChiMuc(prismaTest, 10)).toHaveLength(3);
  });
});

describe("luuKetQuaChiMuc — ghi vector khuôn mặt", () => {
  it("lưu đủ mặt, cập nhật trạng thái/kích thước; chỉ mục LẠI thay thế trọn, không nhân đôi", async () => {
    const sk = await taoSuKienTest();
    const anhId = await taoAnhDaChiMuc(sk.id, "nhom.jpg", [truc(0), truc(1)]);

    const anh = await prismaTest.anhSuKien.findUniqueOrThrow({ where: { id: anhId } });
    expect(anh.trangThai).toBe("xong");
    expect(anh.soMat).toBe(2);
    expect(anh.rongPx).toBe(4000);
    expect(await prismaTest.khuonMat.count({ where: { anhId } })).toBe(2);

    // chỉ mục lại (ảnh sửa/xoay) → 1 mặt, không cộng dồn thành 3
    await luuKetQuaChiMuc(prismaTest, anhId, {
      rongPx: 3000,
      caoPx: 4000,
      mats: [{ bbox: [0, 0, 50, 60], diem: 0.8, vector: truc(2) }],
    });
    expect(await prismaTest.khuonMat.count({ where: { anhId } })).toBe(1);
    const sau = await prismaTest.anhSuKien.findUniqueOrThrow({ where: { id: anhId } });
    expect(sau.soMat).toBe(1);
  });

  it("ảnh không có mặt nào vẫn 'xong' với soMat=0 (ảnh phong cảnh trong album)", async () => {
    const sk = await taoSuKienTest();
    const anhId = await taoAnhDaChiMuc(sk.id, "phong-canh.jpg", []);
    const anh = await prismaTest.anhSuKien.findUniqueOrThrow({ where: { id: anhId } });
    expect(anh.trangThai).toBe("xong");
    expect(anh.soMat).toBe(0);
  });

  it("chặn vector sai chiều / chứa giá trị không hữu hạn", async () => {
    const sk = await taoSuKienTest();
    await dangKyAnh(prismaTest, sk.id, [{ tenTep: "x.jpg", duongDan: "/kho/x/x.jpg" }]);
    const anh = await prismaTest.anhSuKien.findFirstOrThrow({ where: { suKienId: sk.id } });
    await expect(
      luuKetQuaChiMuc(prismaTest, anh.id, {
        rongPx: 100,
        caoPx: 100,
        mats: [{ bbox: [0, 0, 1, 1], diem: 0.9, vector: [1, 2, 3] }],
      })
    ).rejects.toThrow("VECTOR_PHAI_512_CHIEU");
    const hong = truc(0);
    hong[5] = Number.NaN;
    await expect(
      luuKetQuaChiMuc(prismaTest, anh.id, {
        rongPx: 100,
        caoPx: 100,
        mats: [{ bbox: [0, 0, 1, 1], diem: 0.9, vector: hong }],
      })
    ).rejects.toThrow("VECTOR_GIA_TRI_KHONG_HOP_LE");
  });

  it("danhDauLoiChiMuc ghi lỗi cắt 500 ký tự", async () => {
    const sk = await taoSuKienTest();
    await dangKyAnh(prismaTest, sk.id, [{ tenTep: "l.jpg", duongDan: "/kho/l/l.jpg" }]);
    const anh = await prismaTest.anhSuKien.findFirstOrThrow({ where: { suKienId: sk.id } });
    await danhDauLoiChiMuc(prismaTest, anh.id, "x".repeat(700));
    const sau = await prismaTest.anhSuKien.findUniqueOrThrow({ where: { id: anh.id } });
    expect(sau.trangThai).toBe("loi");
    expect(sau.loi).toHaveLength(500);
  });
});

describe("timAnhTheoVector — tìm bằng cosine trên pgvector", () => {
  it("trả đúng ảnh cùng người theo thứ tự điểm giảm dần, không lộ ảnh sự kiện khác", async () => {
    const skA = await taoSuKienTest();
    const skB = await taoSuKienTest();
    // Sự kiện A: anh1 rất giống người 0; anh2 người 1; anh3 ảnh nhóm (người 0 mờ hơn + người 2)
    const anh1 = await taoAnhDaChiMuc(skA.id, "chan-dung.jpg", [gan(0, 0.95)]);
    await taoAnhDaChiMuc(skA.id, "nguoi-khac.jpg", [truc(1)]);
    const anh3 = await taoAnhDaChiMuc(skA.id, "nhom.jpg", [gan(0, 0.8), truc(2)]);
    // Sự kiện B cũng có người 0 — TUYỆT ĐỐI không được trả về khi tìm trong A
    await taoAnhDaChiMuc(skB.id, "b.jpg", [gan(0, 0.99)]);

    const kq = await timAnhTheoVector(prismaTest, skA.id, [truc(0)], { nguong: 0.5 });
    expect(kq.map((k) => k.anhId)).toEqual([anh1, anh3]);
    expect(kq[0]!.diem).toBeCloseTo(0.95, 3);
    expect(kq[1]!.diem).toBeCloseTo(0.8, 3);
    expect(kq[0]!.duongDan).toContain("chan-dung.jpg");
  });

  it("ngưỡng lọc đúng: cosine 0.8 bị loại khi ngưỡng 0.9", async () => {
    const sk = await taoSuKienTest();
    await taoAnhDaChiMuc(sk.id, "xa.jpg", [gan(0, 0.8)]);
    expect(await timAnhTheoVector(prismaTest, sk.id, [truc(0)], { nguong: 0.9 })).toHaveLength(0);
    expect(await timAnhTheoVector(prismaTest, sk.id, [truc(0)], { nguong: 0.75 })).toHaveLength(1);
  });

  it("nhiều selfie gộp lại: mỗi ảnh giữ điểm cao nhất, phủ được cả hai góc mặt", async () => {
    const sk = await taoSuKienTest();
    const anhGoc0 = await taoAnhDaChiMuc(sk.id, "goc-trai.jpg", [gan(0, 0.92)]);
    const anhGoc1 = await taoAnhDaChiMuc(sk.id, "goc-phai.jpg", [gan(1, 0.92)]);
    // selfie 1 giống trục 0, selfie 2 giống trục 1 → cả hai ảnh đều về
    const kq = await timAnhTheoVector(prismaTest, sk.id, [truc(0), truc(1)], { nguong: 0.5 });
    expect(new Set(kq.map((k) => k.anhId))).toEqual(new Set([anhGoc0, anhGoc1]));
  });

  it("không truyền vector nào → rỗng, không nổ câu SQL", async () => {
    const sk = await taoSuKienTest();
    expect(await timAnhTheoVector(prismaTest, sk.id, [])).toEqual([]);
  });
});

describe("kiểm quyền phát ảnh + nhật ký lượt tìm + thống kê", () => {
  it("layAnhTheoMaSuKien: đúng mã mới thấy ảnh — sai mã (sự kiện khác) trả null", async () => {
    const skA = await taoSuKienTest();
    const skB = await taoSuKienTest();
    const anhId = await taoAnhDaChiMuc(skA.id, "a.jpg", [truc(0)]);
    expect((await layAnhTheoMaSuKien(prismaTest, anhId, skA.ma))?.id).toBe(anhId);
    expect(await layAnhTheoMaSuKien(prismaTest, anhId, skB.ma)).toBeNull();
  });

  it("thống kê sự kiện + danh sách admin khớp số thật", async () => {
    const sk = await taoSuKienTest();
    await taoAnhDaChiMuc(sk.id, "1.jpg", [truc(0), truc(1)]);
    await dangKyAnh(prismaTest, sk.id, [{ tenTep: "2.jpg", duongDan: "/kho/t/2.jpg" }]);
    await ghiLuotTim(prismaTest, sk.id, 2, 5);

    const tk = await thongKeSuKien(prismaTest, sk.id);
    expect(tk).toMatchObject({ tongAnh: 2, daChiMuc: 1, choChiMuc: 1, tongMat: 2, luotTim: 1 });

    const ds = await danhSachSuKienAnh(prismaTest);
    const dong = ds.find((d) => d.id === sk.id)!;
    expect(dong).toMatchObject({ tongAnh: 2, daChiMuc: 1, choChiMuc: 1, tongMat: 2, luotTim: 1 });
  });
});

describe("riêng tư: xóa dữ liệu sinh trắc hết hạn (Nghị định 13/2023)", () => {
  it("chỉ xóa vector của sự kiện quá hạn; ảnh gốc và sự kiện còn nguyên; chạy lại không xóa thêm", async () => {
    const cu = await taoSuKienTest({ ngay: "2026-01-01", hanXoaNgay: 90 }); // hết hạn 01/04
    const moi = await taoSuKienTest({ ngay: "2026-08-01", hanXoaNgay: 90 });
    await taoAnhDaChiMuc(cu.id, "cu.jpg", [truc(0), truc(1)]);
    await taoAnhDaChiMuc(moi.id, "moi.jpg", [truc(2)]);

    const kq = await xoaDuLieuMatHetHan(prismaTest, new Date("2026-08-15"));
    expect(kq).toEqual({ soSuKien: 1, soMat: 2 });

    expect(await prismaTest.khuonMat.count({ where: { suKienId: cu.id } })).toBe(0);
    expect(await prismaTest.khuonMat.count({ where: { suKienId: moi.id } })).toBe(1);
    expect(await prismaTest.anhSuKien.count({ where: { suKienId: cu.id } })).toBe(1); // ảnh gốc giữ
    expect((await prismaTest.suKienAnh.findUniqueOrThrow({ where: { id: cu.id } })).daXoaMat).toBe(true);

    // idempotent: chạy lại không tìm thấy gì mới
    expect(await xoaDuLieuMatHetHan(prismaTest, new Date("2026-08-15"))).toEqual({ soSuKien: 0, soMat: 0 });
  });

  it("đúng mốc hạn: NGÀY CHÓT chưa xóa, qua ngày chót mới xóa", async () => {
    const sk = await taoSuKienTest({ ngay: "2026-05-01", hanXoaNgay: 30 }); // mốc 31/05
    await taoAnhDaChiMuc(sk.id, "m.jpg", [truc(0)]);
    expect((await xoaDuLieuMatHetHan(prismaTest, new Date("2026-05-30T23:59:59"))).soSuKien).toBe(0);
    expect((await xoaDuLieuMatHetHan(prismaTest, new Date("2026-05-31T00:00:01"))).soSuKien).toBe(1);
  });

  it("xoaSuKienAnh dọn cascade sạch ảnh + mặt + lượt tìm", async () => {
    const sk = await taoSuKienTest();
    await taoAnhDaChiMuc(sk.id, "x.jpg", [truc(0)]);
    await ghiLuotTim(prismaTest, sk.id, 1, 1);
    await xoaSuKienAnh(prismaTest, sk.id);
    expect(await prismaTest.anhSuKien.count({ where: { suKienId: sk.id } })).toBe(0);
    expect(await prismaTest.khuonMat.count({ where: { suKienId: sk.id } })).toBe(0);
    expect(await prismaTest.luotTimAnh.count({ where: { suKienId: sk.id } })).toBe(0);
  });
});

// ---- Thư mục & thư viện (nâng cấp giao diện kiểu Google Photos) ----

import {
  anhBiaSuKien,
  capNhatSuKien,
  chuyenAnhVaoThuMuc,
  danhSachAnhThuVien,
  danhSachThuMuc,
  doiTenThuMuc,
  taoThuMuc,
  xoaAnhChon,
  xoaThuMuc,
} from "../src/tim-anh.service";

describe("thư mục ảnh trong sự kiện", () => {
  it("tạo trùng tên trả về thư mục sẵn có; đếm ảnh theo thư mục + chưa phân đúng", async () => {
    const sk = await taoSuKienTest();
    const tm1 = await taoThuMuc(prismaTest, sk.id, "Buổi sáng");
    const tmTrung = await taoThuMuc(prismaTest, sk.id, "  Buổi sáng ");
    expect(tmTrung.id).toBe(tm1.id); // trim rồi mới so trùng

    await dangKyAnh(prismaTest, sk.id, [{ tenTep: "a.jpg", duongDan: "/k/tm/a.jpg" }], tm1.id);
    await dangKyAnh(prismaTest, sk.id, [{ tenTep: "b.jpg", duongDan: "/k/tm/b.jpg" }]);
    const ds = await danhSachThuMuc(prismaTest, sk.id);
    expect(ds.thuMucs).toEqual([{ id: tm1.id, ten: "Buổi sáng", soAnh: 1 }]);
    expect(ds.chuaPhan).toBe(1);
  });

  it("cùng tên thư mục ở HAI sự kiện khác nhau vẫn tạo được (unique theo sự kiện)", async () => {
    const a = await taoSuKienTest();
    const b = await taoSuKienTest();
    const tmA = await taoThuMuc(prismaTest, a.id, "Lễ trao");
    const tmB = await taoThuMuc(prismaTest, b.id, "Lễ trao");
    expect(tmA.id).not.toBe(tmB.id);
  });

  it("chuyển lô ảnh vào thư mục: bỏ qua ảnh sự kiện khác, chặn thư mục sự kiện khác", async () => {
    const sk = await taoSuKienTest();
    const khac = await taoSuKienTest();
    const anh1 = await taoAnhDaChiMuc(sk.id, "1.jpg", [truc(0)]);
    const anhKhac = await taoAnhDaChiMuc(khac.id, "x.jpg", [truc(1)]);
    const tm = await taoThuMuc(prismaTest, sk.id, "Team building");
    const tmKhac = await taoThuMuc(prismaTest, khac.id, "Khác");

    expect(await chuyenAnhVaoThuMuc(prismaTest, sk.id, [anh1, anhKhac], tm.id)).toBe(1);
    await expect(chuyenAnhVaoThuMuc(prismaTest, sk.id, [anh1], tmKhac.id)).rejects.toThrow(
      "THU_MUC_KHONG_THUOC_SU_KIEN"
    );
    // bỏ phân loại
    expect(await chuyenAnhVaoThuMuc(prismaTest, sk.id, [anh1], null)).toBe(1);
  });

  it("xóa thư mục: ảnh KHÔNG mất, chỉ về chưa phân; đổi tên hoạt động", async () => {
    const sk = await taoSuKienTest();
    const tm = await taoThuMuc(prismaTest, sk.id, "Tạm");
    await dangKyAnh(prismaTest, sk.id, [{ tenTep: "c.jpg", duongDan: "/k/tm2/c.jpg" }], tm.id);
    await doiTenThuMuc(prismaTest, tm.id, "Chính thức");
    expect((await prismaTest.thuMucAnh.findUniqueOrThrow({ where: { id: tm.id } })).ten).toBe("Chính thức");

    await xoaThuMuc(prismaTest, tm.id);
    const anh = await prismaTest.anhSuKien.findFirstOrThrow({ where: { suKienId: sk.id } });
    expect(anh.thuMucId).toBeNull();
  });
});

describe("thư viện phân trang + ảnh bìa + cập nhật sự kiện", () => {
  it("phân trang con trỏ: đủ trang, cờ conNua đúng, chỉ trả ảnh đã chỉ mục", async () => {
    const sk = await taoSuKienTest();
    for (let i = 0; i < 5; i++) await taoAnhDaChiMuc(sk.id, `p${i}.jpg`, [truc(i)]);
    await dangKyAnh(prismaTest, sk.id, [{ tenTep: "cho.jpg", duongDan: "/k/tv/cho.jpg" }]); // chưa chỉ mục

    const t1 = await danhSachAnhThuVien(prismaTest, sk.id, { soLuong: 2 });
    expect(t1.anhs).toHaveLength(2);
    expect(t1.conNua).toBe(true);
    const t2 = await danhSachAnhThuVien(prismaTest, sk.id, { soLuong: 3, sauId: t1.anhs[1]!.id });
    expect(t2.anhs).toHaveLength(3);
    expect(t2.conNua).toBe(false); // ảnh "cho.jpg" chưa chỉ mục không được tính
  });

  it("lọc theo thư mục và theo 'chưa phân' (null) ra hai tập khác nhau", async () => {
    const sk = await taoSuKienTest();
    const tm = await taoThuMuc(prismaTest, sk.id, "Sáng");
    const trong = await taoAnhDaChiMuc(sk.id, "trong.jpg", [truc(0)]);
    const ngoai = await taoAnhDaChiMuc(sk.id, "ngoai.jpg", [truc(1)]);
    await chuyenAnhVaoThuMuc(prismaTest, sk.id, [trong], tm.id);

    const theoTm = await danhSachAnhThuVien(prismaTest, sk.id, { thuMucId: tm.id });
    expect(theoTm.anhs.map((a) => a.id)).toEqual([trong]);
    const chuaPhan = await danhSachAnhThuVien(prismaTest, sk.id, { thuMucId: null });
    expect(chuaPhan.anhs.map((a) => a.id)).toEqual([ngoai]);
  });

  it("xóa lô ảnh trả về đường dẫn để dọn file; ảnh sự kiện khác không bị đụng", async () => {
    const sk = await taoSuKienTest();
    const khac = await taoSuKienTest();
    const a1 = await taoAnhDaChiMuc(sk.id, "d1.jpg", [truc(0)]);
    const aKhac = await taoAnhDaChiMuc(khac.id, "d2.jpg", [truc(1)]);

    const daXoa = await xoaAnhChon(prismaTest, sk.id, [a1, aKhac]);
    expect(daXoa.map((a) => a.id)).toEqual([a1]);
    expect(daXoa[0]!.duongDan).toContain("d1.jpg");
    expect(await prismaTest.anhSuKien.count({ where: { id: aKhac } })).toBe(1);
    expect(await prismaTest.khuonMat.count({ where: { anhId: a1 } })).toBe(0); // cascade
  });

  it("ảnh bìa = tấm nhiều mặt nhất (ảnh tập thể); sự kiện trống trả null", async () => {
    const sk = await taoSuKienTest();
    expect(await anhBiaSuKien(prismaTest, sk.id)).toBeNull();
    await taoAnhDaChiMuc(sk.id, "don.jpg", [truc(0)]);
    const nhom = await taoAnhDaChiMuc(sk.id, "nhom.jpg", [truc(1), truc(2), truc(3)]);
    expect((await anhBiaSuKien(prismaTest, sk.id))?.id).toBe(nhom);
  });

  it("capNhatSuKien đổi cờ xem thư viện + hạn xóa, chặn hạn ngoài khoảng", async () => {
    const sk = await taoSuKienTest();
    const sau = await capNhatSuKien(prismaTest, sk.id, { choPhepXemTatCa: false, hanXoaNgay: 30 });
    expect(sau.choPhepXemTatCa).toBe(false);
    expect(sau.hanXoaNgay).toBe(30);
    await expect(capNhatSuKien(prismaTest, sk.id, { hanXoaNgay: 0 })).rejects.toThrow("HAN_XOA_NGOAI_KHOANG");
  });
});

// ---- Album cá nhân · cụm khuôn mặt · tài khoản quản trị · thống kê ----

import {
  capNhatCacAlbum,
  danhDauAlbumDaBao,
  danhSachAlbumCanBao,
  danhSachAnhTheoCum,
  danhSachCum,
  gomCumKhuonMat,
  layAlbumTheoToken,
  taoAlbumCaNhan,
} from "../src/tim-anh-album.service";
import {
  danhSachNhatKy,
  demTaiKhoanQuanTri,
  ghiLuotTai,
  ghiNhatKy,
  kiemTraDangNhapQuanTri,
  taoTaiKhoanQuanTri,
  thongKeMoRong,
  xoaTaiKhoanQuanTri,
} from "../src/tim-anh-quan-tri.service";

describe("album cá nhân — tạo, xem, tự nạp ảnh mới, đóng băng theo hạn", () => {
  it("tạo album từ kết quả tìm; xem lại bằng token; token lạ trả null", async () => {
    const sk = await taoSuKienTest();
    const anh1 = await taoAnhDaChiMuc(sk.id, "a1.jpg", [gan(0, 0.95)]);
    const { token } = await taoAlbumCaNhan(prismaTest, sk.id, truc(0), [{ anhId: anh1, diem: 0.95 }], "hv@x.vn");

    const xem = await layAlbumTheoToken(prismaTest, token);
    expect(xem?.anhs.map((a) => a.id)).toEqual([anh1]);
    expect(xem?.conCapNhat).toBe(true);
    expect(await layAlbumTheoToken(prismaTest, "token-la")).toBeNull();
    await expect(taoAlbumCaNhan(prismaTest, sk.id, truc(0), [], "khong-phai-email")).rejects.toThrow(
      "EMAIL_KHONG_HOP_LE"
    );
  });

  it("ảnh MỚI chỉ mục sau khi tạo album được tự nạp; ảnh người khác thì không", async () => {
    const sk = await taoSuKienTest();
    const anhCu = await taoAnhDaChiMuc(sk.id, "cu.jpg", [gan(0, 0.95)]);
    const { token } = await taoAlbumCaNhan(prismaTest, sk.id, truc(0), [{ anhId: anhCu, diem: 0.95 }]);

    const anhMoi = await taoAnhDaChiMuc(sk.id, "moi.jpg", [gan(0, 0.9)]);
    await taoAnhDaChiMuc(sk.id, "khac.jpg", [truc(7)]); // người khác
    const kq = await capNhatCacAlbum(prismaTest, sk.id);
    expect(kq.soAnhMoi).toBe(1);

    const xem = await layAlbumTheoToken(prismaTest, token);
    expect(new Set(xem?.anhs.map((a) => a.id))).toEqual(new Set([anhCu, anhMoi]));
  });

  it("hàng chờ báo email: chỉ album có lienHe + ảnh chưa báo; đánh dấu xong thì rỗng", async () => {
    const sk = await taoSuKienTest();
    const a1 = await taoAnhDaChiMuc(sk.id, "b1.jpg", [gan(0, 0.95)]);
    const co = await taoAlbumCaNhan(prismaTest, sk.id, truc(0), [{ anhId: a1, diem: 0.95 }], "co@x.vn");
    await taoAlbumCaNhan(prismaTest, sk.id, truc(0), [{ anhId: a1, diem: 0.95 }]); // không email

    await taoAnhDaChiMuc(sk.id, "b2.jpg", [gan(0, 0.9)]);
    await capNhatCacAlbum(prismaTest, sk.id);

    const canBao = await danhSachAlbumCanBao(prismaTest);
    expect(canBao).toHaveLength(1);
    expect(canBao[0]).toMatchObject({ lienHe: "co@x.vn", soMoi: 1 });
    expect(await danhDauAlbumDaBao(prismaTest, co.id)).toBe(1);
    expect(await danhSachAlbumCanBao(prismaTest)).toHaveLength(0);
  });

  it("hết hạn sinh trắc → album đóng băng: emb null, không nạp mới, ảnh cũ vẫn xem", async () => {
    const sk = await taoSuKienTest({ ngay: "2026-01-01", hanXoaNgay: 30 });
    const a1 = await taoAnhDaChiMuc(sk.id, "f1.jpg", [gan(0, 0.95)]);
    const { token } = await taoAlbumCaNhan(prismaTest, sk.id, truc(0), [{ anhId: a1, diem: 0.95 }]);

    await xoaDuLieuMatHetHan(prismaTest, new Date("2026-08-01"));
    const xem = await layAlbumTheoToken(prismaTest, token);
    expect(xem?.conCapNhat).toBe(false);
    expect(xem?.anhs.map((a) => a.id)).toEqual([a1]);
    expect((await capNhatCacAlbum(prismaTest)).soAlbum).toBe(0); // không còn album sống để quét
  });
});

describe("gom cụm khuôn mặt", () => {
  it("cùng người (cosine cao) vào một cụm, người khác tách cụm; đếm mặt/ảnh đúng", async () => {
    const sk = await taoSuKienTest();
    const a1 = await taoAnhDaChiMuc(sk.id, "c1.jpg", [gan(0, 0.97)]);
    const a2 = await taoAnhDaChiMuc(sk.id, "c2.jpg", [gan(0, 0.93), truc(5)]); // người 0 + người 5
    await taoAnhDaChiMuc(sk.id, "c3.jpg", [truc(9)]);

    const kq = await gomCumKhuonMat(prismaTest, sk.id);
    expect(kq).toEqual({ soCum: 3, soMat: 4 });

    const cums = await danhSachCum(prismaTest, sk.id);
    expect(cums[0]).toMatchObject({ soMat: 2, soAnh: 2 }); // người 0 đứng đầu (nhiều ảnh nhất)
    expect(cums[0]!.daiDien?.anhId).toBeDefined();

    const anhCum0 = await danhSachAnhTheoCum(prismaTest, cums[0]!.id);
    expect(new Set(anhCum0.map((a) => a.id))).toEqual(new Set([a1, a2]));
  });

  it("gom LẠI không nhân đôi cụm (ghi đè trọn)", async () => {
    const sk = await taoSuKienTest();
    await taoAnhDaChiMuc(sk.id, "d1.jpg", [truc(0)]);
    await gomCumKhuonMat(prismaTest, sk.id);
    await gomCumKhuonMat(prismaTest, sk.id);
    expect(await prismaTest.cumKhuonMat.count({ where: { suKienId: sk.id } })).toBe(1);
  });
});

describe("tài khoản quản trị + nhật ký + thống kê", () => {
  it("tạo tài khoản băm scrypt; đăng nhập đúng/sai; chặn mật khẩu ngắn + email xấu", async () => {
    await taoTaiKhoanQuanTri(prismaTest, { email: "Chu@X.vn", hoTen: "Chủ", matKhau: "mat-khau-8", vaiTro: "chu" });
    expect(await demTaiKhoanQuanTri(prismaTest)).toBe(1);
    expect((await kiemTraDangNhapQuanTri(prismaTest, "chu@x.vn", "mat-khau-8"))?.vaiTro).toBe("chu");
    expect(await kiemTraDangNhapQuanTri(prismaTest, "chu@x.vn", "sai-mat-khau")).toBeNull();
    await expect(taoTaiKhoanQuanTri(prismaTest, { email: "a", hoTen: "A", matKhau: "12345678" })).rejects.toThrow(
      "EMAIL_KHONG_HOP_LE"
    );
    await expect(taoTaiKhoanQuanTri(prismaTest, { email: "b@x.vn", hoTen: "B", matKhau: "ngan" })).rejects.toThrow(
      "MAT_KHAU_QUA_NGAN"
    );
  });

  it("không xóa được tài khoản chủ cuối cùng; chủ thứ hai thì xóa được", async () => {
    const c1 = await taoTaiKhoanQuanTri(prismaTest, { email: "c1@x.vn", hoTen: "C1", matKhau: "12345678", vaiTro: "chu" });
    await expect(xoaTaiKhoanQuanTri(prismaTest, c1.id)).rejects.toThrow("KHONG_XOA_CHU_CUOI");
    const c2 = await taoTaiKhoanQuanTri(prismaTest, { email: "c2@x.vn", hoTen: "C2", matKhau: "12345678", vaiTro: "chu" });
    await xoaTaiKhoanQuanTri(prismaTest, c2.id);
    expect(await demTaiKhoanQuanTri(prismaTest)).toBe(1);
  });

  it("nhật ký ghi và đọc mới nhất trước; thống kê lượt tìm/tải khớp số", async () => {
    const sk = await taoSuKienTest();
    const anh = await taoAnhDaChiMuc(sk.id, "t1.jpg", [truc(0)]);
    await ghiNhatKy(prismaTest, "chu@x.vn", "tao_su_kien", { suKienId: sk.id });
    await ghiNhatKy(prismaTest, "chu@x.vn", "xoa_anh");
    const nk = await danhSachNhatKy(prismaTest, 10);
    expect(nk[0]!.hanhDong).toBe("xoa_anh");

    await ghiLuotTim(prismaTest, sk.id, 1, 3);
    await ghiLuotTim(prismaTest, sk.id, 1, 0);
    await ghiLuotTai(prismaTest, sk.id, "goc", { anhId: anh });
    await ghiLuotTai(prismaTest, sk.id, "goc", { anhId: anh });
    await ghiLuotTai(prismaTest, sk.id, "zip", { soAnh: 5 });

    const tk = await thongKeMoRong(prismaTest, sk.id);
    expect(tk.tongLuotTim).toBe(2);
    expect(tk.tiLeThay).toBe(0.5);
    expect(tk.tongAnhTai).toBe(7);
    expect(tk.topAnhTai[0]).toMatchObject({ anhId: anh, soLan: 2 });
    expect(tk.luotTimTheoNgay.reduce((s, n) => s + n.soLuot, 0)).toBe(2);
  });
});
