import { escapeXml } from "../releases/notes";

export type SitemapEntry = {
  url: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
};

const formatEntry = (entry: SitemapEntry): string => {
  const fields = [
    `    <loc>${escapeXml(entry.url)}</loc>`,
    entry.lastmod ? `    <lastmod>${escapeXml(entry.lastmod)}</lastmod>` : null,
    entry.changefreq ? `    <changefreq>${entry.changefreq}</changefreq>` : null,
    entry.priority !== undefined ? `    <priority>${entry.priority.toFixed(1)}</priority>` : null,
  ].filter(Boolean);

  return `  <url>\n${fields.join("\n")}\n  </url>`;
};

export const createSitemapXml = (entries: SitemapEntry[]): string => {
  const urls = entries.map(formatEntry).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
};
