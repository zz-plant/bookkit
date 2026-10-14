export type {
	ReaderAnalyticsEndpointOptions,
	ReaderAnalyticsEvent,
} from "./analytics";
export {
	createReaderAnalyticsEndpoint,
	getReaderAnalyticsLogPath,
	recordReaderAnalyticsEvent,
} from "./analytics";
export {
	buildReleaseNotesPageProps,
	buildVersionArchivePageProps,
	createAnalyticsApiHandlers,
	createBookExportGetHandler,
	createChapterExportHandlers,
	createExportAnalyticsApiHandlers,
	createFeedbackApiHandlers,
	createPreviewAnalyticsApiHandlers,
	createReleaseAnalyticsApiPostHandler,
	createReleaseWebhookApiHandlers,
	createSearchIndexGetHandler,
	createSitemapGetHandler,
} from "./app-wrappers";
export type {
	BookAppShims,
	BookContentModules,
	BookContentRawModules,
	BookEntryPoints,
	BookEntryPointsOptions,
	BookEntrypointModules,
	BookExportHelpersFromConfigOptions,
	BookLayoutConfig,
	BookLayoutOptions,
	BookLayoutPreviewDisplayState,
	BookLayoutRenderState,
	BookLayoutRouteState,
	BookLayoutState,
	BookLayoutTranslationNoticeState,
	BookLayoutVersionDisplayState,
	BookMiddlewareOptions,
	BookRuntime,
	BookRuntimeConfig,
	BookVersionEntryOptions,
	ChapterModule,
	ChapterPageCopy,
	CreateBookLayoutRenderStateOptions,
	CreateBookRuntimeOptions,
	ExampleModule,
	GlossaryModule,
	MechanismModule,
	ReadHubBucket,
	ReadHubConfig,
	ReadHubContentModule,
	ReadHubContentModuleGroups,
	ReadHubContentSectionKey,
	ReadHubCopy,
	ReadHubHeroConfig,
	ReadHubHeroLink,
	ReadHubIntroConfig,
	ReadHubLatestChange,
	ReadHubLatestChangeMap,
	ReadHubLocalizedSectionEntry,
	ReadHubQuickStartCard,
	ReadHubReleaseFilterLabels,
	ReadHubSection,
	ReadHubSectionKey,
	ReadHubSectionStats,
	ReadHubSectionStatsMap,
	ReadHubSectionSummary,
	ReadHubSectionSummaryMap,
	ReadHubUtilitiesConfig,
	ReadHubUtilityCard,
	ReadHubUtilityLink,
	ReadIndexKey,
	ToolkitModule,
} from "./book";
export {
	buildLocalizedReadRoutePath,
	buildTranslationLede,
	createBookAppShims,
	createBookEntryPoints,
	createBookEntryPointsFromModules,
	createBookExportHelpersFromConfig,
	createBookLayoutRenderState,
	createBookLayoutState,
	createBookMiddleware,
	createBookRuntime,
	createBookVersionEntries,
	createBookVersionEntriesFromReleaseModules,
	createChapterExportSlugs,
	createDefaultReadHubSections,
	createLocalizedReadHubSectionSummaries,
	createReleaseNoteHelpers,
	createReleaseNotesFromModules,
	defaultChapterPageCopy,
	defaultReadHubCopy,
	formatTranslationCompleteness,
	getOgImageForPath,
	normalizeOgPathname,
	readItemPath,
	readRoutePrefixFromPathname,
	readRoutes,
	readSectionPath,
} from "./book";
export {
	computeTopologicalOrder,
	deriveReaderPathways,
	detectCycles,
	type GraphNode,
	type ReadingPathway,
} from "./book/graph";
export { cosineSimilarity, topKByScore } from "./embeddings";
export type {
	EmbeddingEngine,
	EmbeddingEngineState,
} from "./embeddings/engine";
export { createEmbeddingEngine } from "./embeddings/engine";
export type { EmbeddingStore } from "./embeddings/store";
export { createEmbeddingStore } from "./embeddings/store";
export type {
	BookExportHelperOptions,
	BookExportInfo,
	ExportAnalyticsEndpointOptions,
	ExportAnalyticsEvent,
	ExportBundle,
	ExportChapter,
	ExportFormat,
	ExportLink,
	ExportLinkOptions,
	ExportMetadata,
} from "./exports";
export {
	buildExportChapters,
	buildExportLinks,
	buildExportMetadata,
	createBookExportHelpers,
	createEpubExport,
	createExportAnalyticsEndpoint,
	createExportResponse,
	createPdfExport,
	estimateExportBytes,
	formatBytes,
	formatExportUpdatedDate,
	recordExportEvent,
} from "./exports";
export type {
	FeedbackEndpointOptions,
	FeedbackEvent,
} from "./feedback/endpoint";
export { createFeedbackEndpoint } from "./feedback/endpoint";
export { defaultFrames, registerDefaultFrames } from "./frames/defaults";
export { getFrame, listFrames, registerFrame } from "./frames/registry";
export type { FrameDefinition, FrameStep } from "./frames/types";
export {
	type BookkitIntegrationOptions,
	bookkit,
} from "./integration";
export type {
	LocalLlmEngine,
	LocalLlmMessage,
	LocalLlmResponse,
} from "./llm-local";
export { createLocalLlmEngine } from "./llm-local";
export type {
	LocaleEntry,
	LocaleMiddlewareOptions,
	LocaleRoutingOptions,
} from "./localization";
export {
	buildLocalePath,
	buildLocalizedContentIndex,
	calculateLocaleCompleteness,
	createLocaleRoutingMiddleware,
	createLocalizedContentList,
	formatLocaleLabel,
	mergeLocaleCompleteness,
	normalizeLocaleCode,
	resolveLocaleConfig,
	stripLocaleFromPath,
} from "./localization";
export { rehypeBookkitHeadingIds } from "./markdown/headingIds";
export {
	extractHeadingsFromMarkdown,
	type HeadingEntry,
} from "./markdown/headings";
export {
	extractPageFacts,
	type PageFacts,
	pageFactsForModule,
} from "./markdown/pageFacts";
export type {
	CreateBookMcpEndpointFromWorkspaceOptions,
	GovernanceFileResource,
	McpEndpointOptions,
	McpResourceInput,
} from "./mcp";
export {
	CORE_GOVERNANCE_FILE_RESOURCES,
	createBookMcpEndpoint,
	createBookMcpEndpointFromWorkspace,
	createGovernanceResourcesFromFiles,
	DEFAULT_GOVERNANCE_FILE_RESOURCES,
	findWorkspaceRoot,
} from "./mcp";
export type {
	PreviewAccessConfig,
	PreviewAccessMiddlewareOptions,
	PreviewAccessState,
	PreviewAccessStatus,
	PreviewAnalyticsEndpointOptions,
	PreviewAnalyticsEvent,
	PreviewLinkBuildOptions,
	PreviewLinkStatus,
	PreviewTokenRecord,
} from "./preview";
export {
	buildPreviewLink,
	createPreviewAccessMiddleware,
	createPreviewAnalyticsEndpoint,
	createPreviewLinks,
	getPreviewAnalyticsLogPath,
	getPreviewContext,
	getPreviewTokenHint,
	recordPreviewEvent,
	resolvePreviewLinks,
	resolvePreviewToken,
} from "./preview";
export type {
	BuildProposalBundleOptions,
	ConfigDraft,
	ConfigProposalOptions,
	EdgeProposal,
	FolderDocument,
	FolderFinding,
	FolderPreview,
	FolderPreviewOptions,
	FolderSourceFile,
	FrameDetection,
	MechanismProposal,
	ProposalBundle,
	ToolProposal,
} from "./proposals";
export {
	buildProposalBundle,
	detectFrameFromBodies,
	mechanismFrontmatter,
	previewFolder,
	proposeConfigDraft,
	toolFrontmatter,
} from "./proposals";
export type { AiQaProviderConfig, QaRequest, QaResponse, QaTurn } from "./qa";
export { createQaApiHandlers, filterEntriesToReadingWindow } from "./qa";
export type { ReleaseEvent } from "./releases/analytics";
export { recordReleaseEvent } from "./releases/analytics";
export type {
	ReleaseEmailPayload,
	ReleaseEmailResult,
	ReleaseEmailTarget,
} from "./releases/email";
export {
	buildReleaseEmailPayload,
	parseReleaseEmailTargets,
	sendReleaseEmailHooks,
} from "./releases/email";
export type { ReleaseEndpointOptions } from "./releases/endpoint";
export {
	createReleaseEmailEndpoint,
	createReleaseNotesRssEndpoint,
	createReleaseWebhookEndpoint,
} from "./releases/endpoint";
export type { VersionRoutingOptions } from "./releases/middleware";
export { createVersionRoutingMiddleware } from "./releases/middleware";
export type {
	ReleaseModule,
	ReleaseNote,
	ReleaseSectionSlug,
} from "./releases/notes";
export {
	createLatestSectionChangeMap,
	createReleaseNotes,
	escapeXml,
	formatReleaseDate,
	RELEASE_SECTION_SLUGS,
} from "./releases/notes";
export type { ReleaseNotesRssOptions } from "./releases/rss";
export {
	createReleaseNotesRss,
	createReleaseNotesRssResponse,
} from "./releases/rss";
export type { BookVersionEntry } from "./releases/versions";
export {
	buildVersionPath,
	createVersionEntries,
	extractVersionFromPath,
	stripVersionFromPath,
} from "./releases/versions";
export type {
	ReleaseWebhookPayload,
	ReleaseWebhookResult,
	ReleaseWebhookTarget,
} from "./releases/webhooks";
export {
	buildReleaseWebhookPayload,
	parseReleaseWebhookTargets,
	sendReleaseWebhooks,
} from "./releases/webhooks";
export type { RerankEngine, RerankResult } from "./rerank";
export { createRerankEngine } from "./rerank";
export {
	type AuthoredFrontmatter,
	type ChapterFrontmatter,
	chapterSchema,
	type ExampleFrontmatter,
	exampleSchema,
	type GlossaryFrontmatter,
	glossarySchema,
	type MechanismFrontmatter,
	mechanismSchema,
	type ToolkitFrontmatter,
	toolkitDisplayName,
	toolkitSchema,
} from "./schemas";
export type { SearchContentSource, SearchEntry } from "./search";
export { buildSearchEntries, createSearchIndexResponse } from "./search";
export {
	createBookSearchIndexEndpoint,
	createLocalizedSearchIndexEndpoint,
} from "./search/endpoint";
export type {
	BookSearchModuleMap,
	LocalizedSearchOptions,
} from "./search/sources";
export {
	createBookSearchSources,
	createLocalizedSearchSources,
} from "./search/sources";
export type {
	BookRobotsOptions,
	BookSitemapContentModules,
	BookSitemapOptions,
} from "./seo/book";
export {
	AUTHOR_ONLY_PATHS,
	createBookRobotsTxt,
	createBookSitemapEntries,
	DEFAULT_BOOK_SITEMAP_PATHS,
} from "./seo/book";
export type {
	BookSeoConfig,
	BookSeoDefaults,
	SeoInput,
	SeoProps,
} from "./seo/config";
export {
	buildSeoProps,
	hasServerRuntime,
	resolveSiteUrl,
} from "./seo/config";
export {
	bookPageTitle,
	DEFAULT_MIN_INDEXABLE_WORDS,
	firstMetaDescription,
	isThinPage,
	META_DESCRIPTION_MAX_CHARACTERS,
	shortBookTitle,
	THIN_PAGE_ROBOTS,
	toMetaDescription,
} from "./seo/page-meta";
export type { RobotsTxtOptions } from "./seo/robots";
export { createRobotsTxt } from "./seo/robots";
export type { SitemapEntry } from "./seo/sitemap";
export { createSitemapXml } from "./seo/sitemap";
export type {
	BreadcrumbItem,
	BreadcrumbTrailItem,
	DefinedTermStructuredDataInput,
	StructuredData,
} from "./seo/structured-data";
export {
	createBreadcrumbListStructuredData,
	createBreadcrumbListStructuredDataFromTrail,
	createDefinedTermStructuredData,
} from "./seo/structured-data";
export type { SiteUrlOptions } from "./seo/urls";
export {
	buildAbsoluteUrl,
	canonicalPageUrl,
	canonicalPathname,
	normalizeSiteUrl,
} from "./seo/urls";
export type {
	BookContentInput,
	ChapterRecord,
	ConceptClassification,
	ConceptFlag,
	ConceptTriageOptions,
	ContentSuggestion,
	CorpusCluster,
	CorpusDistinctDecision,
	CorpusMechanism,
	CorpusOverlapOptions,
	CorpusOverlapReport,
	CorpusPair,
	CorpusSharedMechanism,
	ExampleAuditOptions,
	ExampleRecord,
	MechanismDraft,
	MechanismOverlapOptions,
	MechanismProposalOptions,
	MechanismRecord,
	PrerequisiteSuggestionOptions,
	SuggestionCategory,
	SuggestionSeverity,
} from "./suggestions";
export {
	analyzeCorpusOverlap,
	analyzeMechanismOverlap,
	auditExampleSwappability,
	classifyConcept,
	corpusEmbeddingText,
	DEFAULT_SEMANTIC_OVERLAP_THRESHOLD,
	extractConceptFlags,
	proposeMechanismCandidates,
	runBookSuggestions,
	suggestPrerequisiteEdges,
	triageConcepts,
} from "./suggestions";
export type {
	ContentCheckContext,
	ContentCheckResult,
	ContentContract,
	ContentFinding,
	ContentFindingCode,
	ContentSection,
	ContractField,
	RetiredSlug,
} from "./validators/content-check";
export {
	CONTENT_SECTIONS,
	checkContentItem,
	contentContract,
	isContentSection,
	mechanismSlugsFrom,
	retiredSlugsFromCorpus,
	SECTION_DIRECTORIES,
} from "./validators/content-check";
export {
	frameStepsInHeadings,
	validateFrameDefinition,
	validateFrameSteps,
} from "./validators/frame";
export type { FrameConfigFromSource } from "./validators/frame-config";
export { extractFrameConfigFromSource } from "./validators/frame-config";
