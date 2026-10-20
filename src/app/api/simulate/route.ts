import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';

const maxFileBytes = 10 * 1024 * 1024;
const fileSignatures = [
  { extension: 'pdf', signature: [0x25, 0x50, 0x44, 0x46] },
  { extension: 'png', signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { extension: 'jpg', signature: [0xff, 0xd8, 0xff] },
  { extension: 'jpeg', signature: [0xff, 0xd8, 0xff] },
] as const;

const requestSchema = z.object({
  vertical: z.enum(['music', 'hospitality']),
  tags: z.array(z.string().trim().min(1).max(80)).max(20),
  sourceUrl: z.url().max(2048).optional(),
  uploadPath: z.string().min(1).max(512).optional(),
  originalFileName: z.string().min(1).max(255).optional(),
}).refine((value) => Boolean(value.sourceUrl) !== Boolean(value.uploadPath), {
  message: 'Provide exactly one uploaded file or URL.',
  path: ['sourceUrl'],
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
    return NextResponse.json({ error: 'Invalid simulation input.', details: parsed.error.issues }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is not configured on the server.' }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'A private demo session could not be verified. Reload and try again.' }, { status: 401 });
  }

  if (parsed.data.uploadPath && !parsed.data.uploadPath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: 'The uploaded asset does not belong to this session.' }, { status: 403 });
  }

  if (parsed.data.vertical !== 'music') {
    return NextResponse.json({ error: 'Hospitality analysis is planned for a later release.' }, { status: 422 });
  }

  if (parsed.data.uploadPath) {
    const bucket = supabase.storage.from(process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'shadowpersona-assets');
    const { data: file, error: downloadError } = await bucket.download(parsed.data.uploadPath);
    if (downloadError || !file) {
      return NextResponse.json({ error: 'The temporary upload could not be retrieved.' }, { status: 422 });
    }

    if (file.size > maxFileBytes) {
      await bucket.remove([parsed.data.uploadPath]);
      return NextResponse.json({ error: 'Uploaded files must be 10 MB or smaller.' }, { status: 413 });
    }

    const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const extension = parsed.data.originalFileName?.split('.').pop()?.toLowerCase();
    const validSignature = fileSignatures.some(
      (candidate) =>
        candidate.extension === extension &&
        candidate.signature.every((byte, index) => bytes[index] === byte),
    );
    if (!validSignature) {
      await bucket.remove([parsed.data.uploadPath]);
      return NextResponse.json({ error: 'Uploaded file content does not match a supported PDF, PNG, or JPG format.' }, { status: 415 });
    }
  }

  const qlooKey = process.env.QLOO_API_KEY;
  if (!qlooKey || qlooKey.startsWith('replace-')) {
    return NextResponse.json(
      { error: 'Qloo access is pending. No cultural analysis or simulated results were generated.' },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { error: 'Qloo credentials are present, but the API request contract is not configured yet.' },
    { status: 503 },
  );
}
