import { createMcpApiHandlers } from "../../lib/book-runtime";

export const { GET, POST } = createMcpApiHandlers(import.meta.url);
