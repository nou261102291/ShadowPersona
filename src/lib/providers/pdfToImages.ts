import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import { ProviderError } from './http';

const maxPdfPages = 12;
const maxPageDimension = 1400;
const maxRenderScale = 1.5;

export async function renderPdfPagesToImages(base64: string): Promise<string[]> {
  const [{ getDocument }, { createCanvas }] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('@napi-rs/canvas'),
  ]);
  const bytes = new Uint8Array(Buffer.from(base64, 'base64'));
  let loadingTask: PDFDocumentLoadingTask | undefined;
  let document: PDFDocumentProxy | undefined;

  try {
    loadingTask = getDocument({
      data: bytes,
      maxImageSize: 4_000_000,
      useSystemFonts: true,
    });
    document = await loadingTask.promise;

    if (document.numPages > maxPdfPages) {
      throw new ProviderError(
        'PDF renderer',
        422,
        `PDF uploads can contain at most ${maxPdfPages} pages for local vision analysis.`,
      );
    }
    if (document.numPages < 1) {
      throw new ProviderError('PDF renderer', 422, 'The uploaded PDF does not contain any pages to analyze.');
    }

    const images: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const unscaledViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(
        maxRenderScale,
        maxPageDimension / Math.max(unscaledViewport.width, unscaledViewport.height),
      );
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      // PDF.js types this as a DOM context, but its Node renderer accepts N-API canvas contexts.
      const canvasContext = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
      await page.render({ canvas: null, canvasContext, viewport }).promise;
      images.push(canvas.toBuffer('image/png').toString('base64'));
      page.cleanup();
    }

    return images;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(
      'PDF renderer',
      422,
      'The uploaded PDF could not be rendered. Check that it is valid, unencrypted, and readable.',
    );
  } finally {
    await loadingTask?.destroy();
  }
}
