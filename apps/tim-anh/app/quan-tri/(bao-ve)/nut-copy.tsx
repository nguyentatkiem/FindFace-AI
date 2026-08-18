"use client";

import { useState } from "react";

/** Nút chép link vào clipboard — đổi nhãn "Đã chép ✓" trong 2 giây. */
export function NutCopy({ noiDung }: { noiDung: string }) {
  const [daChep, setDaChep] = useState(false);
  return (
    <button
      type="button"
      className="nut nut-phu nut-nho"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(noiDung);
          setDaChep(true);
          setTimeout(() => setDaChep(false), 2000);
        } catch {
          prompt("Chép link thủ công:", noiDung);
        }
      }}
    >
      {daChep ? "Đã chép ✓" : "Chép link"}
    </button>
  );
}
