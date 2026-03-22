export type ElementCtor<T extends Element> = abstract new (...args: any[]) => T;

const isElementOfType = <T extends Element>(value: Element | null, ctor: ElementCtor<T>): value is T =>
  value instanceof ctor;

export const queryElement = <T extends Element>(
  root: ParentNode,
  selector: string,
  ctor: ElementCtor<T>
): T | null => {
  const value = root.querySelector(selector);
  return isElementOfType(value, ctor) ? value : null;
};

export const queryAllElements = <T extends Element>(
  root: ParentNode,
  selector: string,
  ctor: ElementCtor<T>
): T[] => Array.from(root.querySelectorAll(selector)).filter((value): value is T => value instanceof ctor);

export const isEditableTarget = (target: EventTarget | null): target is HTMLElement =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export const toSafeUrl = (value: string | null | undefined): string => {
  if (typeof value !== "string") return "#";
  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch {
    // Ignore invalid URLs.
  }
  return "#";
};

export const appendHighlightedText = (
  element: HTMLElement,
  value: string,
  tokens: string[]
): void => {
  const escapedTokens = tokens
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .filter(Boolean);

  if (!escapedTokens.length) {
    element.textContent = value;
    return;
  }

  const matcher = new RegExp(`(${escapedTokens.join("|")})`, "gi");
  value.split(matcher).forEach((fragment) => {
    if (!fragment) return;
    if (escapedTokens.some((token) => new RegExp(`^${token}$`, "i").test(fragment))) {
      const mark = document.createElement("mark");
      mark.textContent = fragment;
      element.appendChild(mark);
      return;
    }
    element.appendChild(document.createTextNode(fragment));
  });
};
