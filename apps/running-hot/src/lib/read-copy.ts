import bookConfig from "../book.config";

type ReadPageBreadcrumbCopy = {
  ariaLabel: string;
  readingHub: string;
  chapters: string;
  mechanisms: string;
  examples: string;
  glossary: string;
  toolkit: string;
};

const requiredKeys: Array<keyof ReadPageBreadcrumbCopy> = [
  "ariaLabel",
  "readingHub",
  "chapters",
  "mechanisms",
  "examples",
  "glossary",
  "toolkit",
];

const readPageBreadcrumbCopyByLocale: Record<string, ReadPageBreadcrumbCopy> = {
  en: {
    ariaLabel: "Breadcrumb",
    readingHub: "Reading hub",
    chapters: "Chapters",
    mechanisms: "Mechanisms",
    examples: "Examples",
    glossary: "Glossary",
    toolkit: "Toolkit",
  },
};

const validateReadPageBreadcrumbCopyLocales = (): void => {
  const localeCodes = (bookConfig.localization?.locales ?? []).map((locale) => locale.code);

  localeCodes.forEach((localeCode) => {
    const localeCopy = readPageBreadcrumbCopyByLocale[localeCode];
    if (!localeCopy) {
      throw new Error(`Missing read breadcrumb copy for locale: ${localeCode}`);
    }

    requiredKeys.forEach((requiredKey) => {
      if (!localeCopy[requiredKey]) {
        throw new Error(
          `Missing read breadcrumb copy key \"${requiredKey}\" for locale: ${localeCode}`
        );
      }
    });
  });
};

validateReadPageBreadcrumbCopyLocales();

export const getReadPageBreadcrumbCopy = (locale?: string): ReadPageBreadcrumbCopy => {
  if (locale && readPageBreadcrumbCopyByLocale[locale]) {
    return readPageBreadcrumbCopyByLocale[locale];
  }

  return readPageBreadcrumbCopyByLocale.en;
};

export type { ReadPageBreadcrumbCopy };
