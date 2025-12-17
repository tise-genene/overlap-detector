import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { getUserFromRequest } from "@/lib/auth-server";

function hint(hash: string): string {
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = getAdminClient();

  // 1. Check Pro Status
  const { data: profile } = await admin
    .from("profiles")
    .select("is_pro")
    .eq("user_id", user.id)
    .single();
  const isPro = !!profile?.is_pro;

  // 2. Fetch Alerts
  const { data, error } = await admin
    .from("alerts")
    .select("id,status,created_at,partner_id,partner:partners(hash)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return NextResponse.json({ error: "alerts_failed" }, { status: 500 });
  }

  // 3. If Pro, fetch stats
  const statsMap: Record<
    string,
    { count: number; intents: Set<string>; last_active: string }
  > = {};

  if (isPro && data && data.length > 0) {
    const partnerIds = data.map((r: { partner_id: string }) => r.partner_id);
    const { data: decls } = await admin
      .from("declarations")
      .select("partner_id,intent,created_at")
      .in("partner_id", partnerIds)
      .neq("user_id", user.id); // Exclude self

    if (decls) {
      decls.forEach(
        (d: { partner_id: string; intent: string; created_at: string }) => {
          if (!statsMap[d.partner_id]) {
            statsMap[d.partner_id] = {
              count: 0,
              intents: new Set(),
              last_active: d.created_at,
            };
          }
          const s = statsMap[d.partner_id];
          s.count++;
          if (d.intent) s.intents.add(d.intent);
          if (new Date(d.created_at) > new Date(s.last_active))
            s.last_active = d.created_at;
        }
      );
    }
  }

  // Fetch chat rooms
  const hashes = (data || [])
    .map((r: { partner: { hash: string }[] | null }) => r.partner?.[0]?.hash)
    .filter(Boolean);
  const { data: rooms } = await admin
    .from("chat_rooms")
    .select("id, partner_hash")
    .in("partner_hash", hashes);
  const roomMap = new Map(rooms?.map((r) => [r.partner_hash, r.id]));

  const alerts = (data || []).map(
    (row: {
      id: string;
      status: string;
      created_at: string;
      partner_id: string;
      partner: { hash: string }[];
    }) => {
      const p = row.partner;
      const hash = p[0]?.hash;
      const roomId = hash ? roomMap.get(hash) : null;

      let extra = {};
      if (isPro) {
        const s = statsMap[row.partner_id];
        extra = {
          overlap_count: s ? s.count : 0,
          intents: s ? Array.from(s.intents) : [],
          last_active: s ? s.last_active : null,
        };
      }

      return {
        id: row.id,
        status: row.status,
        created_at: row.created_at,
        partner_hint: hash ? hint(String(hash)) : "unknown",
        room_id: roomId,
        ...extra,
      };
    }
  );

  return NextResponse.json({ alerts, is_pro: isPro });
}
