import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';

const maxFileBytes = 10 * 1024 * 1024;
const allowedFiles = {
  pdf: { contentType: 'application/pdf', extension: 'pdf' },
  png: { contentType: 'image/png', extension: 'png' },
  jpg: { contentType: 'image/jpeg', extension: 'jpg' },
  jpeg: { contentType: 'image/jpeg', extension: 'jpeg' },
} as const;

const requestSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(100),
  size: z.number().int().positive().max(maxFileBytes),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid upload metadata or file exceeds the 10 MB limit.' }, { status: 400 });
  }

  const extension = parsed.data.fileName.split('.').pop()?.toLowerCase();
  const format = Object.entries(allowedFiles).find(([key]) => key === extension)?.[1];
  if (!format || format.contentType !== parsed.data.contentType) {
    return NextResponse.json({ error: 'Only PDF, PNG, and JPG files are supported.' }, { status: 415 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is not configured on the server.' }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'A private demo session could not be verified. Reload and try again.' }, { status: 401 });
  }

  const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
  const { data, error } = await supabase.storage
    .from(process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'shadowpersona-assets')
    .createSignedUploadUrl(path);

  if (error) {
    console.error('Supabase could not create a signed upload URL.', error);
    return NextResponse.json({ error: 'Could not prepare a secure upload. Please try again.' }, { status: 502 });
  }

  return NextResponse.json({ path: data.path, token: data.token });
}
