import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ghiNhanTanSuat, donGioiHanCu } from "../src/gioi-han-tan-suat.service";
import { prismaTest, resetDb, dongKetNoi } from "./helper";

beforeEach(resetDb);
afterAll(dongKetNoi);

describe("ghiNhanTanSuat — đếm tần suất atomic ở Postgres", () => {
  it("đếm tăng dần, chặn khi VƯỢT giới hạn (không phải khi bằng)", async () => {
    const gioiHan = 3;
    const r1 = await ghiNhanTanSuat(prismaTest, "k1", gioiHan, 60_000);
    const r2 = await ghiNhanTanSuat(prismaTest, "k1", gioiHan, 60_000);
    const r3 = await ghiNhanTanSuat(prismaTest, "k1", gioiHan, 60_000);
    const r4 = await ghiNhanTanSuat(prismaTest, "k1", gioiHan, 60_000);
    expect([r1.soLan, r2.soLan, r3.soLan, r4.soLan]).toEqual([1, 2, 3, 4]);
    expect(r3.biChan).toBe(false); // lần thứ 3 = đúng giới hạn, chưa chặn
    expect(r4.biChan).toBe(true); // lần thứ 4 vượt → chặn
  });

  it("khóa khác nhau đếm độc lập", async () => {
    await ghiNhanTanSuat(prismaTest, "a", 2, 60_000);
    await ghiNhanTanSuat(prismaTest, "a", 2, 60_000);
    const b = await ghiNhanTanSuat(prismaTest, "b", 2, 60_000);
    expect(b.soLan).toBe(1);
    expect(b.biChan).toBe(false);
  });

  it("cửa sổ hết hạn → reset về 1 (không chặn vĩnh viễn)", async () => {
    // cửa sổ 0ms: mỗi lần gọi coi như cửa sổ mới → luôn soLan=1, không bao giờ chặn
    const r1 = await ghiNhanTanSuat(prismaTest, "k2", 1, 0);
    const r2 = await ghiNhanTanSuat(prismaTest, "k2", 1, 0);
    expect(r1.soLan).toBe(1);
    expect(r2.soLan).toBe(1);
    expect(r2.biChan).toBe(false);
  });

  it("nhiều request ĐỒNG THỜI cùng khóa → đếm không mất (atomic)", async () => {
    const kq = await Promise.all(
      Array.from({ length: 10 }, () => ghiNhanTanSuat(prismaTest, "dua", 100, 60_000))
    );
    const soLans = kq.map((r) => r.soLan).sort((a, b) => a - b);
    // 10 request atomic → đúng các giá trị 1..10, không trùng, không mất
    expect(soLans).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe("donGioiHanCu — dọn bản ghi ngoài cửa sổ", () => {
  it("xoá bản ghi cũ quá hạn, giữ bản ghi mới", async () => {
    await prismaTest.gioiHanTanSuat.create({
      data: { khoa: "cu", soLan: 1, batDauCuaSo: new Date(Date.now() - 2 * 86_400_000) },
    });
    await ghiNhanTanSuat(prismaTest, "moi", 5, 60_000);

    const soDon = await donGioiHanCu(prismaTest, 86_400_000); // quá hạn > 1 ngày
    expect(soDon).toBe(1);
    expect(await prismaTest.gioiHanTanSuat.findUnique({ where: { khoa: "cu" } })).toBeNull();
    expect(await prismaTest.gioiHanTanSuat.findUnique({ where: { khoa: "moi" } })).not.toBeNull();
  });
});
