import { NextRequest, NextResponse } from "next/server";
import { ghiNhanTanSuat, prisma } from "@anh/db";
import { layIp } from "@/lib/dich-vu-khuon-mat";

const DICH_VU_URL = process.env.DICH_VU_KHUON_MAT_URL ?? "http://127.0.0.1:8100";

/** Kiểm tra người thật (bật env TIM_ANH_LIVENESS=1): chuyển 3–8 khung hình sang dịch vụ model. */
export async function POST(req: NextRequest) {
  const ip = layIp(req.headers);
  const { biChan } = await ghiNhanTanSuat(prisma, `song:${ip}`, 30, 60 * 60_000);
  if (biChan) return NextResponse.json({ loi: "THU_QUA_NHIEU_LAN" }, { status: 429 });

  const form = await req.formData();
  const khungs = form.getAll("khung").filter((k): k is File => k instanceof File);
  if (khungs.length < 3 || khungs.length > 8) return NextResponse.json({ loi: "THIEU_KHUNG" }, { status: 422 });

  const chuyen = new FormData();
  for (const k of khungs) chuyen.append("khung", k, k.name);
  try {
    const res = await fetch(`${DICH_VU_URL}/song`, { method: "POST", body: chuyen });
    if (!res.ok) return NextResponse.json({ loi: "DICH_VU_BAN" }, { status: 503 });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ loi: "DICH_VU_BAN" }, { status: 503 });
  }
}
