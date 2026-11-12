import { FORMAT_PRESETS } from '@motionpop/schemas';

// Placeholder until the render-pipeline and landing-page specs replace it.
export default function Home() {
  const formats = Object.values(FORMAT_PRESETS);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6">
      <h1 className="text-4xl font-semibold tracking-tight">Motionpop</h1>
      <p className="text-muted">AI can animate. It can’t direct. We do.</p>
      <ul className="grid grid-cols-2 gap-3 text-sm">
        {formats.map((f) => (
          <li key={f.id} className="rounded-md border border-border bg-surface px-3 py-2">
            <span className="block text-fg">{f.label}</span>
            <span className="tabular-nums text-muted">
              {f.width}×{f.height} · {f.fps}fps
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
