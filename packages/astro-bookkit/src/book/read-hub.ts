import type { ReleaseSectionSlug } from "../releases/notes";
import { readRoutes } from "./read-routes";

export type ReadHubSectionKey = ReleaseSectionSlug | "overview";

export type ReadHubHeroLink = {
  label: string;
  href: string;
  primary?: boolean;
  funnelStep?: string;
};

export type ReadHubHeroConfig = {
  eyebrow: string;
  title: string;
  lede: string;
  quickLinks: ReadHubHeroLink[];
  quickLinksAriaLabel?: string;
  quickStartAriaLabel?: string;
};

export type ReadHubQuickStartCard = {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  recommended?: boolean;
  funnelStep?: string;
};

export type ReadHubIntroConfig = {
  eyebrow: string;
  title: string;
  lede?: string;
};

export type ReadHubBucket = {
  id: string;
  title: string;
  description: string;
  sectionKeys: ReadHubSectionKey[];
  primary?: boolean;
};

export type ReadHubUtilityLink = {
  label: string;
  href: string;
  primary?: boolean;
  funnelStep?: string;
};

export type ReadHubUtilityCard = {
  eyebrow: string;
  title: string;
  description: string;
  links: ReadHubUtilityLink[];
  featured?: boolean;
  deemphasizeUntilStarted?: boolean;
  secondaryNote?: string;
};

export type ReadHubUtilitiesConfig = {
  mode: "default" | "accordion";
  eyebrow: string;
  title: string;
  lede?: string;
  cards: ReadHubUtilityCard[];
  id?: string;
};

export type ReadHubReleaseFilterLabels = {
  initialLabel: string;
  activeLabel: string;
};

export type ReadHubLatestChange = {
  version: string;
  date: string;
};

export type ReadHubSection = {
  sectionKey: ReadHubSectionKey;
  title: string;
  description: string;
  href: string;
  count: number;
  completeness?: number | null;
  keyHint?: string[];
  latestChange?: ReadHubLatestChange;
};

export type ReadHubConfig = {
  hero: ReadHubHeroConfig;
  intro: ReadHubIntroConfig;
  buckets: ReadHubBucket[];
  quickStartCards?: ReadHubQuickStartCard[];
  utilities?: ReadHubUtilitiesConfig;
  bucketNavigation?: "stacked" | "tabs";
  releaseFilter?: ReadHubReleaseFilterLabels;
};

export type ReadHubSectionStats = {
  count: number;
  completeness?: number | null;
};

export type ReadHubSectionStatsMap = {
  chapters: ReadHubSectionStats;
  mechanisms: ReadHubSectionStats;
  toolkit: ReadHubSectionStats;
  glossary: ReadHubSectionStats;
  examples: ReadHubSectionStats;
};

export type ReadHubLatestChangeMap = Partial<Record<ReadHubSectionKey, ReadHubLatestChange>>;

export const createDefaultReadHubSections = (
  stats: ReadHubSectionStatsMap,
  latestChanges: ReadHubLatestChangeMap = {},
): ReadHubSection[] => [
  {
    title: "Overview",
    description: "Objectives, frame, and constraints for this draft.",
    href: readRoutes.overview,
    count: 1,
    keyHint: ["g", "o"],
    sectionKey: "overview",
    latestChange: latestChanges.overview,
  },
  {
    title: "Chapters",
    description: "Core modules and the intervention frame.",
    href: readRoutes.chapters,
    count: stats.chapters.count,
    completeness: stats.chapters.completeness ?? null,
    keyHint: ["g", "c"],
    sectionKey: "chapters",
    latestChange: latestChanges.chapters,
  },
  {
    title: "Mechanisms",
    description: "Named system patterns with stable definitions.",
    href: readRoutes.mechanisms,
    count: stats.mechanisms.count,
    completeness: stats.mechanisms.completeness ?? null,
    keyHint: ["g", "m"],
    sectionKey: "mechanisms",
    latestChange: latestChanges.mechanisms,
  },
  {
    title: "Toolkit",
    description: "Action primitives that fit inside ten minutes.",
    href: readRoutes.toolkit,
    count: stats.toolkit.count,
    completeness: stats.toolkit.completeness ?? null,
    keyHint: ["g", "t"],
    sectionKey: "toolkit",
    latestChange: latestChanges.toolkit,
  },
  {
    title: "Glossary",
    description: "Short definitions to keep shared language consistent.",
    href: readRoutes.glossary,
    count: stats.glossary.count,
    completeness: stats.glossary.completeness ?? null,
    keyHint: ["g", "l"],
    sectionKey: "glossary",
    latestChange: latestChanges.glossary,
  },
  {
    title: "Examples",
    description: "Replaceable cases that ground the modules.",
    href: readRoutes.examples,
    count: stats.examples.count,
    completeness: stats.examples.completeness ?? null,
    keyHint: ["g", "e"],
    sectionKey: "examples",
    latestChange: latestChanges.examples,
  },
];
