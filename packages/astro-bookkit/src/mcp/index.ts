export { createBookMcpEndpoint } from "./endpoint";
export type { McpEndpointOptions, McpResourceInput } from "./endpoint";
export {
  CORE_GOVERNANCE_FILE_RESOURCES,
  createGovernanceResourcesFromFiles,
  DEFAULT_GOVERNANCE_FILE_RESOURCES,
} from "./governance";
export type { GovernanceFileResource } from "./governance";
export { createBookMcpEndpointFromWorkspace, findWorkspaceRoot } from "./workspace";
export type { CreateBookMcpEndpointFromWorkspaceOptions } from "./workspace";
