import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Test tích hợp chạm DB thật → chạy TUẦN TỰ, DB test riêng
    fileParallelism: false,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    hookTimeout: 30_000,
    testTimeout: 30_000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://maros:maros_dev_2026@localhost:5432/anh_khoa_hoc_test",
      NODE_ENV: "test",
    },
  },
});
