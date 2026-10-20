import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Text in bookkit.css meets WCAG AA (4.5:1) in both themes: words are set in
 * ink or --color-muted, and --color-faint is kept for marks (underlines,
 * separators, list markers), where it is too light for words.
 */

const css = readFileSync(join(import.meta.dir, "bookkit.css"), "utf8").replace(
	/\/\*[\s\S]*?\*\//g,
	"",
);

const block = (selector: string): string => {
	const start = css.indexOf(`${selector} {`);
	expect(start, `${selector} block`).toBeGreaterThanOrEqual(0);
	return css.slice(start, css.indexOf("\n}", start));
};
const hex = (body: string, token: string) => {
	const value = body.match(new RegExp(`${token}:\\s*(#[0-9a-f]{6});`))?.[1];
	expect(value, token).toBeDefined();
	return [1, 3, 5].map((i) =>
		Number.parseInt(String(value).slice(i, i + 2), 16),
	);
};
/** The ink percentage of a grey defined as `color-mix(… ink N%, paper)`. */
const strength = (token: string) => {
	const value = css.match(
		new RegExp(
			`${token}:\\s*color-mix\\(\\s*in srgb,\\s*var\\(--color-ink\\) (\\d+)%,\\s*var\\(--color-paper\\)\\s*\\)`,
		),
	)?.[1];
	expect(value, token).toBeDefined();
	return Number(value) / 100;
};

const mix = (ink: number[], paper: number[], share: number) =>
	ink.map((channel, i) => Math.round(channel * share + paper[i] * (1 - share)));
const luminance = (rgb: number[]) => {
	const [r, g, b] = rgb.map((channel) => {
		const c = channel / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: number[], b: number[]) => {
	const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (light + 0.05) / (dark + 0.05);
};

const themes = {
	light: block(":root"),
	dark: block(':root[data-theme="dark"]'),
};

describe("text contrast in bookkit.css", () => {
	it("keeps --color-muted at 4.5:1 or more on paper and on the muted surface, in both themes", () => {
		const muted = strength("--color-muted");
		const surface = strength("--color-surface-muted");
		for (const [theme, body] of Object.entries(themes)) {
			const ink = hex(body, "--color-ink");
			const paper = hex(body, "--color-paper");
			const text = mix(ink, paper, muted);
			for (const [background, rgb] of [
				["paper", paper],
				["surface-muted", mix(ink, paper, surface)],
			] as const) {
				expect(
					contrast(text, rgb),
					`muted on ${background}, ${theme}`,
				).toBeGreaterThanOrEqual(4.5);
			}
		}
	});

	it("sets no text in --color-faint, which is under 4.5:1", () => {
		const faint = strength("--color-faint");
		for (const body of Object.values(themes)) {
			const ink = hex(body, "--color-ink");
			const paper = hex(body, "--color-paper");
			expect(contrast(mix(ink, paper, faint), paper)).toBeLessThan(4.5);
		}
		// Each rule whose own `color` is faint, by its selector.
		const textRules = [
			...css.matchAll(/(?:^|[;{}])\s*color:\s*var\(--color-faint\)/g),
		]
			.map((match) => {
				const open = css.lastIndexOf("{", match.index);
				const before = css.slice(0, open);
				return before
					.slice(Math.max(before.lastIndexOf("}"), before.lastIndexOf("{")) + 1)
					.trim();
			})
			.filter((selector) => !/::(before|after|marker)\b/.test(selector));
		expect(textRules).toEqual([]);
	});
});
