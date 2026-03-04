export type StructuredData = Record<string, unknown>;

export type BreadcrumbItem = {
  name: string;
  item: string;
};

export type BreadcrumbTrailItem = {
  name: string;
  href?: string;
};

export const createBreadcrumbListStructuredData = (
  items: BreadcrumbItem[]
): StructuredData => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((entry, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: entry.name,
    item: entry.item,
  })),
});

export const createBreadcrumbListStructuredDataFromTrail = (
  items: BreadcrumbTrailItem[],
  currentUrl: URL | string
): StructuredData => {
  const resolvedCurrentUrl = new URL(currentUrl.toString());

  return createBreadcrumbListStructuredData(
    items.map((entry) => ({
      name: entry.name,
      item: entry.href
        ? new URL(entry.href, resolvedCurrentUrl).toString()
        : resolvedCurrentUrl.toString(),
    }))
  );
};

export type DefinedTermStructuredDataInput = {
  name: string;
  description: string;
  termCode: string;
  url: string;
  inDefinedTermSet?: string;
};

export const createDefinedTermStructuredData = ({
  name,
  description,
  termCode,
  url,
  inDefinedTermSet,
}: DefinedTermStructuredDataInput): StructuredData => ({
  "@context": "https://schema.org",
  "@type": "DefinedTerm",
  name,
  description,
  termCode,
  url,
  inDefinedTermSet,
});
