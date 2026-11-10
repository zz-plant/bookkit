/**
 * Frame rules: the frame book.config.ts declares (FRAME_UNKNOWN,
 * FRAME_STEP_UNKNOWN, FRAME_STEP_REQUIRED) and the steps the book's chapters
 * must cover (FRAME_STEP_MISSING).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultFrames } from "../../frames/defaults";
import type { FrameDefinition } from "../../frames/types";
import { didYouMean } from "../../utils/did-you-mean";
import { parseFrontmatter } from "../../utils/frontmatter";
import { frameStepsInPage } from "../frame";
import { type BookFinding, bookContentDir, type ParsedSource } from "./sources";

/** The frame a book follows, and the steps its framing chapter must carry. */
type BookFrame = { frame: FrameDefinition; steps: string[] };

const FRAME_SLUGS = defaultFrames.map((frame) => frame.slug);

/**
 * The frame book.config.ts declares (`slug`, or `override` from the caller)
 * and the steps the book's framing chapter must carry: `frame.steps`, which
 * may add a frame's optional steps but not leave out a required one. Without
 * a `frame`, a book follows the intervention frame. A slug no frame has, a
 * step its frame does not have, and a required step left out are errors in
 * book.config.ts; with an unknown slug the chapters are not checked against
 * any frame.
 */
export const bookFrame = (
	declared: { slug: string; steps?: string[] } | null,
	override: string | undefined,
	configPath: string,
): { frame?: BookFrame; findings: BookFinding[] } => {
	const slug = override ?? declared?.slug ?? "intervention";
	const frame = defaultFrames.find((candidate) => candidate.slug === slug);
	if (!frame) {
		return {
			findings: [
				{
					level: "error",
					code: "FRAME_UNKNOWN",
					field: "frame.slug",
					file: override ? undefined : configPath,
					message: `Frame "${slug}" is not one of Bookkit's frames, so the chapters were not checked against one.${didYouMean(slug, FRAME_SLUGS)}`,
					fix: `${override ? "Use" : "Set frame.slug in book.config.ts to"} one of: ${FRAME_SLUGS.join(", ")}.`,
				},
			],
		};
	}
	const ids = frame.steps.map((step) => step.id);
	const required = frame.steps
		.filter((step) => step.required)
		.map((step) => step.id);
	// An override names another frame; the config's steps belong to its own.
	const listed = override === undefined ? declared?.steps : undefined;
	if (!listed) return { frame: { frame, steps: required }, findings: [] };
	const findings: BookFinding[] = [];
	for (const id of listed.filter((step) => !ids.includes(step))) {
		findings.push({
			level: "error",
			code: "FRAME_STEP_UNKNOWN",
			field: "frame.steps",
			file: configPath,
			message: `frame.steps names "${id}", which is not a step of the ${frame.slug} frame.${didYouMean(id, ids)}`,
			fix: `List the ${frame.slug} frame's steps in frame.steps: ${ids.join(", ")}.`,
		});
	}
	for (const id of required.filter((step) => !listed.includes(step))) {
		findings.push({
			level: "error",
			code: "FRAME_STEP_REQUIRED",
			field: "frame.steps",
			file: configPath,
			message: `frame.steps leaves out "${id}", which the ${frame.slug} frame requires`,
			fix: `Add "${id}" to frame.steps in book.config.ts. A book can add a frame's optional steps but cannot drop a required one.`,
		});
	}
	return {
		frame: {
			frame,
			steps: ids.filter((id) => required.includes(id) || listed.includes(id)),
		},
		findings,
	};
};

/**
 * The frame steps the book does not cover: in its framing chapter
 * (00-overview.mdx) when it has one, else in its chapters taken together (an
 * imported book has no overview). A step is covered by a heading whose whole
 * text slugs to it (`frameStepsInPage`).
 */
export const frameFinding = (
	workspaceRoot: string,
	book: string,
	{ frame, steps }: BookFrame,
	chapters: readonly ParsedSource[],
): BookFinding | null => {
	const overview = join(
		bookContentDir(workspaceRoot, book),
		"chapters",
		"00-overview.mdx",
	);
	const hasOverview = existsSync(overview);
	if (!hasOverview && chapters.length === 0) return null;
	const sources = hasOverview
		? [readFileSync(overview, "utf8")]
		: chapters.map((chapter) => chapter.source);
	const present = new Set(
		sources.flatMap((source) =>
			frameStepsInPage(frame, parseFrontmatter(source).body),
		),
	);
	const missingSteps = steps.filter((id) => !present.has(id));
	if (missingSteps.length === 0) return null;
	const example =
		frame.steps.find((step) => step.id === missingSteps[0])?.label ??
		missingSteps[0];
	return hasOverview
		? {
				level: "warning",
				code: "FRAME_STEP_MISSING",
				message: `Framing chapter (00-overview.mdx) for frame "${frame.slug}" is missing required step(s): ${missingSteps.join(", ")}`,
				fix: `Add a heading for each missing step to chapters/00-overview.mdx, its whole text the step's name (e.g. "## ${example}"); the ${frame.slug} frame requires them in that chapter.`,
			}
		: {
				level: "warning",
				code: "FRAME_STEP_MISSING",
				message: `No chapter covers the "${frame.slug}" frame's step(s): ${missingSteps.join(", ")}`,
				fix: `Give the chapter that covers each a heading whose whole text is the step's name (e.g. "## ${example}"), or add a chapters/00-overview.mdx that walks through every step. If the book is another kind, set frame in book.config.ts.`,
			};
};
