/**
 * Biểu đồ cột SVG tự dựng (chuẩn MarOS, không thư viện ngoài): lượt tìm 14 ngày.
 * Một chuỗi duy nhất → không cần chú giải; cột mảnh bo đầu 3px; lưới chìm;
 * nhãn số chỉ đặt ở cột cao nhất; tooltip mặc định qua <title> từng cột.
 */

export function BieuDoLuotTim({ duLieu }: { duLieu: { ngay: string; soLuot: number; soThay: number }[] }) {
  // Lấp đủ 14 ngày (kể cả ngày 0 lượt) để trục thời gian không "co giãn" sai
  const homNay = new Date();
  const ngays: { ngay: string; soLuot: number; soThay: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(homNay);
    d.setDate(d.getDate() - i);
    // en-CA = YYYY-MM-DD theo giờ MÁY CHỦ — khớp date_trunc của DB; toISOString (UTC)
    // từng làm cột "hôm nay" biến mất trước 7h sáng giờ VN
    const khoa = d.toLocaleDateString("en-CA");
    const co = duLieu.find((x) => x.ngay === khoa);
    ngays.push({ ngay: khoa, soLuot: co?.soLuot ?? 0, soThay: co?.soThay ?? 0 });
  }
  const max = Math.max(1, ...ngays.map((n) => n.soLuot));

  const RONG = 560;
  const CAO = 150;
  const DAY = 24; // chỗ cho nhãn ngày
  const beRongCot = RONG / 14 - 8;
  const viTriMax = ngays.findIndex((n) => n.soLuot === max);

  return (
    <svg viewBox={`0 0 ${RONG} ${CAO + DAY}`} style={{ width: "100%", height: "auto" }} role="img"
      aria-label="Lượt tìm 14 ngày gần nhất">
      {/* lưới chìm: 3 vạch ngang */}
      {[0.25, 0.5, 0.75].map((t) => (
        <line key={t} x1={0} x2={RONG} y1={CAO * t} y2={CAO * t} stroke="var(--line)" strokeWidth={1} strokeDasharray="2 4" />
      ))}
      {ngays.map((n, i) => {
        const caoCot = Math.round((n.soLuot / max) * (CAO - 18));
        const x = (RONG / 14) * i + 4;
        const y = CAO - caoCot;
        const nhan = n.ngay.slice(8, 10) + "/" + n.ngay.slice(5, 7);
        return (
          <g key={n.ngay}>
            <title>{`${nhan}: ${n.soLuot} lượt tìm, ${n.soThay} lượt có ảnh`}</title>
            {/* vùng chạm rộng hơn cột */}
            <rect x={x - 4} y={0} width={RONG / 14} height={CAO} fill="transparent" />
            {n.soLuot > 0 && (
              <rect x={x} y={y} width={beRongCot} height={caoCot} rx={3} fill="var(--green)" />
            )}
            {n.soLuot === 0 && (
              <rect x={x} y={CAO - 2} width={beRongCot} height={2} rx={1} fill="var(--line)" />
            )}
            {i === viTriMax && n.soLuot > 0 && (
              <text x={x + beRongCot / 2} y={y - 5} textAnchor="middle" fontSize={11} fontWeight={700}
                fill="var(--ink)" style={{ fontVariantNumeric: "tabular-nums" }}>
                {n.soLuot}
              </text>
            )}
            {i % 2 === 1 && (
              <text x={x + beRongCot / 2} y={CAO + 15} textAnchor="middle" fontSize={10} fill="var(--mut)">
                {nhan}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
