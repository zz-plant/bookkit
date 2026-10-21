import type { ToolName } from "../tool-definitions";
import type { McpEndpointOptions, ToolResponse } from "../types";
import { handleCheckContent } from "./check_content";
import { handleCheckCorpus } from "./check_corpus";
import { handleCheckSeparation } from "./check_separation";
import { handleCompileBook } from "./compile_book";
import { handleCreateBook } from "./create_book";
import { handleExportBook } from "./export_book";
import { handleFindSimilarMechanisms } from "./find_similar_mechanisms";
import { handleGetContentContract } from "./get_content_contract";
import { handleListBooks } from "./list_books";
import { handleListContent } from "./list_content";
import { handleListMechanisms } from "./list_mechanisms";
import { handleListSkills } from "./list_skills";
import { handleReadBook } from "./read_book";
import type { ToolHandlerMap } from "./types";
import { handleValidateBook } from "./validate_book";
import { handleWriteContent } from "./write_content";

const TOOL_HANDLERS: ToolHandlerMap = {
	"bookkit.compile_book": handleCompileBook,
	"bookkit.create_book": handleCreateBook,
	"bookkit.export_book": handleExportBook,
	"bookkit.read_book": handleReadBook,
	"bookkit.list_books": handleListBooks,
	"bookkit.list_content": handleListContent,
	"bookkit.list_skills": handleListSkills,
	"bookkit.list_mechanisms": handleListMechanisms,
	"bookkit.validate_book": handleValidateBook,
	"bookkit.check_separation": handleCheckSeparation,
	"bookkit.check_corpus": handleCheckCorpus,
	"bookkit.find_similar_mechanisms": handleFindSimilarMechanisms,
	"bookkit.get_content_contract": handleGetContentContract,
	"bookkit.check_content": handleCheckContent,
	"bookkit.write_content": handleWriteContent,
};

export const runTool = async (
	options: McpEndpointOptions,
	name: ToolName,
	args?: Record<string, unknown>,
): Promise<ToolResponse> => TOOL_HANDLERS[name]({ options, args });
