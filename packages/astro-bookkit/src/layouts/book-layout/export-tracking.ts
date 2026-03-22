import { sendJsonBeacon } from "./analytics-buffer";

export type ExportEventPayload = {
  type: "download";
  format?: string;
  scope?: string;
  slug: string | null;
  href: string | null;
  path: string;
};

type ExportTrackingOptions = {
  endpoint: string | null | undefined;
  recordEvent: (payload: ExportEventPayload) => void;
};

export const initializeExportTracking = ({ endpoint, recordEvent }: ExportTrackingOptions): void => {
  document.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target.closest("[data-export-link]") : null;
    if (!(target instanceof HTMLAnchorElement)) return;

    const payload: ExportEventPayload = {
      type: "download",
      format: target.dataset.exportFormat,
      scope: target.dataset.exportScope,
      slug: target.dataset.exportSlug ?? null,
      href: target.getAttribute("href"),
      path: window.location.pathname,
    };
    recordEvent(payload);
    sendJsonBeacon(endpoint, payload);
  });
};
