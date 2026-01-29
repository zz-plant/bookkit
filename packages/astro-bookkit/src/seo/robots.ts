export type RobotsTxtOptions = {
  allowAll?: boolean;
  disallowPaths?: string[];
  sitemapUrl?: string;
  host?: string;
};

export const createRobotsTxt = ({
  allowAll = true,
  disallowPaths = [],
  sitemapUrl,
  host,
}: RobotsTxtOptions): string => {
  const lines = ["User-agent: *"];

  if (allowAll && disallowPaths.length === 0) {
    lines.push("Allow: /");
  }

  disallowPaths.forEach((path) => {
    lines.push(`Disallow: ${path}`);
  });

  if (host) {
    lines.push(`Host: ${host}`);
  }

  if (sitemapUrl) {
    lines.push(`Sitemap: ${sitemapUrl}`);
  }

  return `${lines.join("\n")}\n`;
};
