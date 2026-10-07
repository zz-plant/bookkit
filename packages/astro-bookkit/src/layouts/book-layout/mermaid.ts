const mermaidBlocks = Array.from(
	document.querySelectorAll("pre > code.language-mermaid, pre > code.mermaid"),
);
if (mermaidBlocks.length) {
	const { default: mermaid } = await import("mermaid");
	const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
	mermaid.initialize({
		startOnLoad: false,
		theme: prefersDark ? "dark" : "default",
	});
	const nodes = mermaidBlocks.map((code) => {
		const pre = code.parentElement;
		const container = document.createElement("div");
		container.className = "mermaid";
		container.textContent = code.textContent ?? "";
		pre?.replaceWith(container);
		return container;
	});
	await mermaid.run({ nodes });
}

export {};
