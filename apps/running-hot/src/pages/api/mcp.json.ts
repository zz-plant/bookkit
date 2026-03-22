import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { bookRuntime } from "../../lib/book-runtime";

const currentDir = dirname(fileURLToPath(import.meta.url));

export const { GET, POST } = bookRuntime.api.createMcpHandlers(currentDir);
