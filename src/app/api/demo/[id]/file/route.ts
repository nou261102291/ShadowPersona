import { NextResponse } from 'next/server';
import { readDemoFile } from '@/lib/demoServer';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const file = await readDemoFile(id);
  if (!file) return NextResponse.json({ error: 'Demo file not found.' }, { status: 404 });
  return new NextResponse(new Uint8Array(file.bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${file.name}"`,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
