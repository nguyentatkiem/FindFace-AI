"use client";

/** Nút submit có hộp xác nhận — dùng cho các hành động xóa không hoàn tác được. */
export function NutXacNhan({
  hoi,
  lop,
  children,
}: {
  hoi: string;
  lop?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      className={lop ?? "nut nut-nguy"}
      onClick={(e) => {
        if (!confirm(hoi)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
