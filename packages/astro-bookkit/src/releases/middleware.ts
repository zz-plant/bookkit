import type { MiddlewareHandler } from "astro";
import { extractVersionFromPath, stripVersionFromPath, type BookVersionEntry } from "./versions";
import { ORIGINAL_URL_HEADER } from "../utils/request";

export type VersionRoutingOptions = {
  versions?: BookVersionEntry[];
  prefixSegment?: string;
  defaultVersion?: string;
};

export const createVersionRoutingMiddleware = (
  options: VersionRoutingOptions = {}
): MiddlewareHandler => {
  const versions = Array.isArray(options.versions) ? options.versions : [];
  const prefixSegment = options.prefixSegment ?? "v";
  const knownVersions = new Set(versions.map((entry) => entry.version).filter(Boolean));
  const latestVersion = versions.find((entry) => entry.isLatest)?.version ?? options.defaultVersion;

  return async (context, next) => {
    if (!knownVersions.size) {
      return next();
    }

    if (typeof context.locals.originalUrl !== "string") {
      context.locals.originalUrl = context.request.url;
    }
    const originalUrl = context.locals.originalUrl;

    const url = new URL(context.request.url);
    const pathVersion = extractVersionFromPath(url.pathname, { prefixSegment });
    const isKnownVersion = pathVersion ? knownVersions.has(pathVersion) : false;

    if (isKnownVersion && pathVersion) {
      context.locals.bookVersion = pathVersion;
      const strippedPath = stripVersionFromPath(url.pathname, { prefixSegment });
      if (strippedPath !== url.pathname) {
        url.pathname = strippedPath;
        const rewrittenRequest = new Request(url, context.request);
        rewrittenRequest.headers.set(ORIGINAL_URL_HEADER, originalUrl);
        return next(rewrittenRequest);
      }
      return next();
    }

    context.locals.bookVersion = latestVersion;
    return next();
  };
};
