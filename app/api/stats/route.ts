import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const admin = getAdminClient();
    const { data, error } = await admin.rpc("get_global_stats");

    if (error) throw error;

    return NextResponse.json(data);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
