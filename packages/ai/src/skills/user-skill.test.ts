import { describe, expect, it } from 'vitest';
import {
  condenseSkillInstructions,
  EXAMPLE_SKILL_MARKDOWN,
  parseSkillMarkdown,
  slugifySkillId,
  toRawGithubCandidates,
  toUserSkillRef,
} from './user-skill';

describe('user-skill markdown parser & GitHub URL resolver', () => {
  it('parses frontmatter, heading, blurb, look and accent cleanly', () => {
    const parsed = parseSkillMarkdown(EXAMPLE_SKILL_MARKDOWN, {
      sourceUrl: 'https://github.com/example/blueprint-skill',
    });
    expect(parsed.id).toBe('blueprint-schematic-documentary');
    expect(parsed.name).toBe('Blueprint Schematic Documentary');
    expect(parsed.accent).toBe('#2563EB');
    expect(parsed.look).toBe('mono');
    expect(parsed.captionStyle).toBe('seam');
    expect(parsed.hookStyle).toBe('stat');
    expect(parsed.target).toBe('both');
    expect(parsed.sourceUrl).toBe('https://github.com/example/blueprint-skill');
  });

  it('handles plain markdown without frontmatter using H1 and first paragraph', () => {
    const md = `# Oil-Paint Documentary\n\nWarm impasto textures with deliberate 4-second holds.\n\n## Rules\n- Never use neon\n`;
    const parsed = parseSkillMarkdown(md);
    expect(parsed.name).toBe('Oil-Paint Documentary');
    expect(parsed.blurb).toContain('Warm impasto textures');
    expect(slugifySkillId(parsed.name)).toBe('oil-paint-documentary');
  });

  it('condenses markdown by stripping frontmatter and fenced CLI/Python blocks', () => {
    const md = `---\nname: Test\n---\n# Title\n\nUse bold serif headings.\n\n\`\`\`bash\npip install foo\n\`\`\`\n\nKeep margins generous.`;
    const condensed = condenseSkillInstructions(md, 500);
    expect(condensed).not.toContain('pip install');
    expect(condensed).not.toContain('---');
    expect(condensed).toContain('Use bold serif headings.');
    expect(condensed).toContain('Keep margins generous.');

    const ref = toUserSkillRef({
      id: 'test-skill',
      name: 'Test',
      target: 'both',
      markdown: md,
    });
    expect(ref.instructions).toContain('Use bold serif headings.');
  });

  it('resolves GitHub repo, blob, tree, and raw URLs and rejects non-GitHub hosts (SSRF guard)', () => {
    expect(toRawGithubCandidates('https://github.com/lemomo-ai/lemo-opuscar')).toEqual([
      'https://raw.githubusercontent.com/lemomo-ai/lemo-opuscar/main/SKILL.md',
      'https://raw.githubusercontent.com/lemomo-ai/lemo-opuscar/master/SKILL.md',
      'https://raw.githubusercontent.com/lemomo-ai/lemo-opuscar/main/README.md',
      'https://raw.githubusercontent.com/lemomo-ai/lemo-opuscar/master/README.md',
    ]);
    expect(
      toRawGithubCandidates('https://github.com/lemomo-ai/lemo-opuscar/blob/main/styles/ink.md'),
    ).toEqual(['https://raw.githubusercontent.com/lemomo-ai/lemo-opuscar/main/styles/ink.md']);
    expect(toRawGithubCandidates('http://127.0.0.1:8080/SKILL.md')).toBeNull();
    expect(toRawGithubCandidates('https://evil.example.com/SKILL.md')).toBeNull();
  });
});
