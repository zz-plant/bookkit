// `virtual:bookkit/book`, served by the bookkit() integration from the book
// app it builds (see `bookModuleSource` in integration.ts). Only the engine's
// routes import it; a book's own page reads the book through
// `@bookkit/astro-bookkit/routes/runtime`.

declare module "virtual:bookkit/book" {
	/** The default export of the book's src/book.config.ts. */
	export const bookConfig: import("./book/config").BookConfig;
	/** The book's content, globbed from src/content/book/. */
	export const modules: import("./book/app-helpers").BookEntrypointModules;
}
