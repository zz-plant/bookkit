/**
 * The MDX compile check, from the engine (validators/mdx-compile.ts), which
 * the MCP tools also run.
 */
export {
	compileBookFindings,
	compileFinding,
	compileMdx,
	type MdxCompileResult,
} from "../../packages/astro-bookkit/src/validators/mdx-compile";
