-- pgvector: kiểu vector + HNSW (server cần cài extension pgvector)
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "GioiHanTanSuat" (
    "khoa" TEXT NOT NULL,
    "soLan" INTEGER NOT NULL DEFAULT 0,
    "batDauCuaSo" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GioiHanTanSuat_pkey" PRIMARY KEY ("khoa")
);

-- CreateTable
CREATE TABLE "SuKienAnh" (
    "id" SERIAL NOT NULL,
    "ma" TEXT NOT NULL,
    "ten" TEXT NOT NULL,
    "ngay" DATE NOT NULL,
    "hanXoaNgay" INTEGER NOT NULL DEFAULT 90,
    "daXoaMat" BOOLEAN NOT NULL DEFAULT false,
    "trangThai" TEXT NOT NULL DEFAULT 'hoat_dong',
    "choPhepXemTatCa" BOOLEAN NOT NULL DEFAULT true,
    "watermark" BOOLEAN NOT NULL DEFAULT false,
    "taoLuc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuKienAnh_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnhSuKien" (
    "id" SERIAL NOT NULL,
    "suKienId" INTEGER NOT NULL,
    "thuMucId" INTEGER,
    "tenTep" TEXT NOT NULL,
    "duongDan" TEXT NOT NULL,
    "rongPx" INTEGER,
    "caoPx" INTEGER,
    "soMat" INTEGER NOT NULL DEFAULT 0,
    "doNet" DOUBLE PRECISION,
    "doSang" DOUBLE PRECISION,
    "canhBaoChatLuong" BOOLEAN NOT NULL DEFAULT false,
    "dHash" TEXT,
    "clipEmb" vector(512),
    "trangThai" TEXT NOT NULL DEFAULT 'cho_chi_muc',
    "loi" TEXT,
    "taoLuc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chiMucLuc" TIMESTAMP(3),

    CONSTRAINT "AnhSuKien_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThuMucAnh" (
    "id" SERIAL NOT NULL,
    "suKienId" INTEGER NOT NULL,
    "ten" TEXT NOT NULL,
    "thuTu" INTEGER NOT NULL DEFAULT 0,
    "taoLuc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThuMucAnh_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KhuonMat" (
    "id" SERIAL NOT NULL,
    "anhId" INTEGER NOT NULL,
    "suKienId" INTEGER NOT NULL,
    "bbox" JSONB NOT NULL,
    "diemPhatHien" DOUBLE PRECISION NOT NULL,
    "embedding" vector(512),
    "cumId" INTEGER,

    CONSTRAINT "KhuonMat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlbumCaNhan" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "suKienId" INTEGER NOT NULL,
    "emb" vector(512),
    "lienHe" TEXT,
    "soAnh" INTEGER NOT NULL DEFAULT 0,
    "taoLuc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capNhatLuc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlbumCaNhan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnhAlbum" (
    "albumId" INTEGER NOT NULL,
    "anhId" INTEGER NOT NULL,
    "diem" DOUBLE PRECISION NOT NULL,
    "daBao" BOOLEAN NOT NULL DEFAULT false,
    "taoLuc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnhAlbum_pkey" PRIMARY KEY ("albumId","anhId")
);

-- CreateTable
CREATE TABLE "CumKhuonMat" (
    "id" SERIAL NOT NULL,
    "suKienId" INTEGER NOT NULL,
    "soMat" INTEGER NOT NULL DEFAULT 0,
    "soAnh" INTEGER NOT NULL DEFAULT 0,
    "matDaiDienId" INTEGER,

    CONSTRAINT "CumKhuonMat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaiKhoanQuanTri" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "hoTen" TEXT NOT NULL,
    "matKhau" TEXT NOT NULL,
    "vaiTro" TEXT NOT NULL DEFAULT 'phu',
    "taoLuc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaiKhoanQuanTri_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NhatKyQuanTri" (
    "id" BIGSERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "hanhDong" TEXT NOT NULL,
    "chiTiet" JSONB,
    "luc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NhatKyQuanTri_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LuotTaiAnh" (
    "id" BIGSERIAL NOT NULL,
    "suKienId" INTEGER NOT NULL,
    "anhId" INTEGER,
    "loai" TEXT NOT NULL,
    "soAnh" INTEGER NOT NULL DEFAULT 1,
    "luc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LuotTaiAnh_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LuotTimAnh" (
    "id" SERIAL NOT NULL,
    "suKienId" INTEGER NOT NULL,
    "soMatSelfie" INTEGER NOT NULL,
    "soAnhTra" INTEGER NOT NULL,
    "taoLuc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LuotTimAnh_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GioiHanTanSuat_batDauCuaSo_idx" ON "GioiHanTanSuat"("batDauCuaSo");

-- CreateIndex
CREATE UNIQUE INDEX "SuKienAnh_ma_key" ON "SuKienAnh"("ma");

-- CreateIndex
CREATE UNIQUE INDEX "AnhSuKien_duongDan_key" ON "AnhSuKien"("duongDan");

-- CreateIndex
CREATE INDEX "AnhSuKien_suKienId_trangThai_idx" ON "AnhSuKien"("suKienId", "trangThai");

-- CreateIndex
CREATE INDEX "AnhSuKien_suKienId_thuMucId_idx" ON "AnhSuKien"("suKienId", "thuMucId");

-- CreateIndex
CREATE INDEX "ThuMucAnh_suKienId_idx" ON "ThuMucAnh"("suKienId");

-- CreateIndex
CREATE UNIQUE INDEX "ThuMucAnh_suKienId_ten_key" ON "ThuMucAnh"("suKienId", "ten");

-- CreateIndex
CREATE INDEX "KhuonMat_suKienId_idx" ON "KhuonMat"("suKienId");

-- CreateIndex
CREATE INDEX "KhuonMat_anhId_idx" ON "KhuonMat"("anhId");

-- CreateIndex
CREATE INDEX "KhuonMat_cumId_idx" ON "KhuonMat"("cumId");

-- CreateIndex
CREATE UNIQUE INDEX "AlbumCaNhan_token_key" ON "AlbumCaNhan"("token");

-- CreateIndex
CREATE INDEX "AlbumCaNhan_suKienId_idx" ON "AlbumCaNhan"("suKienId");

-- CreateIndex
CREATE INDEX "AnhAlbum_anhId_idx" ON "AnhAlbum"("anhId");

-- CreateIndex
CREATE INDEX "CumKhuonMat_suKienId_idx" ON "CumKhuonMat"("suKienId");

-- CreateIndex
CREATE UNIQUE INDEX "TaiKhoanQuanTri_email_key" ON "TaiKhoanQuanTri"("email");

-- CreateIndex
CREATE INDEX "NhatKyQuanTri_luc_idx" ON "NhatKyQuanTri"("luc");

-- CreateIndex
CREATE INDEX "LuotTaiAnh_suKienId_luc_idx" ON "LuotTaiAnh"("suKienId", "luc");

-- CreateIndex
CREATE INDEX "LuotTaiAnh_suKienId_anhId_idx" ON "LuotTaiAnh"("suKienId", "anhId");

-- CreateIndex
CREATE INDEX "LuotTimAnh_suKienId_idx" ON "LuotTimAnh"("suKienId");

-- AddForeignKey
ALTER TABLE "AnhSuKien" ADD CONSTRAINT "AnhSuKien_suKienId_fkey" FOREIGN KEY ("suKienId") REFERENCES "SuKienAnh"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnhSuKien" ADD CONSTRAINT "AnhSuKien_thuMucId_fkey" FOREIGN KEY ("thuMucId") REFERENCES "ThuMucAnh"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThuMucAnh" ADD CONSTRAINT "ThuMucAnh_suKienId_fkey" FOREIGN KEY ("suKienId") REFERENCES "SuKienAnh"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KhuonMat" ADD CONSTRAINT "KhuonMat_anhId_fkey" FOREIGN KEY ("anhId") REFERENCES "AnhSuKien"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KhuonMat" ADD CONSTRAINT "KhuonMat_cumId_fkey" FOREIGN KEY ("cumId") REFERENCES "CumKhuonMat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlbumCaNhan" ADD CONSTRAINT "AlbumCaNhan_suKienId_fkey" FOREIGN KEY ("suKienId") REFERENCES "SuKienAnh"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnhAlbum" ADD CONSTRAINT "AnhAlbum_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "AlbumCaNhan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnhAlbum" ADD CONSTRAINT "AnhAlbum_anhId_fkey" FOREIGN KEY ("anhId") REFERENCES "AnhSuKien"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CumKhuonMat" ADD CONSTRAINT "CumKhuonMat_suKienId_fkey" FOREIGN KEY ("suKienId") REFERENCES "SuKienAnh"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LuotTaiAnh" ADD CONSTRAINT "LuotTaiAnh_suKienId_fkey" FOREIGN KEY ("suKienId") REFERENCES "SuKienAnh"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LuotTimAnh" ADD CONSTRAINT "LuotTimAnh_suKienId_fkey" FOREIGN KEY ("suKienId") REFERENCES "SuKienAnh"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Chỉ mục HNSW cosine cho tìm mặt + tìm mô tả CLIP
CREATE INDEX "KhuonMat_embedding_hnsw" ON "KhuonMat" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX "AnhSuKien_clipEmb_hnsw" ON "AnhSuKien" USING hnsw ("clipEmb" vector_cosine_ops);
-- Hàng chờ chỉ mục: partial index tí hon, poll O(8)
CREATE INDEX "AnhSuKien_hang_cho_idx" ON "AnhSuKien"("id") WHERE "trangThai" = 'cho_chi_muc';
