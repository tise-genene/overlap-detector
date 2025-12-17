import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase-admin';
import { getUserFromRequest } from '@/lib/auth-server';

function hint(hash: string): string {
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = getAdminClient();
  const { data, error } = await admin
    .from('alerts')
    .select('id,status,created_at,partner:partners(hash)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return NextResponse.json({ error: 'alerts_failed' }, { status: 500 });
  }

  const alerts = (data || []).map((row) => ({
    id: row.id,
    status: row.status,
    created_at: row.created_at,
    partner_hint: row.partner?.hash ? hint(row.partner.hash) : 'unknown',
  }));

  return NextResponse.json({ alerts });
}
