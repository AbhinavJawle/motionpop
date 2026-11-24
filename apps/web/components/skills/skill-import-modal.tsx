'use client';

import {
  builtInSkills,
  EXAMPLE_SKILL_MARKDOWN,
  parseSkillMarkdown,
  slugifySkillId,
  type ParsedSkillDraft,
} from '@motionpop/ai';
import {
  UserSkillSchema,
  type BuiltInRecipeKey,
  type ReelCaptionStyle,
  type ReelHookStyle,
  type ReelLook,
  type UserSkill,
  type UserSkillTarget,
} from '@motionpop/schemas';
import { Cloud, FileText, FolderGit2, Loader2, Sparkles, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { btn, paper, poster } from '@/components/paper/kit';
import { cn } from '@/lib/cn';

type InputTab = 'paste' | 'github' | 'upload';

const ACCENT_SWATCHES = ['#FF6A3D', '#2563EB', '#16A34A', '#9333EA', '#E11D48', '#D97706'] as const;

interface SkillImportModalProps {
  open: boolean;
  editing?: UserSkill | null;
  cloudSynced: boolean;
  onClose: () => void;
  onSave: (skill: UserSkill) => Promise<void>;
}

/**
 * Spec 35 Paper modal for creating or importing modular Markdown skills (`SKILL.md`, Spec 43).
 * Supports pasting Markdown, importing directly from a GitHub repo / file URL via `/api/skills/import`,
 * or uploading a local `.md` file.
 */
export function SkillImportModal({
  open,
  editing,
  cloudSynced,
  onClose,
  onSave,
}: SkillImportModalProps) {
  const [tab, setTab] = useState<InputTab>('paste');
  const [githubUrl, setGithubUrl] = useState(editing?.sourceUrl ?? '');
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(editing?.name ?? '');
  const [blurb, setBlurb] = useState(editing?.blurb ?? '');
  const [target, setTarget] = useState<UserSkillTarget>(editing?.target ?? 'both');
  const [baseRecipeId, setBaseRecipeId] = useState<BuiltInRecipeKey>(
    editing?.baseRecipeId ?? 'tech-explainer',
  );
  const [look, setLook] = useState<ReelLook>(editing?.look ?? 'mono');
  const [accent, setAccent] = useState(editing?.accent ?? '#FF6A3D');
  const [captionStyle, setCaptionStyle] = useState<ReelCaptionStyle>(
    editing?.captionStyle ?? 'pop',
  );
  const [hookStyle, setHookStyle] = useState<ReelHookStyle>(editing?.hookStyle ?? 'headline');
  const [music, setMusic] = useState<UserSkill['music']>(editing?.music ?? 'auto');
  const [markdown, setMarkdown] = useState(editing?.markdown ?? '');
  const [sourceUrl, setSourceUrl] = useState<string | undefined>(editing?.sourceUrl);

  if (!open) return null;

  const applyDraft = (d: ParsedSkillDraft) => {
    setName(d.name);
    setBlurb(d.blurb);
    setTarget(d.target);
    setBaseRecipeId(d.baseRecipeId);
    setLook(d.look);
    setAccent(d.accent);
    setCaptionStyle(d.captionStyle);
    setHookStyle(d.hookStyle);
    setMusic(d.music);
    setMarkdown(d.markdown);
    if (d.sourceUrl) setSourceUrl(d.sourceUrl);
  };

  const handleLoadExample = () => {
    setError(null);
    applyDraft(parseSkillMarkdown(EXAMPLE_SKILL_MARKDOWN));
    setStatus('Loaded example Blueprint Schematic skill — tweak or save.');
  };

  const handleParseMarkdown = () => {
    if (!markdown.trim()) {
      setError('Paste your SKILL.md content first.');
      return;
    }
    setError(null);
    const parsed = parseSkillMarkdown(markdown, sourceUrl ? { sourceUrl } : {});
    if (!name.trim()) setName(parsed.name);
    if (!blurb.trim()) setBlurb(parsed.blurb);
    setTarget(parsed.target);
    setLook(parsed.look);
    setAccent(parsed.accent);
    setCaptionStyle(parsed.captionStyle);
    setHookStyle(parsed.hookStyle);
    setStatus('Auto-filled fields from Markdown.');
  };

  const handleGithubFetch = async () => {
    const trimmed = githubUrl.trim();
    if (!trimmed) {
      setError('Paste a GitHub repo or SKILL.md URL first.');
      return;
    }
    setError(null);
    setStatus(null);
    setFetching(true);
    try {
      const res = await fetch('/api/skills/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = (await res.json().catch(() => null)) as
        { ok: true; draft: ParsedSkillDraft; resolvedUrl: string } | { error?: string } | null;
      if (!res.ok || !data || !('ok' in data)) {
        setError((data && 'error' in data && data.error) || 'Could not import that GitHub URL.');
        return;
      }
      applyDraft(data.draft);
      setStatus(
        `Imported from ${data.resolvedUrl.replace('https://raw.githubusercontent.com/', '')}`,
      );
      setTab('paste');
    } catch {
      setError('Network error while fetching that GitHub URL.');
    } finally {
      setFetching(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 128 * 1024) {
      setError('Markdown file must be under 128 KB.');
      return;
    }
    setError(null);
    const text = await file.text();
    applyDraft(parseSkillMarkdown(text, { filename: file.name }));
    setStatus(`Loaded ${file.name}`);
    setTab('paste');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const now = Date.now();
    const id = editing?.id ?? slugifySkillId(name || 'custom-skill');
    const parsed = UserSkillSchema.safeParse({
      id,
      name: name.trim(),
      blurb: blurb.trim() || 'Custom Markdown skill',
      target,
      baseRecipeId,
      look,
      accent,
      captionStyle,
      hookStyle,
      music,
      markdown: markdown.trim(),
      ...(sourceUrl ? { sourceUrl } : {}),
      createdAt: editing?.createdAt ?? now,
      updatedAt: now,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please fill in a skill name and Markdown body.');
      return;
    }
    setSaving(true);
    try {
      await onSave(parsed.data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save skill.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="skill-import-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
    >
      <div
        className={cn(
          paper.frame,
          'flex max-h-[90vh] w-full max-w-[740px] flex-col overflow-hidden shadow-[8px_8px_0_#000]',
        )}
      >
        <div className="flex items-center justify-between gap-4 border-b-2 border-ink bg-black px-5 py-3.5 text-paper">
          <div className="flex items-center gap-2.5">
            <Sparkles className="size-4 text-flame" strokeWidth={2} aria-hidden />
            <h2 id="skill-import-title" className={cn(poster, 'text-[26px] leading-none')}>
              {editing ? `Edit skill · ${editing.name}` : 'Import or create a skill'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close skill dialog"
            className="grid size-8 place-items-center rounded-lg border border-paper/30 text-paper/80 hover:border-paper hover:text-paper"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5 sm:p-6"
        >
          {/* Input mode tabs */}
          {!editing && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-ink/15 pb-4">
              <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Import method">
                {(
                  [
                    ['paste', FileText, 'Paste SKILL.md'],
                    ['github', FolderGit2, 'Import from GitHub'],
                    ['upload', Upload, 'Upload .md file'],
                  ] as const
                ).map(([id, Icon, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    onClick={() => {
                      setTab(id);
                      setError(null);
                    }}
                    className={btn(tab === id ? 'ink' : 'paper', 'sm')}
                  >
                    <Icon className="size-3.5" strokeWidth={2} aria-hidden />
                    {label}
                  </button>
                ))}
              </div>
              <button type="button" onClick={handleLoadExample} className={paper.link}>
                Load example skill
              </button>
            </div>
          )}

          {/* GitHub import bar */}
          {tab === 'github' && (
            <div className="mt-4 rounded-xl border-2 border-ink bg-mist/60 p-4">
              <label htmlFor="skill-gh-url" className="block text-[12px] font-semibold">
                GitHub repository or raw SKILL.md URL
              </label>
              <p className="mt-0.5 text-[11px] text-black/65">
                Paste a repo like <code className="font-mono">https://github.com/owner/repo</code>{' '}
                or a direct <code className="font-mono">.md</code> file URL. Only HTTPS GitHub hosts
                are fetched.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <input
                  id="skill-gh-url"
                  type="url"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo/blob/main/SKILL.md"
                  className={cn(paper.field, 'h-9 min-w-[240px] flex-1 px-3 font-mono text-[12px]')}
                />
                <button
                  type="button"
                  disabled={fetching}
                  onClick={() => void handleGithubFetch()}
                  className={btn('flame', 'sm')}
                >
                  {fetching ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      Importing…
                    </>
                  ) : (
                    'Fetch SKILL.md'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Upload .md file */}
          {tab === 'upload' && (
            <div className="mt-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-ink bg-mist/50 p-6 text-center">
              <input
                ref={fileRef}
                type="file"
                accept=".md,.markdown,.txt,text/markdown,text/plain"
                onChange={(e) => void handleFileUpload(e)}
                className="sr-only"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className={btn('ink', 'md')}
              >
                <Upload className="size-4" strokeWidth={2} aria-hidden />
                Choose a .md skill file
              </button>
              <p className="mt-2 text-[11px] text-black/60">
                YAML frontmatter + Markdown instructions up to 16,000 characters.
              </p>
            </div>
          )}

          {/* Editable metadata */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="skill-name" className="block text-[11px] font-semibold uppercase">
                Skill name
              </label>
              <input
                id="skill-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                required
                placeholder="e.g. Blueprint Schematic Documentary"
                className={cn(paper.field, 'mt-1 h-9 w-full px-3 text-[13px]')}
              />
            </div>
            <div>
              <label htmlFor="skill-target" className="block text-[11px] font-semibold uppercase">
                Target engine
              </label>
              <select
                id="skill-target"
                value={target}
                onChange={(e) => setTarget(e.target.value as UserSkillTarget)}
                className={cn(paper.field, 'mt-1 h-9 w-full px-2.5 text-[13px]')}
              >
                <option value="both">Both (Reels + Motion Graphics / Film)</option>
                <option value="reel">Talking-Head Reel Engine only</option>
                <option value="film">Motion Graphic / Film Engine only</option>
              </select>
            </div>
          </div>

          <div className="mt-3">
            <label htmlFor="skill-blurb" className="block text-[11px] font-semibold uppercase">
              Short description
            </label>
            <input
              id="skill-blurb"
              value={blurb}
              onChange={(e) => setBlurb(e.target.value)}
              maxLength={180}
              placeholder="One-line summary shown in /skills and /start/configure"
              className={cn(paper.field, 'mt-1 h-9 w-full px-3 text-[13px]')}
            />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="skill-base" className="block text-[11px] font-semibold uppercase">
                Base pacing recipe
              </label>
              <select
                id="skill-base"
                value={baseRecipeId}
                onChange={(e) => setBaseRecipeId(e.target.value as BuiltInRecipeKey)}
                className={cn(paper.field, 'mt-1 h-9 w-full px-2 text-[12px]')}
              >
                {builtInSkills.recipes().map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="skill-look" className="block text-[11px] font-semibold uppercase">
                House look
              </label>
              <select
                id="skill-look"
                value={look}
                onChange={(e) => setLook(e.target.value as ReelLook)}
                className={cn(paper.field, 'mt-1 h-9 w-full px-2 text-[12px]')}
              >
                <option value="mono">Mono (crisp grid)</option>
                <option value="cream">Cream (warm editorial)</option>
              </select>
            </div>
            <div>
              <span className="block text-[11px] font-semibold uppercase">Accent swatch</span>
              <div className="mt-1.5 flex items-center gap-1.5">
                {ACCENT_SWATCHES.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    aria-label={`Accent ${hex}`}
                    onClick={() => setAccent(hex)}
                    className={cn(
                      'size-6 rounded-md border-2 border-ink transition-transform',
                      accent.toUpperCase() === hex && 'scale-110 ring-2 ring-ink ring-offset-1',
                    )}
                    style={{ background: hex }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Markdown editor */}
          <div className="mt-4">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="skill-md" className="text-[11px] font-semibold uppercase">
                Skill instructions (SKILL.md)
              </label>
              <button
                type="button"
                onClick={handleParseMarkdown}
                className="text-[11px] font-medium underline underline-offset-4 hover:text-flame"
              >
                Auto-fill fields from Markdown
              </button>
            </div>
            <textarea
              id="skill-md"
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              rows={8}
              required
              placeholder="# My Visual Style Skill&#10;&#10;Describe visual grammar, pacing, palette, typography, camera moves, and things to avoid..."
              className={cn(
                paper.field,
                'mt-1 w-full resize-y p-3 font-mono text-[12px] leading-[1.55]',
              )}
            />
          </div>

          {status && (
            <p role="status" className="mt-2.5 text-[12px] font-medium text-[#15803d]">
              {status}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2.5 text-[12px] font-medium text-error">
              {error}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t-2 border-ink/15 pt-4">
            <p className="flex max-w-[440px] items-start gap-1.5 text-[11px] leading-[1.45] text-black/65">
              <Cloud className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} aria-hidden />
              <span>
                {cloudSynced
                  ? 'Syncs to Firestore (users/{uid}/skills) + local browser cache.'
                  : 'Saved in this browser; signs in to sync to Firestore.'}{' '}
                Art direction &amp; motion rules inject into our AI directors; external CLI/Python
                scripts are stripped.
              </span>
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className={btn('paper', 'sm')}>
                Cancel
              </button>
              <button type="submit" disabled={saving} className={btn('flame', 'sm')}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Save skill'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
