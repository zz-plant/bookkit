import { buildBrief, buildChecklist, buildCommands, buildConfig, buildOgUrlList, buildPayload, buildSeoStarter, normalizeInput } from "./utils";

const form = document.querySelector<HTMLFormElement>("[data-new-book-form]");
const output = document.querySelector<HTMLElement>("[data-studio-output]");
if (!form || !output) {
  // no-op on pages without studio
} else {
  const nodes = {
    brief: document.querySelector<HTMLElement>('[data-output="brief"]'),
    checklist: document.querySelector<HTMLElement>('[data-output="checklist"]'),
    config: document.querySelector<HTMLElement>('[data-output="config"]'),
    seo: document.querySelector<HTMLElement>('[data-output="seo"]'),
    ogUrls: document.querySelector<HTMLElement>('[data-output="ogUrls"]'),
    payload: document.querySelector<HTMLElement>('[data-output="payload"]'),
    commands: document.querySelector<HTMLElement>('[data-output="commands"]'),
  };

  let latestPackage: Record<string, unknown> | null = null;
  const setText = (node: HTMLElement | null, value: string) => { if (node) node.textContent = value; };
  const toastRegion = document.querySelector<HTMLElement>("[data-studio-toast-region]");
  const progressNode = document.querySelector<HTMLProgressElement>("[data-studio-progress]");
  const progressLabelNode = document.querySelector<HTMLElement>("[data-studio-progress-label]");
  const resetDialog = document.querySelector<HTMLDialogElement>("[data-reset-confirm]");
  const pushToast = (message: string) => {
    if (!toastRegion) return;
    const toast = document.createElement("div");
    toast.className = "studio__toast";
    toast.setAttribute("role", "status");
    toast.textContent = message;
    toastRegion.appendChild(toast);
    window.setTimeout(() => {
      toast.remove();
    }, 2200);
  };

  const updateProgress = () => {
    const fields = Array.from(form.querySelectorAll("input:not([type='checkbox']), textarea, select"));
    const completed = fields.filter((field) => {
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) return false;
      return field.value.trim().length > 0;
    }).length;
    const percent = fields.length ? Math.round((completed / fields.length) * 100) : 0;
    if (progressNode) progressNode.value = percent;
    if (progressLabelNode) progressLabelNode.textContent = `${percent}% complete`;
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const values = normalizeInput(new FormData(form));
    if (!values.bookTitle || !values.promise) return;

    const payload = buildPayload(values);
    latestPackage = {
      createdAt: new Date().toISOString(),
      brief: buildBrief(values),
      checklist: buildChecklist(values),
      config: buildConfig(values),
      seo: buildSeoStarter(values),
      ogUrls: buildOgUrlList(values),
      payload,
      commands: buildCommands(values),
    };

    setText(nodes.brief, String(latestPackage.brief ?? ""));
    setText(nodes.checklist, String(latestPackage.checklist ?? ""));
    setText(nodes.config, String(latestPackage.config ?? ""));
    setText(nodes.seo, String(latestPackage.seo ?? ""));
    setText(nodes.ogUrls, String(latestPackage.ogUrls ?? ""));
    setText(nodes.payload, JSON.stringify(payload, null, 2));
    setText(nodes.commands, String(latestPackage.commands ?? ""));

    output.removeAttribute("hidden");
    output.scrollIntoView({ behavior: "smooth", block: "start" });
    pushToast("Starter package generated.");
  });

  form.addEventListener("input", updateProgress);
  updateProgress();

  document.querySelector("[data-fill-example]")?.addEventListener("click", () => {
    const defaults: Record<string, string> = {
      bookTitle: "Operator Playbook",
      promise: "Help teams diagnose delivery friction and apply fixes in one sprint.",
      audience: "Team leads and technical program leaders",
      mechanisms: "constraint-mapping\nfeedback-cadence\nrisk-budgeting",
      chapters: "overview\noperating-rhythm\nrecovery-patterns",
      locales: "en, es",
      bookKey: "operator-playbook",
      siteUrl: "https://operator-playbook.book",
      domains: "https://www.operator-playbook.com",
      defaultMetaDescription: "A practical guide to reducing delivery bottlenecks with small, reversible operating changes.",
      defaultOgImage: "/og/default.svg",
      ogSiteName: "Operator Playbook",
      ogLocale: "en_US",
      ogImageAlt: "Cover image for Operator Playbook",
      twitterCard: "summary_large_image",
      ogSurfaces: "home=/og/home.svg\nread-hub=/og/read-hub.svg",
    };
    Object.entries(defaults).forEach(([name, value]) => {
      const field = form.elements.namedItem(name);
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
        field.value = value;
      }
    });
    updateProgress();
  });

  document.querySelectorAll<HTMLElement>("[data-copy-target]").forEach((button) => {
    button.addEventListener("click", async () => {
      const target = button.getAttribute("data-copy-target");
      const node = target ? document.querySelector<HTMLElement>(`[data-output="${target}"]`) : null;
      if (!node?.textContent) return;
      try {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(node.textContent);
        const original = button.textContent;
        button.textContent = "Copied";
        window.setTimeout(() => (button.textContent = original || "Copy"), 1500);
        pushToast("Copied to clipboard.");
      } catch {}
    });
  });

  document.querySelector("[data-download-package]")?.addEventListener("click", () => {
    if (!latestPackage) return;
    const blob = new Blob([JSON.stringify(latestPackage, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `book-starter-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
    pushToast("Downloaded starter package JSON.");
  });

  document.querySelector("[data-reset-form]")?.addEventListener("click", () => {
    if (resetDialog?.showModal) {
      resetDialog.showModal();
      return;
    }
    form.reset();
    output.setAttribute("hidden", "true");
    updateProgress();
  });

  document.querySelector("[data-reset-cancel]")?.addEventListener("click", () => {
    resetDialog?.close();
  });

  document.querySelector("[data-reset-confirm-action]")?.addEventListener("click", () => {
    form.reset();
    output.setAttribute("hidden", "true");
    updateProgress();
    resetDialog?.close();
    pushToast("Form reset.");
  });
}
