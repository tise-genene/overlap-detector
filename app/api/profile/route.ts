import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { getUserFromRequest } from "@/lib/auth-server";

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("nickname, created_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: "profile_failed" }, { status: 500 });
  }

  return NextResponse.json({
    profile: data || null,
    user: { id: user.id, email: user.email },
  });
}

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { nickname } = body as { nickname?: string };

  const admin = getAdminClient();
  const { error } = await admin
    .from("profiles")
    .upsert({ user_id: user.id, nickname }, { onConflict: "user_id" });

  if (error) {
    console.error(error);
    return NextResponse.json(
      { error: "profile_update_failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
