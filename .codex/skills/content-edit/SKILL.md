# content-edit skill

Use this skill when editing `apps/<book>/src/content/book/**` or related book-app copy/routes.

## Guardrails
- Never add book-specific behavior in content files.
- Keep mechanism slugs stable; do not rename existing slugs.
- Keep examples replaceable and not mechanism-defining.

## Required checklist
1. Confirm file scope is app/content lane only.
2. Run:
   - `bun run validate:book -- --book <book>`
3. If glossary/mechanism content changed, ensure terminology stays aligned.

## Output expectations
- Summarize changed modules and user-facing impact.
- If mechanism definitions changed, flag as potentially breaking.
