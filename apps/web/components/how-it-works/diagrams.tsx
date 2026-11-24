import type { ReactNode } from 'react';

/**
 * Publication-grade vector architecture & sequence diagrams for `/how-it-works` (spec 40 R5.4).
 * Four distinct engineering archetypes — never cluttered box walls:
 *   01 · High-Level System Architecture ("The Frankenstein Monster", clean orthogonal curves)
 *   02 · Hybrid AI Sequence Diagram (UML lifelines, alt/loop blocks, dashed returns)
 *   03 · End-to-End Video Pipeline Sequence (raw footage -> DSP/auto-cut -> AI -> HyperFrames/MP4)
 *   04 · Sandbox Player Flowchart + 4-Stage AI Verification State Machine (side-by-side)
 */

const FONT_MONO = 'var(--font-mono), ui-monospace, monospace';
const FONT_SANS = 'var(--font-sans), ui-sans-serif, system-ui, sans-serif';

function DiagramFrame({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: ReactNode;
}) {
  return (
    <figure className="overflow-hidden rounded-xl border-2 border-ink bg-paper shadow-[5px_5px_0_#000]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-ink bg-black px-4 py-2.5 text-paper">
        <span className="font-poster text-[20px] leading-none tracking-[0.02em] uppercase">
          {title}
        </span>
        <span className="text-[11px] text-paper/70">{caption}</span>
      </div>
      <div className="overflow-x-auto bg-[#fffdf9] p-4 sm:p-6">{children}</div>
    </figure>
  );
}

/** Open chevron + solid filled arrowheads for crisp technical lines. */
function Markers({ id }: { id: string }) {
  return (
    <defs>
      <marker
        id={`${id}-solid`}
        viewBox="0 0 10 10"
        refX="8.5"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path d="M 0 1.2 L 9 5 L 0 8.8 z" fill="#18181b" />
      </marker>
      <marker
        id={`${id}-open`}
        viewBox="0 0 10 10"
        refX="8.5"
        refY="5"
        markerWidth="8"
        markerHeight="8"
        orient="auto-start-reverse"
      >
        <path
          d="M 1.5 1.5 L 8.5 5 L 1.5 8.5"
          fill="none"
          stroke="#18181b"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </marker>
    </defs>
  );
}

/** Clean pill/node used in High-Level Architecture & Flowchart diagrams. */
function Node({
  x,
  y,
  w,
  h,
  label,
  sub,
  fill = '#ffffff',
  stroke = '#18181b',
  dot,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sub?: string;
  fill?: string;
  stroke?: string;
  dot?: string;
}) {
  const cy = sub ? y + h / 2 - 5 : y + h / 2 + 4;
  return (
    <g>
      <rect x={x + 2} y={y + 2} width={w} height={h} rx={8} fill="#18181b" opacity={0.08} />
      <rect x={x} y={y} width={w} height={h} rx={8} fill={fill} stroke={stroke} strokeWidth={1.5} />
      {dot && <circle cx={x + 13} cy={cy - 3.5} r={4} fill={dot} stroke="#18181b" strokeWidth={1} />}
      <text
        x={dot ? x + 23 : x + w / 2}
        y={cy}
        textAnchor={dot ? 'start' : 'middle'}
        fill="#111827"
        fontSize={11.5}
        fontWeight={600}
        fontFamily={FONT_SANS}
      >
        {label}
      </text>
      {sub && (
        <text
          x={dot ? x + 23 : x + w / 2}
          y={cy + 14}
          textAnchor={dot ? 'start' : 'middle'}
          fill="#52525b"
          fontSize={9.5}
          fontFamily={FONT_MONO}
        >
          {sub}
        </text>
      )}
    </g>
  );
}

/** Clean Sequence Diagram actor box (top and bottom of each lifeline). */
function Actor({
  x,
  y,
  w = 132,
  h = 38,
  label,
  sub,
  fill = '#fef7e5',
  stroke = '#d6c7a1',
}: {
  x: number;
  y: number;
  w?: number;
  h?: number;
  label: string;
  sub?: string;
  fill?: string;
  stroke?: string;
}) {
  return (
    <g>
      <rect x={x - w / 2} y={y} width={w} height={h} rx={6} fill={fill} stroke={stroke} strokeWidth={1.4} />
      <text
        x={x}
        y={sub ? y + 16 : y + h / 2 + 4}
        textAnchor="middle"
        fill="#18181b"
        fontSize={11}
        fontWeight={600}
        fontFamily={FONT_SANS}
      >
        {label}
      </text>
      {sub && (
        <text
          x={x}
          y={y + 30}
          textAnchor="middle"
          fill="#52525b"
          fontSize={9}
          fontFamily={FONT_MONO}
        >
          {sub}
        </text>
      )}
    </g>
  );
}

/** Horizontal sequence message arrow (solid request or dashed return). */
function Msg({
  x1,
  x2,
  y,
  label,
  dashed = false,
  markerId,
}: {
  x1: number;
  x2: number;
  y: number;
  label: string;
  dashed?: boolean;
  markerId: string;
}) {
  const dir = x2 > x1 ? 1 : -1;
  const endX = x2 - dir * 3;
  const midX = (x1 + x2) / 2;
  return (
    <g>
      <line
        x1={x1}
        y1={y}
        x2={endX}
        y2={y}
        stroke="#27272a"
        strokeWidth={1.35}
        strokeDasharray={dashed ? '5 4' : undefined}
        markerEnd={`url(#${markerId}-solid)`}
      />
      <rect
        x={midX - Math.min(220, label.length * 3.15 + 8)}
        y={y - 16}
        width={Math.min(440, label.length * 6.3 + 16)}
        height={13}
        rx={3}
        fill="#fffdf9"
        opacity={0.92}
      />
      <text
        x={midX}
        y={y - 6}
        textAnchor="middle"
        fill="#18181b"
        fontSize={10.5}
        fontWeight={dashed ? 500 : 600}
        fontFamily={FONT_SANS}
      >
        {label}
      </text>
    </g>
  );
}

/** Sequence self-call loop arrow. */
function SelfMsg({
  x,
  y,
  label,
  markerId,
}: {
  x: number;
  y: number;
  label: string;
  markerId: string;
}) {
  const pillW = Math.min(420, label.length * 5.9 + 12);
  return (
    <g>
      <path
        d={`M ${x} ${y} C ${x + 34} ${y}, ${x + 34} ${y + 20}, ${x + 4} ${y + 20}`}
        fill="none"
        stroke="#27272a"
        strokeWidth={1.35}
        markerEnd={`url(#${markerId}-solid)`}
      />
      <rect x={x + 34} y={y + 2} width={pillW} height={15} rx={3} fill="#fffdf9" opacity={0.94} />
      <text
        x={x + 38}
        y={y + 13}
        fill="#18181b"
        fontSize={10}
        fontWeight={600}
        fontFamily={FONT_SANS}
      >
        {label}
      </text>
    </g>
  );
}

/** UML `alt` or `loop` frame in a sequence diagram. */
function SeqBlock({
  x,
  y,
  w,
  h,
  kind,
  guard,
  tint = 'rgba(250, 245, 230, 0.45)',
  badgeFill = '#fef3c7',
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'alt' | 'loop' | 'par';
  guard: string;
  tint?: string;
  badgeFill?: string;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={6}
        fill={tint}
        stroke="#a1a1aa"
        strokeWidth={1.15}
        strokeDasharray="4 3"
      />
      <path
        d={`M ${x} ${y + 6} Q ${x} ${y} ${x + 6} ${y} L ${x + 42} ${y} L ${x + 42} ${y + 16} L ${x + 34} ${y + 22} L ${x} ${y + 22} Z`}
        fill={badgeFill}
        stroke="#71717a"
        strokeWidth={1.1}
      />
      <text x={x + 10} y={y + 15} fill="#18181b" fontSize={10} fontWeight={700} fontFamily={FONT_MONO}>
        {kind}
      </text>
      <text x={x + 52} y={y + 15} fill="#3f3f46" fontSize={10} fontWeight={600} fontFamily={FONT_MONO}>
        [{guard}]
      </text>
    </g>
  );
}

/* ============================================================================================
 * DIAGRAM 01: HIGH-LEVEL ARCHITECTURE ("THE FRANKENSTEIN MONSTER") — clean orthogonal topology
 * ============================================================================================ */
export function FrankensteinStackDiagram() {
  return (
    <DiagramFrame
      title="Diagram 01 · High-Level Architecture (The Frankenstein Stack)"
      caption="Desktop Chrome edge engines + 7 Firebase products + Vertex AI + Cloud Run + 6 open visual resolvers"
    >
      <svg
        viewBox="0 0 1000 470"
        className="h-auto w-full min-w-[740px]"
        role="img"
        aria-label="High-level system architecture connecting Desktop Chrome on-device Whisper, auto-cut DSP, Chrome Gemini Nano and HyperFrames sandbox to Firebase AI Logic, App Check, Auth, Firestore, Cloud Storage, Remote Config, Cloud Run FFmpeg, Vertex AI Lyria 2, and 6 open media resolvers."
      >
        <Markers id="arch" />

        {/* TOP-LEFT GROUP: Desktop Chrome Browser */}
        <rect x={16} y={18} width={410} height={248} rx={14} fill="#f8faf9" stroke="#18181b" strokeWidth={1.6} />
        <text x={32} y={40} fill="#18181b" fontSize={12.5} fontWeight={700} fontFamily={FONT_SANS}>
          Desktop Chrome 139+ · Local Edge Studio
        </text>
        <text x={32} y={54} fill="#047857" fontSize={9.5} fontWeight={600} fontFamily={FONT_MONO}>
          0 CREDITS · PRIVATE · WORKS OFFLINE
        </text>

        <Node x={30} y={66} w={180} h={46} label="Paper Editor & Pip" sub="Next.js 16 · Zustand 200-undo" dot="#ff6a3d" />
        <Node x={226} y={66} w={184} h={46} fill="#ecfdf5" label="Chrome Gemini Nano" sub="10 tasks · JPEG + JSON" dot="#10b981" />
        <Node x={30} y={126} w={180} h={52} fill="#ecfdf5" label="Whisper + Auto-Cut DSP" sub="WebGPU · LCS retakes · prosody" dot="#10b981" />
        <Node x={226} y={126} w={184} h={52} fill="#eff6ff" label="HyperFrames Sandbox" sub="seek(tMs) · 21+9 templates" dot="#3b82f6" />
        <Node x={30} y={194} w={380} h={56} fill="#fffbeb" label="IndexedDB + Procedural Audio Synth + Optional BYOK" sub="Local media · 14-take Web Audio SFX · localStorage x-goog-api-key" />

        {/* TOP-RIGHT GROUP: Cloud AI Orchestra */}
        <rect x={486} y={18} width={498} height={154} rx={14} fill="#faf8ff" stroke="#18181b" strokeWidth={1.6} />
        <text x={502} y={40} fill="#18181b" fontSize={12.5} fontWeight={700} fontFamily={FONT_SANS}>
          Firebase AI Logic &amp; Cloud Model Orchestra
        </text>
        <text x={502} y={54} fill="#6d28d9" fontSize={9.5} fontWeight={600} fontFamily={FONT_MONO}>
          DEFAULT HYBRID SDK · AGENTPLATFORMBACKEND(&quot;GLOBAL&quot;)
        </text>

        <Node x={502} y={68} w={146} h={42} fill="#f3e8ff" label="Gemini 4 Neon" sub="reel.direct · pip · film" dot="#8b5cf6" />
        <Node x={662} y={68} w={146} h={42} fill="#f3e8ff" label="Flash-Lite + TTS" sub="3.5-lite · 3.8-tts" dot="#8b5cf6" />
        <Node x={822} y={68} w={146} h={42} fill="#f3e8ff" label="Nano Banana 2.1" sub="1K art · #00FF00 key" dot="#8b5cf6" />
        <Node x={502} y={120} w={222} h={40} fill="#ede9fe" label="Vertex AI · lyria-002" sub="/api/reel/music · looped WAV" dot="#7c3aed" />
        <Node x={738} y={120} w={230} h={40} fill="#ffffff" label="4-Stage QA &amp; Optional Claude" sub="lintCustom · DOM · vision-critic" />

        {/* BOTTOM-LEFT GROUP: 7-Product Firebase Backbone */}
        <rect x={16} y={298} width={484} height={154} rx={14} fill="#fffdf5" stroke="#18181b" strokeWidth={1.6} />
        <text x={32} y={320} fill="#18181b" fontSize={12.5} fontWeight={700} fontFamily={FONT_SANS}>
          Firebase Production Backbone (7 Products)
        </text>
        <text x={32} y={334} fill="#b45309" fontSize={9.5} fontWeight={600} fontFamily={FONT_MONO}>
          APP HOSTING · AUTH · APP CHECK · FIRESTORE · STORAGE · REMOTE CONFIG · AI LOGIC
        </text>

        <Node x={30} y={348} w={146} h={42} fill="#fef3c7" label="App Check + Auth" sub="reCAPTCHA · limited-use" dot="#f59e0b" />
        <Node x={188} y={348} w={152} h={42} fill="#fef3c7" label="Cloud Firestore" sub="ledger · skills DB · logs" dot="#f59e0b" />
        <Node x={352} y={348} w={134} h={42} fill="#fef3c7" label="Remote Config" sub="routes · kill_switch" dot="#f59e0b" />
        <Node x={30} y={400} w={218} h={40} fill="#ffffff" label="Cloud Storage + App Hosting" sub="A-roll · B-roll · WAV · MP4 · /share" />
        <Node x={260} y={400} w={226} h={40} fill="#ffffff" label="Modular SKILL.md Engine" sub="5 recipes · 8 slots · GitHub sync" />

        {/* BOTTOM-RIGHT GROUP: Cloud Run Parity Renderer & 6-Source Open Media */}
        <rect x={534} y={214} width={450} height={238} rx={14} fill="#f8fbff" stroke="#18181b" strokeWidth={1.6} />
        <text x={550} y={236} fill="#18181b" fontSize={12.5} fontWeight={700} fontFamily={FONT_SANS}>
          Parity Render Engine &amp; 6-Source Open Media
        </text>
        <text x={550} y={250} fill="#1d4ed8" fontSize={9.5} fontWeight={600} fontFamily={FONT_MONO}>
          CLOUD RUN PRODUCER + FFMPEG · ZERO HOTLINKING PROXY
        </text>

        <Node x={550} y={264} w={418} h={52} fill="#dbeafe" label="Cloud Run · @hyperframes/producer + FFmpeg" sub="Same compiled HTML · 30 fps · <= 1.02% diff -> 1080p MP4 / Alpha WebM" dot="#2563eb" />
        <Node x={550} y={330} w={202} h={48} fill="#ffffff" label="Pixabay · Pexels · Wikimedia" sub="/api/media/stock · 24h cache" />
        <Node x={766} y={330} w={202} h={48} fill="#ffffff" label="Openverse (CC0 / CC BY)" sub="/api/media/search · UUID proxy" />
        <Node x={550} y={390} w={202} h={48} fill="#ffffff" label="Simple Icons + Chrome Shot" sub="/api/reel/logo · /screenshot" />
        <Node x={766} y={390} w={202} h={48} fill="#ffffff" label="Natural Earth + d3-geo" sub="Offline vector globe & pins" />

        {/* Clean Orthogonal Connectors (Reference Image 4 aesthetic) */}
        {/* Browser -> Cloud AI Orchestra (hybrid router) */}
        <path
          d="M 426 90 L 482 90"
          fill="none"
          stroke="#18181b"
          strokeWidth={1.7}
          markerEnd="url(#arch-open)"
        />
        <rect x={432} y={73} width={46} height={14} rx={3} fill="#fffdf9" />
        <text x={455} y={83} textAnchor="middle" fill="#18181b" fontSize={8.5} fontWeight={700} fontFamily={FONT_MONO}>
          ROUTER
        </text>

        {/* Browser -> Firebase Backbone */}
        <path
          d="M 220 266 L 220 294"
          fill="none"
          stroke="#18181b"
          strokeWidth={1.7}
          markerEnd="url(#arch-open)"
        />

        {/* Firebase Backbone -> Cloud AI Orchestra (App Check + Remote Config) */}
        <path
          d="M 500 328 L 516 328 L 516 176"
          fill="none"
          stroke="#18181b"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          markerEnd="url(#arch-open)"
        />

        {/* Browser HyperFrames -> Cloud Run Render (same HTML) */}
        <path
          d="M 426 232 L 496 232 L 496 290 L 530 290"
          fill="none"
          stroke="#2563eb"
          strokeWidth={1.8}
          markerEnd="url(#arch-open)"
        />
        <rect x={432} y={214} width={60} height={14} rx={3} fill="#fffdf9" />
        <text x={462} y={224} textAnchor="middle" fill="#1d4ed8" fontSize={8.5} fontWeight={700} fontFamily={FONT_MONO}>
          SAME HTML
        </text>

        {/* Firebase Storage -> Cloud Run */}
        <path
          d="M 500 374 L 530 374"
          fill="none"
          stroke="#18181b"
          strokeWidth={1.6}
          markerEnd="url(#arch-open)"
        />
      </svg>
    </DiagramFrame>
  );
}

/* ============================================================================================
 * DIAGRAM 02: HYBRID AI SEQUENCE DIAGRAM — UML lifelines, alt/loop blocks (Reference Images 1 & 3)
 * ============================================================================================ */
export function HybridRouterDiagram() {
  const X = [86, 246, 408, 574, 742, 906] as const;
  const topY = 58;
  const botY = 524;

  return (
    <DiagramFrame
      title="Diagram 02 · Hybrid AI Sequence (Frame Note & Pip Workflow)"
      caption="packages/ai/src/router.ts · mint chip never silently charges cloud credits (D-035)"
    >
      <svg
        viewBox="0 0 990 578"
        className="h-auto w-full min-w-[740px]"
        role="img"
        aria-label="UML sequence diagram of Motionpop hybrid AI execution from Creator through Editor/Pip, AI Router, Chrome Gemini Nano on-device branch with 0 credits and offline execution, and explicit Cloud Gemini escalation branch with atomic credit reservation and 2-round repair loop."
      >
        <Markers id="seq1" />

        {/* Vertical Lifelines */}
        {X.map((x) => (
          <line key={x} x1={x} y1={topY} x2={x} y2={botY} stroke="#d6cfc2" strokeWidth={1.3} />
        ))}

        {/* Top Actor Headers */}
        <Actor x={X[0]} y={16} label="Creator" sub="Browser UI" />
        <Actor x={X[1]} y={16} label="Editor / Pip" sub="useRoute + crop" />
        <Actor x={X[2]} y={16} label="AI Router" sub="packages/ai" fill="#fef3c7" stroke="#ca8a04" />
        <Actor x={X[3]} y={16} label="Gemini Nano" sub="Chrome · 0 cr" fill="#d1fae5" stroke="#059669" />
        <Actor x={X[4]} y={16} label="Firebase Cloud" sub="Gemini 4 Neon" fill="#ede9fe" stroke="#7c3aed" />
        <Actor x={X[5]} y={16} label="Sandbox & Ledger" sub="Zod + Credits" fill="#dbeafe" stroke="#2563eb" />

        {/* Step 1-2: Request & Crop */}
        <Msg x1={X[0]} x2={X[1]} y={82} label="Circle frame + note (or Pip chat)" markerId="seq1" />
        <SelfMsg x={X[1]} y={94} label="Show route chip + JPEG crop (<=512px)" markerId="seq1" />
        <Msg x1={X[1]} x2={X[2]} y={138} label="run(reel.note.local | pip.quick)" markerId="seq1" />

        {/* ALT 1: On-Device Nano */}
        <SeqBlock
          x={200}
          y={152}
          w={752}
          h={162}
          kind="alt"
          guard="Chrome Gemini Nano READY — ONLY_ON_DEVICE · 0 credits · works offline"
          tint="rgba(209, 250, 229, 0.28)"
          badgeFill="#a7f3d0"
        />
        <Msg x1={X[2]} x2={X[3]} y={192} label="Prompt + JPEG + responseConstraint JSON" markerId="seq1" />
        <SelfMsg x={X[3]} y={202} label="Constrained decode (~300ms)" markerId="seq1" />
        <Msg x1={X[3]} x2={X[2]} y={244} label='{ action: "edit" | "escalate" }' dashed markerId="seq1" />
        <Msg x1={X[2]} x2={X[5]} y={272} label="Zod + ReelSceneSchema check (0 credits)" markerId="seq1" />
        <Msg x1={X[5]} x2={X[0]} y={300} label='Instant undoable patch (ranOn: "device")' dashed markerId="seq1" />

        {/* ALT 2: Cloud Escalation */}
        <SeqBlock
          x={200}
          y={326}
          w={752}
          h={184}
          kind="alt"
          guard='Complex graphic -> user clicks "Try in the cloud" (D-035) or non-Nano browser'
          tint="rgba(237, 233, 254, 0.28)"
          badgeFill="#ddd6fe"
        />
        <Msg x1={X[2]} x2={X[5]} y={364} label="App Check + atomic credit reserve" markerId="seq1" />
        <Msg x1={X[2]} x2={X[4]} y={392} label="reel.note / reel.compose / pip.plan" markerId="seq1" />

        {/* Nested Repair Loop */}
        <SeqBlock
          x={386}
          y={404}
          w={548}
          h={58}
          kind="loop"
          guard="Max 2 repairs if lintCustom / DOM critic / Vision QA flags issues"
          tint="rgba(255, 255, 255, 0.65)"
          badgeFill="#fde68a"
        />
        <Msg x1={X[4]} x2={X[5]} y={446} label="Validate HTML/SVG in opaque sandbox" markerId="seq1" />

        <Msg x1={X[5]} x2={X[0]} y={494} label="Verified scene on timeline (or auto-refund on fail)" dashed markerId="seq1" />

        {/* Bottom Actor Footers */}
        <Actor x={X[0]} y={botY} label="Creator" sub="Browser UI" />
        <Actor x={X[1]} y={botY} label="Editor / Pip" sub="useRoute + crop" />
        <Actor x={X[2]} y={botY} label="AI Router" sub="packages/ai" fill="#fef3c7" stroke="#ca8a04" />
        <Actor x={X[3]} y={botY} label="Gemini Nano" sub="Chrome · 0 cr" fill="#d1fae5" stroke="#059669" />
        <Actor x={X[4]} y={botY} label="Firebase Cloud" sub="Gemini 4 Neon" fill="#ede9fe" stroke="#7c3aed" />
        <Actor x={X[5]} y={botY} label="Sandbox & Ledger" sub="Zod + Credits" fill="#dbeafe" stroke="#2563eb" />
      </svg>
    </DiagramFrame>
  );
}

/* ============================================================================================
 * DIAGRAM 03: END-TO-END VIDEO PIPELINE SEQUENCE — Raw Footage -> Auto-Cut -> AI -> MP4
 * ============================================================================================ */
export function PipelineFlowDiagram() {
  const X = [94, 290, 496, 704, 896] as const;
  const topY = 58;
  const botY = 434;

  return (
    <DiagramFrame
      title="Diagram 03 · End-to-End Pipeline Sequence (Raw Video to Frame-Exact MP4)"
      caption="Background JobsHost starts free local prep on /start/configure so zero seconds are wasted"
    >
      <svg
        viewBox="0 0 990 488"
        className="h-auto w-full min-w-[740px]"
        role="img"
        aria-label="Sequence diagram of the end-to-end video pipeline from raw video, voiceover, or script through Whisper WebGPU and LCS auto-cut DSP, AI directors using Firestore skills, parallel 6-source media and Lyria 2 music resolvers, and deterministic HyperFrames preview and Cloud Run FFmpeg export."
      >
        <Markers id="seq2" />

        {X.map((x) => (
          <line key={x} x1={x} y1={topY} x2={x} y2={botY} stroke="#d6cfc2" strokeWidth={1.3} />
        ))}

        <Actor x={X[0]} y={16} w={146} label="Creator Intake" sub="Video · Voice · Script" fill="#fff5f0" stroke="#ea580c" />
        <Actor x={X[1]} y={16} w={164} label="Whisper & Auto-Cut DSP" sub="Local · WebGPU + Web Audio" fill="#d1fae5" stroke="#059669" />
        <Actor x={X[2]} y={16} w={164} label="AI Directors & Skills DB" sub="Firestore SKILL.md + Gemini" fill="#ede9fe" stroke="#7c3aed" />
        <Actor x={X[3]} y={16} w={164} label="Media & Audio Resolvers" sub="6 APIs · Lyria 2 · SFX Synth" fill="#fef3c7" stroke="#ca8a04" />
        <Actor x={X[4]} y={16} w={154} label="HyperFrames + Run" sub="Preview & FFmpeg MP4" fill="#dbeafe" stroke="#2563eb" />

        <Msg x1={X[0]} x2={X[1]} y={82} label="Drop MP4/MOV, record mic, or Gemini TTS script" markerId="seq2" />
        <SelfMsg x={X[1]} y={94} label="Whisper words + 10ms speech map + LCS retake/hiccup/dead-air EDL + prosody" markerId="seq2" />
        <Msg x1={X[1]} x2={X[2]} y={142} label="Cleaned timings + vocal stress + 6 JPEG keyframes" markerId="seq2" />

        <SeqBlock
          x={386}
          y={156}
          w={230}
          h={84}
          kind="alt"
          guard="Dual Video Engines"
          tint="rgba(237, 233, 254, 0.25)"
          badgeFill="#ddd6fe"
        />
        <text x={402} y={196} fill="#18181b" fontSize={10} fontWeight={600} fontFamily={FONT_MONO}>
          • Talking-Head: reel.direct (21 tpl)
        </text>
        <text x={402} y={212} fill="#047857" fontSize={10} fontWeight={600} fontFamily={FONT_MONO}>
          • Free/Offline: reel.draft (Nano)
        </text>
        <text x={402} y={228} fill="#18181b" fontSize={10} fontWeight={600} fontFamily={FONT_MONO}>
          • Voiceover/Film: 9 scenes + 8 looks
        </text>

        <Msg x1={X[2]} x2={X[3]} y={266} label="Typed Project JSON + media/music briefs" markerId="seq2" />

        <SeqBlock
          x={588}
          y={278}
          w={246}
          h={56}
          kind="par"
          guard="Parallel Asset & Audio Fetch"
          tint="rgba(254, 243, 199, 0.35)"
          badgeFill="#fde68a"
        />
        <text x={600} y={313} fill="#18181b" fontSize={9.5} fontWeight={600} fontFamily={FONT_MONO}>
          Pixabay · Pexels · Wikimedia · Openverse
        </text>
        <text x={600} y={327} fill="#18181b" fontSize={9.5} fontWeight={600} fontFamily={FONT_MONO}>
          Logos · Chrome Shot · Lyria 2 · 14 SFX
        </text>

        <Msg x1={X[3]} x2={X[4]} y={362} label="Compile single deterministic seek(tMs) HTML" markerId="seq2" />
        <Msg x1={X[4]} x2={X[0]} y={390} label="Instant 30 fps sandbox preview (edit & 200-step undo)" dashed markerId="seq2" />
        <Msg x1={X[4]} x2={X[0]} y={418} label="Cloud Run + FFmpeg export -> 1080p MP4 / Alpha WebM (<=1.02% diff)" dashed markerId="seq2" />

        <Actor x={X[0]} y={botY} w={146} label="Creator Intake" sub="Video · Voice · Script" fill="#fff5f0" stroke="#ea580c" />
        <Actor x={X[1]} y={botY} w={164} label="Whisper & Auto-Cut DSP" sub="Local · WebGPU + Web Audio" fill="#d1fae5" stroke="#059669" />
        <Actor x={X[2]} y={botY} w={164} label="AI Directors & Skills DB" sub="Firestore SKILL.md + Gemini" fill="#ede9fe" stroke="#7c3aed" />
        <Actor x={X[3]} y={botY} w={164} label="Media & Audio Resolvers" sub="6 APIs · Lyria 2 · SFX Synth" fill="#fef3c7" stroke="#ca8a04" />
        <Actor x={X[4]} y={botY} w={154} label="HyperFrames + Run" sub="Preview & FFmpeg MP4" fill="#dbeafe" stroke="#2563eb" />
      </svg>
    </DiagramFrame>
  );
}

/* ============================================================================================
 * DIAGRAM 04: SIDE-BY-SIDE SANDBOX ARCHITECTURE + 4-STAGE VERIFICATION LIFECYCLE (Ref Image 2!)
 * ============================================================================================ */
export function ParityDiagram() {
  return (
    <DiagramFrame
      title="Diagram 04 · One Composition, Frame-Exact Parity & Verification Lifecycle"
      caption="Left: Opaque Sandbox & Cloud Run parity · Right: 4-Stage AI scene verification state machine"
    >
      <svg
        viewBox="0 0 990 420"
        className="h-auto w-full min-w-[740px]"
        role="img"
        aria-label="Two side-by-side diagrams: on the left, the Sandbox Player and Cloud Run FFmpeg parity flowchart sharing one deterministic HyperFrames HTML composition; on the right, the 4-stage AI custom scene verification state machine cycling through Drafting, Static Lint, DOM and Vision QA, Repairing, Verified on Timeline, or Auto-Refund."
      >
        <Markers id="life" />

        {/* Subtle divider between left architecture and right state machine */}
        <line x1={528} y1={16} x2={528} y2={404} stroke="#e4e4e7" strokeWidth={1.5} strokeDasharray="5 5" />

        {/* ==================== LEFT: SANDBOX & PARITY ARCHITECTURE ==================== */}
        <text x={264} y={24} textAnchor="middle" fill="#18181b" fontSize={14} fontWeight={700} fontFamily={FONT_SANS}>
          Deterministic Sandbox &amp; Parity
        </text>

        {/* Parent Window box */}
        <rect x={28} y={42} width={472} height={142} rx={12} fill="#fffdf5" stroke="#d6c7a1" strokeWidth={1.5} />
        <text x={264} y={62} textAnchor="middle" fill="#52525b" fontSize={10.5} fontWeight={700} fontFamily={FONT_MONO}>
          PARENT EDITOR WINDOW + COMPILER
        </text>

        <Node x={46} y={76} w={198} h={42} label="Project JSON (int ms)" sub="frame = round(ms*30/1000)" fill="#ffffff" />
        <Node x={284} y={76} w={198} h={42} label="HyperFrames Compiler" sub="packages/motion -> index.html" fill="#dbeafe" />
        <Node x={144} y={132} w={240} h={38} label="Audio Master Clock · hf-seek(t)" sub="Zero GSAP · Zero CSS keyframes" fill="#fef3c7" />

        <line x1={244} y1={97} x2={280} y2={97} stroke="#18181b" strokeWidth={1.4} markerEnd="url(#life-solid)" />
        <path
          d="M 383 118 L 383 125 L 264 125 L 264 129"
          fill="none"
          stroke="#18181b"
          strokeWidth={1.4}
          markerEnd="url(#life-solid)"
        />

        {/* Branch down left: Browser Sandbox Iframe */}
        <rect x={28} y={232} width={226} height={164} rx={12} fill="#f0fdf4" stroke="#86efac" strokeWidth={1.5} />
        <text x={141} y={252} textAnchor="middle" fill="#166534" fontSize={10} fontWeight={700} fontFamily={FONT_MONO}>
          OPAQUE SANDBOX IFRAME
        </text>
        <Node x={44} y={266} w={194} h={44} label="<hyperframes-player>" sub='sandbox-origin="opaque"' fill="#ffffff" dot="#10b981" />
        <Node x={44} y={326} w={194} h={52} label="Pure seek(tMs) DOM/SVG" sub="Zero fetch · Zero timers" fill="#d1fae5" />
        <line x1={141} y1={310} x2={141} y2={323} stroke="#18181b" strokeWidth={1.3} markerEnd="url(#life-solid)" />

        {/* Branch down right: Cloud Run Render */}
        <rect x={274} y={232} width={226} height={164} rx={12} fill="#f5f3ff" stroke="#c4b5fd" strokeWidth={1.5} />
        <text x={387} y={252} textAnchor="middle" fill="#5b21b6" fontSize={10} fontWeight={700} fontFamily={FONT_MONO}>
          CLOUD RUN · SERVICES/RENDER
        </text>
        <Node x={290} y={266} w={194} h={44} label="@hyperframes/producer" sub="30 fps headless Chromium" fill="#ffffff" dot="#7c3aed" />
        <Node x={290} y={326} w={194} h={52} label="FFmpeg Parity Compositor" sub="<= 1.02% diff -> MP4/WebM" fill="#ede9fe" />
        <line x1={387} y1={310} x2={387} y2={323} stroke="#18181b" strokeWidth={1.3} markerEnd="url(#life-solid)" />

        {/* Wires from Compiler/Clock down to both targets */}
        <path d="M 190 170 L 190 202 L 141 202 L 141 228" fill="none" stroke="#18181b" strokeWidth={1.5} markerEnd="url(#life-solid)" />
        <rect x={95} y={193} width={86} height={16} rx={4} fill="#ede9fe" />
        <text x={138} y={204} textAnchor="middle" fill="#4c1d95" fontSize={9} fontWeight={700} fontFamily={FONT_MONO}>
          postMessage
        </text>

        <path d="M 338 170 L 338 202 L 387 202 L 387 228" fill="none" stroke="#18181b" strokeWidth={1.5} markerEnd="url(#life-solid)" />
        <rect x={346} y={193} width={84} height={16} rx={4} fill="#dbeafe" />
        <text x={388} y={204} textAnchor="middle" fill="#1e40af" fontSize={9} fontWeight={700} fontFamily={FONT_MONO}>
          exact HTML
        </text>

        {/* ==================== RIGHT: 4-STAGE AI VERIFICATION LIFECYCLE ==================== */}
        <text x={758} y={24} textAnchor="middle" fill="#18181b" fontSize={14} fontWeight={700} fontFamily={FONT_SANS}>
          AI Scene Verification Lifecycle
        </text>

        {/* Start dot */}
        <circle cx={758} cy={52} r={6} fill="#18181b" />
        <line x1={758} y1={58} x2={758} y2={84} stroke="#18181b" strokeWidth={1.5} markerEnd="url(#life-solid)" />

        {/* State 1: Drafting */}
        <Node x={662} y={88} w={192} h={42} fill="#fef7e5" stroke="#d6c7a1" label="1. Drafting" sub="reel.compose / film.build" />
        <line x1={758} y1={130} x2={758} y2={158} stroke="#18181b" strokeWidth={1.5} markerEnd="url(#life-solid)" />

        {/* State 2: Static Lint */}
        <Node x={662} y={162} w={192} h={44} fill="#fef3c7" stroke="#ca8a04" label="2. Static Lint" sub="lintCustom + @hyperframes/lint" />
        <line x1={758} y1={206} x2={758} y2={234} stroke="#18181b" strokeWidth={1.5} markerEnd="url(#life-solid)" />

        {/* State 3: Sandbox DOM + Vision QA */}
        <Node x={652} y={238} w={212} h={48} fill="#ede9fe" stroke="#7c3aed" label="3. DOM & Vision QA" sub="overflow · face-safe · contrast" />

        {/* Repair loop (left side of state machine) */}
        <path
          d="M 652 262 L 578 262 L 578 109 L 658 109"
          fill="none"
          stroke="#ea580c"
          strokeWidth={1.5}
          markerEnd="url(#life-solid)"
        />
        <rect x={542} y={176} width={76} height={28} rx={5} fill="#ffedd5" stroke="#ea580c" strokeWidth={1} />
        <text x={580} y={188} textAnchor="middle" fill="#9a3412" fontSize={9} fontWeight={700} fontFamily={FONT_MONO}>
          Repairing
        </text>
        <text x={580} y={199} textAnchor="middle" fill="#9a3412" fontSize={8.5} fontFamily={FONT_MONO}>
          (max 2)
        </text>

        {/* Pass -> Verified on Timeline */}
        <path
          d="M 716 286 L 716 328 L 650 328 L 650 344"
          fill="none"
          stroke="#059669"
          strokeWidth={1.6}
          markerEnd="url(#life-solid)"
        />
        <rect x={630} y={306} width={66} height={15} rx={3} fill="#d1fae5" />
        <text x={663} y={317} textAnchor="middle" fill="#065f46" fontSize={9} fontWeight={700} fontFamily={FONT_MONO}>
          all pass
        </text>
        <Node x={556} y={348} w={188} h={46} fill="#d1fae5" stroke="#059669" label="4. Verified Scene" sub="Committed · 1-click undo" dot="#10b981" />

        {/* Exhausted -> Auto-Refund */}
        <path
          d="M 800 286 L 800 328 L 866 328 L 866 344"
          fill="none"
          stroke="#71717a"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          markerEnd="url(#life-solid)"
        />
        <rect x={824} y={306} width={76} height={15} rx={3} fill="#f4f4f5" />
        <text x={862} y={317} textAnchor="middle" fill="#3f3f46" fontSize={9} fontWeight={700} fontFamily={FONT_MONO}>
          exhausted
        </text>
        <Node x={772} y={348} w={188} h={46} fill="#f4f4f5" stroke="#52525b" label="Safe Fallback" sub="Auto-refund · 0 lost cr" />
      </svg>
    </DiagramFrame>
  );
}
