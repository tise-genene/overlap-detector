import { NextRequest } from 'next/server';
import { getAdminClient } from './supabase-admin';
import type { User } from '@supabase/supabase-js';

export async function getUserFromRequest(req: NextRequest): Promise<User | null> {
  const header = req.headers.get('authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length);
  const admin = getAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}
