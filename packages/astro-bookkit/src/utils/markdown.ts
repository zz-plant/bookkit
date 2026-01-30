export const createSlugger = () => {
  const used = new Map<string, number>();
  return (value: string) => {
    const base = value
      .toLowerCase()
      .trim()
      .replace(/[`~!@#$%^&*()=+\[{}\]\\|;:'",.<>/?]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-/, "")
      .replace(/-$/, "");
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    if (!base) return "section";
    return count ? `${base}-${count}` : base;
  };
};

export const stripMarkdown = (value: string) => {
  return value
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/\[(.*?)\]\([^)]*\)/g, "$1")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_{1,3}(.*?)_{1,3}/g, "$1")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/^\s*[-*+]\s+/g, "")
    .replace(/^\s*\d+\.\s+/g, "")
    .trim();
};
