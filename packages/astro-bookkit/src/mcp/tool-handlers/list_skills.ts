import type { ToolHandler } from "./types";

export const handleListSkills: ToolHandler = ({ options }) => {
  const skills = (options.governanceResources ?? [])
    .filter((resource) => resource.uri.startsWith("bookkit://governance/.codex/skills/"))
    .map((resource) => {
      const slug = resource.uri
        .replace("bookkit://governance/.codex/skills/", "")
        .replace(/\/SKILL\.md$/, "")
        .replace("README.md", "README");
      const firstLine = resource.text
        .split("\n")
        .find((line) => line.trim().startsWith("#"))
        ?.replace(/^#+\s*/, "")
        .trim();

      return { slug, name: firstLine || slug, uri: resource.uri };
    })
    .filter((skill) => skill.slug !== "README");

  return {
    ok: true,
    summary: `Found ${skills.length} local skills.`,
    payload: {
      skills,
      count: skills.length,
      guidance: "Read each skill URI for lane-specific checklists before making changes.",
    },
  };
};
