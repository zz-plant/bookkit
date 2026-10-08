import type { BookContentRawModules } from "../book/entrypoints";
import { frontmatterText, parseFrontmatter } from "../utils/frontmatter";
import {
	CONTENT_TYPES,
	type ContentTypeKey,
	type McpResourceInput,
	type ResourceKind,
	type ResourceListParams,
	type ResourceReadParams,
} from "./types";

const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/;

export type ResourceSection = {
	id: string;
	title: string;
	level: number;
	startLine: number;
	endLine: number;
};

export type ResourceChunk = {
	text: string;
	startLine: number;
	endLine: number;
	totalLines: number;
	chunkId: string;
	sectionId: string | null;
	sectionStartLine: number;
	sectionEndLine: number;
	offset: number;
	limit: number;
	totalSectionLines: number;
	sectionIndex: ResourceSection[];
};

const slugifySection = (value: string): string => {
	return (
		value
			.toLowerCase()
			.replace(/["'`]/g, "")
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || "section"
	);
};

const parseNonNegativeInteger = (
	value: number | undefined,
	fallback: number,
): number => {
	if (typeof value !== "number") return fallback;
	const normalized = Number.isFinite(value) ? Math.floor(value) : fallback;
	return Math.max(0, normalized);
};

const parsePositiveInteger = (
	value: number | undefined,
	fallback: number,
): number => {
	if (typeof value !== "number") return fallback;
	const normalized = Number.isFinite(value) ? Math.floor(value) : fallback;
	return Math.max(1, normalized);
};

export const buildSectionIndex = (text: string): ResourceSection[] => {
	const lines = text.split("\n");
	const totalLines = Math.max(lines.length, 1);
	const sections: Array<Omit<ResourceSection, "endLine">> = [];
	const slugCounts = new Map<string, number>();

	lines.forEach((line, index) => {
		const headingMatch = line.match(HEADING_PATTERN);
		if (!headingMatch) return;

		const level = headingMatch[1].length;
		const title = headingMatch[2].trim();
		const baseSlug = slugifySection(title);
		const count = (slugCounts.get(baseSlug) ?? 0) + 1;
		slugCounts.set(baseSlug, count);
		const id = count === 1 ? `sec-${baseSlug}` : `sec-${baseSlug}-${count}`;

		sections.push({
			id,
			title,
			level,
			startLine: index + 1,
		});
	});

	const headingSections = sections.map((section, index) => ({
		...section,
		endLine: (sections[index + 1]?.startLine ?? lines.length + 1) - 1,
	}));

	return [
		{
			id: "sec-root",
			title: "Document",
			level: 1,
			startLine: 1,
			endLine: totalLines,
		},
		...headingSections,
	];
};

export const extractFrontmatterField = (
	raw: string,
	field: string,
): string | null => frontmatterText(parseFrontmatter(raw).data, field) || null;

export const resolveResourceTitle = (raw: string, fallback: string): string => {
	return (
		extractFrontmatterField(raw, "title") ||
		extractFrontmatterField(raw, "name") ||
		extractFrontmatterField(raw, "term") ||
		fallback
	);
};

export const normalizeModuleSlug = (
	moduleKey: string,
	type: string,
): string => {
	const normalized = moduleKey.replace(/\\/g, "/");
	const marker = `/${type}/`;
	const index = normalized.lastIndexOf(marker);
	const trimmed =
		index >= 0 ? normalized.slice(index + marker.length) : normalized;
	return trimmed.replace(/\.(mdx|md)$/, "");
};

export const buildResourceUri = (
	prefix: string,
	type: string,
	slug: string,
): string => {
	const safePrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
	return `${safePrefix}${type}/${slug}`;
};

export const parseResourceUri = (
	prefix: string,
	uri: string,
): { type: ContentTypeKey; slug: string } | null => {
	const safePrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
	if (!uri.startsWith(safePrefix)) return null;
	const path = uri.slice(safePrefix.length);
	const [type, ...rest] = path.split("/");
	if (!type || rest.length === 0) return null;
	if (!CONTENT_TYPES.includes(type as ContentTypeKey)) return null;
	return { type: type as ContentTypeKey, slug: rest.join("/") };
};

export const listResources = (
	contentRawModules: BookContentRawModules,
	resourcePrefix: string,
	governanceResources: McpResourceInput[] = [],
) => {
	const contentResources = CONTENT_TYPES.flatMap((type) => {
		return Object.entries(contentRawModules[type]).map(([moduleKey, raw]) => {
			const slug = normalizeModuleSlug(moduleKey, type);
			const title = resolveResourceTitle(raw, slug);
			return {
				uri: buildResourceUri(resourcePrefix, type, slug),
				name: title,
				description: `${type} entry`,
				mimeType: "text/markdown",
				kind: "content" as ResourceKind,
				section: type,
				supportsChunking: true,
				supportsSectionIndex: true,
			};
		});
	});

	const governance = governanceResources.map((resource) => ({
		uri: resource.uri,
		name: resource.name,
		description: resource.description ?? "governance entry",
		mimeType: resource.mimeType ?? "text/markdown",
		kind: "governance" as ResourceKind,
		section: undefined,
		supportsChunking: resource.supportsChunking ?? true,
		supportsSectionIndex: resource.supportsSectionIndex ?? true,
	}));

	return [...contentResources, ...governance];
};

export const listPagedResources = (
	resources: ReturnType<typeof listResources>,
	params: ResourceListParams = {},
): {
	resources: ReturnType<typeof listResources>;
	nextCursor: string | null;
} => {
	const filtered = resources.filter((resource) => {
		if (params.kind && resource.kind !== params.kind) return false;
		if (params.section && resource.section !== params.section) return false;
		return true;
	});

	const offset = Number.parseInt(params.cursor ?? "0", 10);
	const start = Number.isFinite(offset) && offset >= 0 ? offset : 0;
	const limitRaw =
		typeof params.limit === "number" ? Math.floor(params.limit) : 50;
	const limit = Math.max(1, Math.min(200, limitRaw));
	const page = filtered.slice(start, start + limit);
	const nextCursor =
		start + limit < filtered.length ? String(start + limit) : null;

	return { resources: page, nextCursor };
};

export const readResource = (
	contentRawModules: BookContentRawModules,
	resourcePrefix: string,
	uri: string,
	governanceResources: McpResourceInput[] = [],
) => {
	const governanceMatch = governanceResources.find(
		(resource) => resource.uri === uri,
	);
	if (governanceMatch) {
		return {
			mimeType: governanceMatch.mimeType ?? "text/markdown",
			text: governanceMatch.text,
		};
	}

	const parsed = parseResourceUri(resourcePrefix, uri);
	if (!parsed) return null;
	const modules = contentRawModules[parsed.type];
	const match = Object.entries(modules).find(
		([moduleKey]) =>
			normalizeModuleSlug(moduleKey, parsed.type) === parsed.slug,
	);
	if (!match) return null;
	return { mimeType: "text/markdown", text: match[1] };
};

export const buildResourceChunk = (
	uri: string,
	text: string,
	params: ResourceReadParams,
): ResourceChunk | null => {
	const lines = text.split("\n");
	const totalLines = Math.max(lines.length, 1);
	const sectionIndex = buildSectionIndex(text);

	const selectedSection = params.sectionId
		? sectionIndex.find((section) => section.id === params.sectionId)
		: sectionIndex[0];

	if (!selectedSection) return null;

	const sectionStartLine = selectedSection.startLine;
	const sectionEndLine = selectedSection.endLine;
	const totalSectionLines = Math.max(sectionEndLine - sectionStartLine + 1, 1);

	const hasLineRange =
		typeof params.startLine === "number" || typeof params.endLine === "number";
	const rangeStartRaw =
		typeof params.startLine === "number"
			? Math.floor(params.startLine)
			: sectionStartLine;
	const rangeEndRaw =
		typeof params.endLine === "number"
			? Math.floor(params.endLine)
			: sectionEndLine;

	const boundedStart = Math.min(
		Math.max(rangeStartRaw, sectionStartLine),
		sectionEndLine,
	);
	const boundedEnd = Math.min(
		Math.max(rangeEndRaw, boundedStart),
		sectionEndLine,
	);

	const rangeStartLine = hasLineRange ? boundedStart : sectionStartLine;
	const rangeEndLine = hasLineRange ? boundedEnd : sectionEndLine;

	const boundedRangeLines = Math.max(rangeEndLine - rangeStartLine + 1, 1);
	const offset = parseNonNegativeInteger(params.offset, 0);
	const limit = Math.min(
		parsePositiveInteger(params.limit, boundedRangeLines),
		1000,
	);
	const effectiveOffset = Math.min(offset, Math.max(boundedRangeLines - 1, 0));

	const chunkStartLine = rangeStartLine + effectiveOffset;
	const chunkEndLine = Math.min(chunkStartLine + limit - 1, rangeEndLine);

	const sectionRef = selectedSection.id;
	return {
		text: lines.slice(chunkStartLine - 1, chunkEndLine).join("\n"),
		startLine: chunkStartLine,
		endLine: chunkEndLine,
		totalLines,
		chunkId: `${uri}#${sectionRef}:L${chunkStartLine}-L${chunkEndLine}`,
		sectionId: sectionRef,
		sectionStartLine,
		sectionEndLine,
		offset: effectiveOffset,
		limit,
		totalSectionLines,
		sectionIndex,
	};
};
