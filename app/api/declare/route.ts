import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { getUserFromRequest } from "@/lib/auth-server";
import { hashPartner, normalizeContact } from "@/lib/hash";

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { partner, intent } = body as { partner?: string; intent?: string };
    if (!partner || !partner.trim()) {
      return NextResponse.json({ error: "partner_required" }, { status: 400 });
    }
    const normalized = normalizeContact(partner);
    const hash = hashPartner(normalized);

    const admin = getAdminClient();

    // Ensure partner exists
    const { data: existingPartner, error: partnerSelectError } = await admin
      .from("partners")
      .select("id")
      .eq("hash", hash)
      .maybeSingle();
    if (partnerSelectError) {
      console.error(partnerSelectError);
      return NextResponse.json(
        { error: "partner_lookup_failed" },
        { status: 500 }
      );
    }

    let partnerId = existingPartner?.id as string | undefined;
    if (!partnerId) {
      const { data: inserted, error: partnerInsertError } = await admin
        .from("partners")
        .insert({ hash })
        .select("id")
        .single();
      if (partnerInsertError || !inserted) {
        console.error(partnerInsertError);
        return NextResponse.json(
          { error: "partner_insert_failed" },
          { status: 500 }
        );
      }
      partnerId = inserted.id;
    }

    const { error: declError } = await admin
      .from("declarations")
      .upsert(
        { user_id: user.id, partner_id: partnerId, intent },
        { onConflict: "user_id,partner_id", ignoreDuplicates: true }
      );
    if (declError) {
      console.error(declError);
      return NextResponse.json({ error: "declare_failed" }, { status: 500 });
    }

    const { count, error: countError } = await admin
      .from("declarations")
      .select("id", { head: true, count: "exact" })
      .eq("partner_id", partnerId);
    if (countError) {
      console.error(countError);
      return NextResponse.json({ error: "count_failed" }, { status: 500 });
    }

    if ((count ?? 0) >= 2) {
      const { data: linked, error: linkedError } = await admin
        .from("declarations")
        .select("user_id")
        .eq("partner_id", partnerId);
      if (!linkedError && linked) {
        const alerts = linked.map((row) => ({
          user_id: row.user_id,
          partner_id: partnerId,
          status: "new" as const,
        }));
        const { error: alertError } = await admin
          .from("alerts")
          .upsert(alerts, { onConflict: "user_id,partner_id" });
        if (alertError) console.error(alertError);

        // Create Chat Room if not exists
        const { data: existingRoom } = await admin
          .from("chat_rooms")
          .select("id")
          .eq("partner_hash", hash)
          .maybeSingle();

        if (!existingRoom) {
          await admin.from("chat_rooms").insert({ partner_hash: hash });
        }
      } else if (linkedError) {
        console.error(linkedError);
      }
    }

    return NextResponse.json({ ok: true, overlap: (count ?? 0) >= 2 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "unexpected" }, { status: 500 });
  }
}
