import type { MiddlewareHandler } from "astro";

export type PreviewTokenRecord = {
  token: string;
  label?: string;
  expiresAt?: string;
  revoked?: boolean;
};

export type PreviewAccessConfig = {
  enabled?: boolean;
  tokens: PreviewTokenRecord[];
  paramName?: string;
  cookieName?: string;
  protectedPaths?: string[];
  publicPaths?: string[];
  cookieMaxAgeDays?: number;
};

export type PreviewAccessStatus = "active" | "expired" | "revoked" | "missing" | "invalid";

export type PreviewAccessState = {
  isPreview: boolean;
  status: PreviewAccessStatus;
  token?: string;
  tokenHint?: string;
  label?: string;
  expiresAt?: string;
};

export type PreviewLinkStatus = PreviewTokenRecord & {
  status: Exclude<PreviewAccessStatus, "missing" | "invalid">;
  tokenHint: string;
};

export type PreviewLinkBuildOptions = {
  baseUrl?: string;
  path?: string;
  paramName?: string;
};

export type PreviewAccessMiddlewareOptions = PreviewAccessConfig & {
  siteTitle?: string;
};

const defaultCookieName = "preview_token";

const toDate = (value?: string): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const isExpired = (expiresAt?: string): boolean => {
  const date = toDate(expiresAt);
  if (!date) return false;
  return date.getTime() <= Date.now();
};

const matchesPath = (pathname: string, prefixes: string[] = []): boolean =>
  prefixes.some((prefix) => {
    if (!prefix) return false;
    if (prefix === "/") return true;
    if (pathname === prefix) return true;
    return pathname.startsWith(`${prefix}/`);
  });

export const getPreviewTokenHint = (token: string): string =>
  token.length <= 6 ? token : token.slice(-6);

export const resolvePreviewToken = (
  config: PreviewAccessConfig,
  token: string | undefined | null
): PreviewAccessState => {
  if (!token) {
    return { isPreview: false, status: "missing" };
  }

  const match = config.tokens.find((entry) => entry.token === token);
  if (!match) {
    return { isPreview: false, status: "invalid" };
  }

  if (match.revoked) {
    return {
      isPreview: false,
      status: "revoked",
      token,
      tokenHint: getPreviewTokenHint(token),
      label: match.label,
      expiresAt: match.expiresAt,
    };
  }

  if (isExpired(match.expiresAt)) {
    return {
      isPreview: false,
      status: "expired",
      token,
      tokenHint: getPreviewTokenHint(token),
      label: match.label,
      expiresAt: match.expiresAt,
    };
  }

  return {
    isPreview: true,
    status: "active",
    token,
    tokenHint: getPreviewTokenHint(token),
    label: match.label,
    expiresAt: match.expiresAt,
  };
};

export const resolvePreviewLinks = (config: PreviewAccessConfig): PreviewLinkStatus[] =>
  config.tokens.map((entry) => {
    const status = entry.revoked ? "revoked" : isExpired(entry.expiresAt) ? "expired" : "active";
    return {
      ...entry,
      status,
      tokenHint: getPreviewTokenHint(entry.token),
    };
  });

export const buildPreviewLink = (
  token: string,
  { baseUrl, path = "/", paramName = "preview" }: PreviewLinkBuildOptions = {}
): string => {
  const base = baseUrl ? new URL(baseUrl) : new URL("http://localhost");
  const url = new URL(path, base);
  url.searchParams.set(paramName, token);
  if (!baseUrl) {
    return `${url.pathname}${url.search}`;
  }
  return url.toString();
};

export const createPreviewLinks = (
  config: PreviewAccessConfig,
  { baseUrl, path, paramName }: PreviewLinkBuildOptions = {}
): Array<PreviewLinkStatus & { href: string }> => {
  const resolvedParam = paramName ?? config.paramName ?? "preview";
  return resolvePreviewLinks(config).map((link) => ({
    ...link,
    href: buildPreviewLink(link.token, { baseUrl, path, paramName: resolvedParam }),
  }));
};

export const getPreviewContext = (locals: Record<string, unknown>): PreviewAccessState | null => {
  const value = locals?.preview;
  if (!value || typeof value !== "object") return null;
  return value as PreviewAccessState;
};

const buildDeniedHtml = (title: string, message: string): string => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <meta name="robots" content="noindex, nofollow" />
  <style>
    body { font-family: system-ui, sans-serif; background: #f5f4f1; color: #191919; padding: 48px; }
    .panel { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 32px; box-shadow: 0 12px 28px rgba(0,0,0,0.08); }
    h1 { font-size: 1.6rem; margin-bottom: 12px; }
    p { line-height: 1.6; color: #4a4a4a; }
  </style>
</head>
<body>
  <div class="panel">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;

export const createPreviewAccessMiddleware = (
  options: PreviewAccessMiddlewareOptions
): MiddlewareHandler => {
  const {
    enabled = false,
    tokens,
    paramName = "preview",
    cookieName = defaultCookieName,
    protectedPaths = ["/"],
    publicPaths = [],
    cookieMaxAgeDays = 7,
    siteTitle = "Preview",
  } = options;

  return async (context, next) => {
    if (!enabled) {
      return next();
    }

    const url = new URL(context.request.url);
    const redirectUrl =
      typeof context.locals.originalUrl === "string"
        ? new URL(context.locals.originalUrl)
        : new URL(context.request.url);
    const pathname = url.pathname;

    if (matchesPath(pathname, publicPaths)) {
      return next();
    }

    if (!matchesPath(pathname, protectedPaths)) {
      return next();
    }

    const queryToken = url.searchParams.get(paramName);
    const cookieToken = context.cookies.get(cookieName)?.value;
    const queryState = queryToken ? resolvePreviewToken({ tokens }, queryToken) : null;
    const cookieState = cookieToken ? resolvePreviewToken({ tokens }, cookieToken) : null;
    const previewState = queryToken
      ? queryState?.isPreview
        ? queryState
        : cookieState?.isPreview
          ? cookieState
          : queryState ?? { isPreview: false, status: "missing" }
      : cookieState ?? { isPreview: false, status: "missing" };

    if (!previewState.isPreview) {
      if (cookieToken && !cookieState?.isPreview) {
        context.cookies.delete(cookieName, { path: "/" });
      }
      const title = `${siteTitle} preview required`;
      const message =
        previewState.status === "revoked"
          ? "This preview link has been revoked. Please request a new one from the author."
          : previewState.status === "expired"
            ? "This preview link has expired. Please request an updated preview link."
            : "This page is available only through a private preview link.";
      return new Response(buildDeniedHtml(title, message), {
        status: 401,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, max-age=0",
          "X-Robots-Tag": "noindex, nofollow",
        },
      });
    }

    context.locals.preview = previewState;

    if (queryToken && queryState?.isPreview) {
      const expires = previewState.expiresAt ? new Date(previewState.expiresAt) : undefined;
      const maxAge = previewState.expiresAt ? undefined : cookieMaxAgeDays * 24 * 60 * 60;
      context.cookies.set(cookieName, queryToken, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: url.protocol === "https:",
        expires,
        maxAge,
      });

      redirectUrl.searchParams.delete(paramName);
      return Response.redirect(redirectUrl.toString(), 302);
    }

    if (queryToken) {
      redirectUrl.searchParams.delete(paramName);
      return Response.redirect(redirectUrl.toString(), 302);
    }

    const response = await next();
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  };
};
