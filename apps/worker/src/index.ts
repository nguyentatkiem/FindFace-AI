/**
 * Worker Ảnh khóa học — 4 job nền:
 *   chi-muc-anh  mỗi phút   : chỉ mục ảnh mới (vector mặt + CLIP + thumbnail) + nạp album
 *   bao-anh-moi  10 phút    : email "bạn có thêm N ảnh" cho album có đăng ký
 *   don-tim-anh  02:30      : xóa vector sinh trắc hết hạn (Nghị định 13/2023)
 *   gom-cum      03:00      : gom cụm khuôn mặt "một người" cho admin
 * Chạy tay: pnpm --filter @anh/worker chay <ten-job>
 */
try {
  process.loadEnvFile(new URL("../.env", import.meta.url).pathname);
} catch {
  // không có .env — dùng biến môi trường sẵn có
}

import cron from "node-cron";
import { chiMucAnh } from "./jobs/chi-muc-anh";
import { donTimAnh } from "./jobs/don-tim-anh";
import { baoAnhMoi } from "./jobs/bao-anh-moi";
import { gomCum } from "./jobs/gom-cum";

async function chayJob(ten: string, thamSo?: string) {
  switch (ten) {
    case "chi-muc-anh": {
      console.log(`[chi-muc-anh] ${JSON.stringify(await chiMucAnh())}`);
      break;
    }
    case "don-tim-anh": {
      console.log(`[don-tim-anh] ${JSON.stringify(await donTimAnh())}`);
      break;
    }
    case "bao-anh-moi": {
      console.log(`[bao-anh-moi] ${JSON.stringify(await baoAnhMoi())}`);
      break;
    }
    case "gom-cum": {
      console.log(`[gom-cum] ${JSON.stringify(await gomCum(thamSo ? Number(thamSo) : undefined))}`);
      break;
    }
    default:
      throw new Error(`Job không tồn tại: ${ten}`);
  }
}

// Khóa chống chạy chồng trong cùng tiến trình (node-cron không tự chặn overlap)
const dangChay = new Map<string, boolean>();
async function chayJobCoKhoa(ten: string, thamSo?: string) {
  if (dangChay.get(ten)) {
    console.warn(`[${ten}] lần chạy trước chưa xong — bỏ qua nhịp này`);
    return;
  }
  dangChay.set(ten, true);
  try {
    await chayJob(ten, thamSo);
  } finally {
    dangChay.delete(ten);
  }
}

const [che_do, ten, thamSo] = process.argv.slice(2);

if (che_do === "chay") {
  chayJobCoKhoa(ten ?? "", thamSo)
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
} else {
  cron.schedule("* * * * *", () => chayJobCoKhoa("chi-muc-anh").catch(console.error), { timezone: "Asia/Ho_Chi_Minh" });
  cron.schedule("*/10 * * * *", () => chayJobCoKhoa("bao-anh-moi").catch(console.error), { timezone: "Asia/Ho_Chi_Minh" });
  cron.schedule("30 2 * * *", () => chayJobCoKhoa("don-tim-anh").catch(console.error), { timezone: "Asia/Ho_Chi_Minh" });
  cron.schedule("0 3 * * *", () => chayJobCoKhoa("gom-cum").catch(console.error), { timezone: "Asia/Ho_Chi_Minh" });
  console.log("Worker: Chỉ-mục-ảnh 1' · Báo-ảnh-mới 10' · Dọn-sinh-trắc 02:30 · Gom-cụm 03:00 (Asia/Ho_Chi_Minh)");
}
