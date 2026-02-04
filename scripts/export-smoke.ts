import { createEpubExport, createPdfExport, type ExportBundle } from "@bookkit/astro-bookkit/exports";

const sampleBundle: ExportBundle = {
  title: "Bookkit Export Smoke Test",
  version: "smoke",
  updatedAt: new Date().toISOString(),
  chapters: [
    {
      slug: "intro",
      title: "Introduction",
      body: "Welcome to the export smoke test.\n\n- Validate EPUB\n- Validate PDF",
      description: "Smoke test chapter",
      locale: "en",
    },
    {
      slug: "next-steps",
      title: "Next Steps",
      body: "This is a second chapter to verify multi-chapter exports.",
      description: "Another chapter",
      locale: "en",
    },
  ],
};

const toKilobytes = (bytes: number) => (bytes / 1024).toFixed(1);

const run = async () => {
  const [epubBytes, pdfBytes] = await Promise.all([
    createEpubExport(sampleBundle),
    createPdfExport(sampleBundle),
  ]);

  console.log(`EPUB export: ${toKilobytes(epubBytes.length)} KB`);
  console.log(`PDF export: ${toKilobytes(pdfBytes.length)} KB`);
};

run().catch((error) => {
  console.error("Export smoke test failed.", error);
  process.exit(1);
});
