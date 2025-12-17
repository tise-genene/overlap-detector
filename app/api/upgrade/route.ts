import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { getUserFromRequest } from "@/lib/auth-server";

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = getAdminClient();

  // Toggle is_pro for testing
  const { data: profile } = await admin
    .from("profiles")
    .select("is_pro")
    .eq("user_id", user.id)
    .single();

  const newStatus = !profile?.is_pro;

  const { error } = await admin
    .from("profiles")
    .update({ is_pro: newStatus })
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ is_pro: newStatus });
}
