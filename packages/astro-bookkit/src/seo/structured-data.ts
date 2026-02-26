export type StructuredData = Record<string, unknown>;

export type BreadcrumbItem = {
  name: string;
  item: string;
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
