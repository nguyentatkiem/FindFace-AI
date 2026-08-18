import { describe, expect, it } from "vitest";
import { boDauTiengViet, danhGiaChatLuongAnh, gopKetQuaTim, khoangCachHamming, laGanTrung, laMaSuKienHopLe, taoMaSuKien } from "./tim-anh";

describe("tìm ảnh khuôn mặt — gộp kết quả & mã sự kiện", () => {
  it("gộp nhiều selfie: mỗi ảnh lấy điểm CAO NHẤT, sắp giảm dần theo điểm", () => {
    const lan1 = [
      { anhId: 1, diem: 0.62 },
      { anhId: 2, diem: 0.45 },
    ];
    const lan2 = [
      { anhId: 2, diem: 0.71 }, // cao hơn lần 1 → giữ 0.71
      { anhId: 3, diem: 0.5 },
    ];
    expect(gopKetQuaTim([lan1, lan2])).toEqual([
      { anhId: 2, diem: 0.71 },
      { anhId: 1, diem: 0.62 },
      { anhId: 3, diem: 0.5 },
    ]);
  });

  it("hòa điểm → id nhỏ đứng trước (thứ tự ổn định); cắt đúng giới hạn", () => {
    const kq = gopKetQuaTim([[
      { anhId: 9, diem: 0.5 },
      { anhId: 3, diem: 0.5 },
      { anhId: 5, diem: 0.9 },
    ]], 2);
    expect(kq).toEqual([
      { anhId: 5, diem: 0.9 },
      { anhId: 3, diem: 0.5 },
    ]);
  });

  it("không có lần khớp nào → danh sách rỗng", () => {
    expect(gopKetQuaTim([])).toEqual([]);
    expect(gopKetQuaTim([[], []])).toEqual([]);
  });

  it("bỏ dấu tiếng Việt đủ cả đ/Đ", () => {
    expect(boDauTiengViet("Khóa Đào tạo Marketing Dược")).toBe("khoa dao tao marketing duoc");
    expect(boDauTiengViet("Lễ tổng kết")).toBe("le tong ket");
  });

  it("sinh mã sự kiện: slug không dấu + hậu tố; tên rỗng vẫn ra mã hợp lệ", () => {
    expect(taoMaSuKien("Khóa Marketing 2026", "x7k2")).toBe("khoa-marketing-2026-x7k2");
    expect(taoMaSuKien("!!!", "ab12")).toBe("su-kien-ab12");
    expect(laMaSuKienHopLe(taoMaSuKien("Tên RẤT dài " + "a".repeat(50), "zz99"))).toBe(true);
  });

  it("kiểm mã sự kiện: chặn ký tự lạ, quá ngắn, gạch nối ở mép", () => {
    expect(laMaSuKienHopLe("khoa-mkt-25")).toBe(true);
    expect(laMaSuKienHopLe("ab")).toBe(false);
    expect(laMaSuKienHopLe("-khoa")).toBe(false);
    expect(laMaSuKienHopLe("khoa-")).toBe(false);
    expect(laMaSuKienHopLe("Khoa MKT")).toBe(false);
    expect(laMaSuKienHopLe("a".repeat(33))).toBe(false);
  });
});

describe("tìm ảnh — chất lượng ảnh & dHash liên thanh", () => {
  it("đánh giá chất lượng: tối/cháy xét trước mờ; ảnh đạt không cảnh báo", () => {
    expect(danhGiaChatLuongAnh(200, 120)).toEqual({ canhBao: false, lyDo: null });
    expect(danhGiaChatLuongAnh(10, 120)).toEqual({ canhBao: true, lyDo: "mo" });
    expect(danhGiaChatLuongAnh(200, 20)).toEqual({ canhBao: true, lyDo: "toi" });
    expect(danhGiaChatLuongAnh(200, 245)).toEqual({ canhBao: true, lyDo: "chay" });
    expect(danhGiaChatLuongAnh(10, 20).lyDo).toBe("toi"); // tối lấn át mờ (mờ vì tối)
  });

  it("hamming: 0 khi trùng, đếm đúng bit khác, khác độ dài coi như xa hẳn", () => {
    expect(khoangCachHamming("ff00", "ff00")).toBe(0);
    expect(khoangCachHamming("0000", "0001")).toBe(1);
    expect(khoangCachHamming("0000", "000f")).toBe(4);
    expect(khoangCachHamming("00", "0000")).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("gần trùng theo ngưỡng 6 bit; thiếu hash thì không gom", () => {
    expect(laGanTrung("aaaaaaaaaaaaaaaa", "aaaaaaaaaaaaaaab")).toBe(true); // lệch 2 bit? a^b=1011 → kiểm
    expect(laGanTrung("0000000000000000", "00000000000000ff")).toBe(false); // lệch 8 bit
    expect(laGanTrung(null, "aa")).toBe(false);
  });
});
