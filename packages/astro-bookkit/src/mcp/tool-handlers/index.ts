import type { ToolName } from "../tool-definitions";
import type { McpEndpointOptions } from "../types";
import { handleCheckSeparation } from "./check_separation";
import { handleCreateBook } from "./create_book";
import { handleListBooks } from "./list_books";
import { handleListContent } from "./list_content";
import { handleListMechanisms } from "./list_mechanisms";
import { handleListSkills } from "./list_skills";
import { handleReadBook } from "./read_book";
import type { ToolHandlerMap } from "./types";
import { handleValidateBook } from "./validate_book";

const TOOL_HANDLERS: ToolHandlerMap = {
  "bookkit.create_book": handleCreateBook,
  "bookkit.read_book": handleReadBook,
  "bookkit.list_books": handleListBooks,
  "bookkit.list_content": handleListContent,
  "bookkit.list_skills": handleListSkills,
  "bookkit.list_mechanisms": handleListMechanisms,
  "bookkit.validate_book": handleValidateBook,
  "bookkit.check_separation": handleCheckSeparation,
};

export const runTool = (options: McpEndpointOptions, name: ToolName, args?: Record<string, unknown>) => {
  return TOOL_HANDLERS[name]({ options, args });
};
