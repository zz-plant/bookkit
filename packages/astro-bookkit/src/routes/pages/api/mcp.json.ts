import { bookRuntime } from "../../runtime";

// The MCP tools find the workspace by walking up from the book's folder.
export const { GET, POST } = bookRuntime.api.createMcpHandlers(
	import.meta.env.BOOKKIT_ROOT ?? process.cwd(),
);
