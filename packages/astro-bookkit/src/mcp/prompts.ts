import { extractFrontmatterField, normalizeModuleSlug } from "./resource-utils";
import type { ContentTypeKey, McpEndpointOptions } from "./types";

/**
 * MCP prompts: the book's own workflows, as a client offers them to its
 * user (`prompts/list`, `prompts/get`). Two are for readers, who bring their
 * own situation to a mechanism or a tool; one is for an author's agent,
 * which drafts through the same checks `bookkit check` runs. A prompt that
 * names an entry carries that entry's file, so it works without tool calls.
 */

export type PromptArgument = {
	name: string;
	description: string;
	required: boolean;
};

export type PromptDefinition = {
	name: string;
	description: string;
	arguments: PromptArgument[];
};

export const PROMPT_DEFINITIONS: readonly PromptDefinition[] = [
	{
		name: "bookkit.apply_mechanism",
		description:
			"Test one of the book's mechanisms against a situation of yours, with its definition, its boundaries, and its tests.",
		arguments: [
			{
				name: "mechanism",
				description: "The mechanism's slug",
				required: true,
			},
			{
				name: "situation",
				description: "What you are dealing with, in your own words",
				required: true,
			},
		],
	},
	{
		name: "bookkit.run_tool",
		description:
			"Walk through one of the book's ten-minute tools, one step at a time, on a situation of yours.",
		arguments: [
			{ name: "tool", description: "The tool's slug", required: true },
			{
				name: "situation",
				description: "What you want to use it on (optional)",
				required: false,
			},
		],
	},
	{
		name: "bookkit.draft_chapter",
		description:
			"Draft or redraft a chapter with the book's tools: read its contract, write, and pass check_content before write_content.",
		arguments: [
			{ name: "chapter", description: "The chapter's slug", required: true },
		],
	},
];

export type PromptMessage = {
	role: "user";
	content: { type: "text"; text: string };
};

export type PromptResult = { description: string; messages: PromptMessage[] };

/**
 * Each entry of a section by the slug a reader knows it by: its frontmatter
 * `slug:`, else its file name (what resource URIs use; a chapter's file name
 * carries its number).
 */
const entriesOf = (options: McpEndpointOptions, section: ContentTypeKey) =>
	Object.entries(options.contentRawModules[section] ?? {})
		.map(([key, text]) => ({
			file: normalizeModuleSlug(key, section),
			slug:
				extractFrontmatterField(text, "slug") ||
				normalizeModuleSlug(key, section),
			text,
		}))
		.sort((a, b) => a.slug.localeCompare(b.slug));

const entryOf = (
	options: McpEndpointOptions,
	section: ContentTypeKey,
	name: string,
): string | undefined =>
	entriesOf(options, section).find(
		(entry) => entry.slug === name || entry.file === name,
	)?.text;

const slugsOf = (options: McpEndpointOptions, section: ContentTypeKey) =>
	entriesOf(options, section).map((entry) => entry.slug);

const user = (text: string): PromptMessage[] => [
	{ role: "user", content: { type: "text", text } },
];

/** The prompt `name` filled with `args`, or what is missing and how to fix it. */
export const getPrompt = (
	options: McpEndpointOptions,
	name: string,
	args: Record<string, unknown> = {},
): PromptResult | { error: string } => {
	const definition = PROMPT_DEFINITIONS.find((prompt) => prompt.name === name);
	if (!definition) {
		return {
			error: `Unknown prompt: ${name}. Call prompts/list for the prompts this server offers.`,
		};
	}
	const value = (key: string) =>
		typeof args[key] === "string" ? (args[key] as string).trim() : "";
	const missing = definition.arguments.filter(
		(argument) => argument.required && !value(argument.name),
	);
	if (missing.length > 0) {
		return {
			error: `${name} needs ${missing.map((argument) => argument.name).join(" and ")}.`,
		};
	}
	const book = options.bookTitle;
	if (name === "bookkit.apply_mechanism") {
		const slug = value("mechanism");
		const entry = entryOf(options, "mechanisms", slug);
		if (!entry) {
			return {
				error: `${book} has no mechanism "${slug}". Its mechanisms: ${slugsOf(options, "mechanisms").join(", ")}.`,
			};
		}
		return {
			description: `${definition.description} (${slug}, from ${book})`,
			messages:
				user(`Below is a mechanism from the book "${book}": its definition, what it is and is not, and its tests. Use it on my situation.

1. Run each of its tests on my situation, one at a time, and say what each shows. Ask me for what a test needs and I have not said.
2. Check my situation against what it is not. If one of those fits better, say so: the mechanism does not apply.
3. Only then say whether it applies, and if it does, which part of my situation it explains.

Use the mechanism as the book defines it. Do not widen it, rename it, or add facts about my situation I have not given.

My situation: ${value("situation")}

<mechanism>
${entry.trim()}
</mechanism>`),
		};
	}
	if (name === "bookkit.run_tool") {
		const slug = value("tool");
		const entry = entryOf(options, "toolkit", slug);
		if (!entry) {
			return {
				error: `${book} has no tool "${slug}". Its tools: ${slugsOf(options, "toolkit").join(", ")}.`,
			};
		}
		const situation = value("situation");
		return {
			description: `${definition.description} (${slug}, from ${book})`,
			messages:
				user(`Below is a tool from the book "${book}": a short action with a trigger, steps, and what failure looks like. Walk me through it.

Give me one step at a time, as the tool states it, and wait for me to say it is done or what happened before the next. If what I say matches what failure looks like, say so and stop there. Keep it to the tool's time box. Do not add steps of your own.
${situation ? `\nWhat I want to use it on: ${situation}\n` : "\nFirst ask me what I want to use it on, then check it against the tool's trigger.\n"}
<tool>
${entry.trim()}
</tool>`),
		};
	}
	const slug = value("chapter");
	const entry = entryOf(options, "chapters", slug);
	if (!entry) {
		return {
			error: `${book} has no chapter "${slug}". Its chapters: ${slugsOf(options, "chapters").join(", ")}.`,
		};
	}
	return {
		description: `${definition.description} (${slug}, from ${book})`,
		messages:
			user(`Draft the chapter "${slug}" of "${book}" with the bookkit tools. The current file is below.

1. Call bookkit.get_content_contract for the chapter section, and bookkit.list_mechanisms for the book.
2. Keep its claim, its planned sections in order, and its slug, title, status, and prerequisites. Use the book's mechanisms by their titles and as defined; bind each one you rely on under mechanisms:, and coin none. State no fact this file and the mechanisms do not supply.
3. Call bookkit.check_content on your draft, and fix every error it reports until it passes.
4. Show me the draft and the check's result. Call bookkit.write_content with overwrite: true only when I say to.

<chapter>
${entry.trim()}
</chapter>`),
	};
};
