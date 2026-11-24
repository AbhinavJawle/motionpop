# Spec 43: Modular User & Database Skills (`SKILL.md` Import + Firestore Registry) — Requirements

## Goal
Let creators import, create, edit, delete, and apply modular Markdown video-direction skills (like `SKILL.md` files from external repos such as `lemo-opuscar`, local `.md` uploads, or pasted Markdown) stored in Firestore (`users/{uid}/skills/{id}`) with local browser caching, and plug them seamlessly into `SkillRegistry`, `/skills`, `/recipes`, `/start`, `/start/configure`, `reel.direct`, and `film.direct`.

## Requirements (EARS)
- **R1 (User Skill Schema & Persistence):**
  - Every custom skill shall validate against `UserSkillSchema` (id, name, blurb, target engine `'both' | 'reel' | 'film'`, baseRecipeId, look, accent hex, captionStyle, hookStyle, music mood, markdown up to 16 KB, optional sourceUrl, timestamps).
  - Firestore rules shall allow owner-only read/write on `users/{uid}/skills/{id}`.
  - The browser store (`apps/web/lib/skills/user-skills.ts`) shall persist locally in `localStorage` immediately and sync bidirectionally with Firestore when Firebase is enabled and a user is signed in.
- **R2 (Markdown Parser & Safe GitHub Import):**
  - `parseSkillMarkdown()` shall parse YAML frontmatter (`name`, `title`, `description`, `blurb`, `target`, `accent`, `look`, `recipe`, `caption_style`, `hook_style`, `music`), first `# Heading`, and lead paragraph, and produce bounded `instructions` (`<= 3000` chars) ready for AI director injection.
  - `/api/skills/import` shall fetch Markdown strictly from allowlisted HTTPS hosts (`github.com`, `raw.githubusercontent.com`), converting repo URLs and blob URLs to raw URLs, capped at 128 KB with timeout protection (SSRF-safe).
- **R3 (UI & Live Pipeline Integration):**
  - `/skills` and `/recipes` shall provide an **"Import / Create Skill"** modal supporting paste `SKILL.md`, GitHub URL import, local `.md` file upload, and example skill starter, plus **Use in new video** (`/start?skill=<id>`), **Edit**, and **Delete**.
  - `/start` shall read `?skill=<id>` into `StartDraft.userSkillId`, and `/start/configure` shall list saved user skills alongside built-in recipes, attach `edit.userSkill`, display the active skill in the summary panel, and inject its condensed Markdown instructions into `reel.direct` (`recipeBlock`) and `film.direct` (`makeFilm`).
