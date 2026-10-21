import { describe, expect, it } from "bun:test";
import {
	attributeRefusal,
	CONTENT_ELEMENTS,
	componentPropRefusal,
	elementVerdict,
	embedTitle,
	KEPT_ELEMENTS,
	literalValue,
	opensNewWindow,
	withNoopener,
} from "./html-allowlist";

describe("the elements content may use", () => {
	it("are what Markdown writes and what import keeps, with an embed", () => {
		for (const name of [
			...KEPT_ELEMENTS,
			"pre",
			"iframe",
			"sup",
			"section",
			"table",
		]) {
			expect(CONTENT_ELEMENTS.has(name), name).toBe(true);
		}
		// A task list's checkbox is Markdown's own, never raw HTML's.
		expect(CONTENT_ELEMENTS.has("input")).toBe(false);
	});

	it("keep, leave out with what they hold, or leave out keeping it", () => {
		expect(elementVerdict("KBD")).toBe("keep");
		for (const name of [
			"script",
			"sCRIPT",
			"style",
			"meta",
			"base",
			"link",
			"template",
			"noscript",
			"title",
			"svg:script",
		]) {
			expect(elementVerdict(name), name).toBe("drop");
		}
		for (const name of ["form", "button", "svg", "math", "object", "body"]) {
			expect(elementVerdict(name), name).toBe("unwrap");
		}
	});
});

describe("the attributes a kept element may carry", () => {
	it("refuse event handlers in any case, style, srcdoc, and set:html", () => {
		for (const name of ["onerror", "ONERROR", "onError", "onfocus"]) {
			expect(attributeRefusal("img", name, "alert(1)"), name).toBe("handler");
		}
		expect(attributeRefusal("p", "style", "color:red")).toBe("style");
		expect(attributeRefusal("iframe", "srcDoc", "<b>x</b>")).toBe("document");
		expect(attributeRefusal("div", "set:html", "<b>x</b>")).toBe("raw-html");
	});

	it("keep the global ones and each element's own, and refuse the rest", () => {
		for (const [element, name] of [
			["span", "id"],
			["span", "className"],
			["span", "aria-label"],
			["td", "colSpan"],
			["img", "loading"],
			["p", "align"],
			["iframe", "allowfullscreen"],
			["time", "datetime"],
		]) {
			expect(attributeRefusal(element, name, "x"), `${element} ${name}`).toBe(
				null,
			);
		}
		for (const [element, name] of [
			["p", "data-resume-reading"],
			["a", "ping"],
			["a", "xlink:href"],
			["span", "hidden"],
			["p", "xml:base"],
			["div", "tabindex"],
		]) {
			expect(attributeRefusal(element, name, "x"), `${element} ${name}`).toBe(
				"unlisted",
			);
		}
	});

	it("hold an address to the link rule, written plainly or as an expression", () => {
		expect(attributeRefusal("a", "href", "https://example.com")).toBe(null);
		expect(attributeRefusal("a", "href", "/read/chapters/x")).toBe(null);
		expect(attributeRefusal("a", "href", "javascript:alert(1)")).toBe(
			"address",
		);
		expect(attributeRefusal("a", "href", "�javascript:x")).toBe("address");
		expect(attributeRefusal("iframe", "src", null)).toBe("address");
		expect(attributeRefusal("blockquote", "cite", "vbscript:x")).toBe(
			"address",
		);
		// An image keeps a data: source.
		expect(attributeRefusal("img", "src", "data:image/png;base64,AA")).toBe(
			null,
		);
		expect(attributeRefusal("span", "title", null)).toBe("expression");
	});

	it("let an embed ask for what video and map embeds need, and no more", () => {
		expect(
			attributeRefusal(
				"iframe",
				"allow",
				"accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
			),
		).toBe(null);
		expect(attributeRefusal("iframe", "allow", "autoplay; camera 'src'")).toBe(
			"permission",
		);
	});

	it("leave a component its props but set:html and expressions", () => {
		expect(componentPropRefusal("kind", "note")).toBe(null);
		expect(componentPropRefusal("set:html", "<b>x</b>")).toBe("raw-html");
		expect(componentPropRefusal("items", null)).toBe("expression");
	});

	it("read a plain literal in an expression, and nothing else", () => {
		expect(literalValue('"https://x"')).toBe("https://x");
		expect(literalValue(" 2 ")).toBe("2");
		expect(literalValue("`plain`")).toBe("plain");
		// A template with a placeholder (`${x}`), joined so it is not one here.
		expect(literalValue(["`$", "{x}`"].join(""))).toBe(null);
		expect(literalValue("url")).toBe(null);
		expect(literalValue('"a\\u0041"')).toBe(null);
	});

	it("give a link that opens a new window rel=noopener, and never rel=opener", () => {
		expect(opensNewWindow("_blank")).toBe(true);
		expect(opensNewWindow("other")).toBe(true);
		expect(opensNewWindow("_self")).toBe(false);
		expect(opensNewWindow("")).toBe(false);
		expect(withNoopener("")).toBe("noopener");
		expect(withNoopener("opener external")).toBe("external noopener");
		expect(withNoopener("noopener")).toBe("noopener");
	});
});

describe("an embed's title, when it has none", () => {
	it("names the page it shows, by its provider or its host", () => {
		expect(embedTitle("https://www.youtube.com/embed/abc")).toBe(
			"YouTube video",
		);
		expect(embedTitle("https://www.youtube-nocookie.com/embed/abc")).toBe(
			"YouTube video",
		);
		expect(embedTitle("https://player.vimeo.com/video/1")).toBe("Vimeo video");
		expect(embedTitle("https://www.google.com/maps/embed?pb=x")).toBe(
			"Google Maps map",
		);
		expect(embedTitle("https://codepen.io/a/embed/b")).toBe(
			"Embedded page from codepen.io",
		);
		expect(embedTitle("/read/chapters/x")).toBe("Embedded page");
	});
});
