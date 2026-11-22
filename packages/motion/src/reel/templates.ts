// Reel engine (spec 25): the hand-crafted scene templates. Each one builds its DOM once and
// draws any moment from `seek(t)` (absolute ms). The director only chooses a template and fills
// its props; the craft lives here, so every reel lands at the same quality.
import type { ReelMedia, ReelTemplate } from '@motionpop/schemas';
import {
  applyReveal,
  blurRise,
  clamp,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  easeOutExpo,
  formatNumber,
  lerp,
  prog,
  revealAt,
} from './anim';
import { check, css, h, icon, svg } from './dom';
import { image, logo, logos, logoTile, website } from './media';
import {
  column,
  ENTER,
  fit,
  headingStyle,
  kickerEl,
  tagEl,
  words,
  type Of,
  type Tpl,
  type TplCtx,
} from './parts';

export type { Tpl, TplCtx } from './parts';
export { tagEl } from './parts';

// ---------------------------------------------------------------------------------------------

function headline(p: Of<'headline'>, ctx: TplCtx): Tpl {
  const col = column(ctx, ctx.look.upper ? 18 : 22);
  const kick = p.kicker ? kickerEl(ctx, p.kicker) : null;
  const t = words(ctx, p.title, p.accent);
  css(t.el, { ...headingStyle(ctx, ctx.look.upper ? 78 : 88) });
  const sub = p.sub
    ? h(
        'div',
        {
          fontFamily: ctx.look.sans,
          fontWeight: 500,
          fontSize: 24,
          lineHeight: 1.35,
          color: ctx.pal.muted,
          maxWidth: 560,
        },
        [p.sub],
      )
    : null;
  if (kick) col.append(kick);
  col.append(t.el);
  if (sub) col.append(sub);
  const t0 = ctx.startMs + ENTER;
  return {
    el: col,
    mount() {
      fit(t.el, 620, ctx.look.upper ? 78 : 92, 36, 3, 1.05);
    },
    seek(tt) {
      if (kick) revealAt(kick, tt, t0, 380);
      t.spans.forEach((s, i) => revealAt(s, tt, t0 + 110 + i * 75, 440, 26, 16));
      if (sub) revealAt(sub, tt, t0 + 220 + t.spans.length * 75, 420);
    },
  };
}

function list(p: Of<'list'>, ctx: TplCtx): Tpl {
  const col = column(ctx, ctx.look.upper ? 34 : 30);
  const head = h('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 });
  const kick = p.kicker ? kickerEl(ctx, p.kicker) : null;
  if (kick) head.append(kick);
  const title = h('div', headingStyle(ctx, ctx.look.upper ? 64 : 70), [p.title]);
  head.append(title);
  const rows = h('div', {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: ctx.look.upper ? 26 : 22,
  });
  const items = p.items.map((it) => {
    const ic = it.media
      ? logoTile(ctx, it.media, it.text, ctx.look.upper ? 64 : 58)
      : icon(
          it.icon,
          ctx.look.upper ? 58 : 50,
          ctx.look.upper ? ctx.pal.ink : ctx.pal.accent,
          ctx.look.upper ? 1.8 : 1.7,
        );
    const label = h(
      'div',
      ctx.look.upper
        ? {
            fontFamily: ctx.look.sans,
            fontWeight: 700,
            fontSize: 38,
            letterSpacing: '-0.005em',
            textTransform: 'uppercase',
            color: ctx.pal.ink,
            whiteSpace: 'nowrap',
          }
        : {
            fontFamily: ctx.look.serif,
            fontWeight: 500,
            fontSize: 46,
            letterSpacing: '-0.02em',
            color: ctx.pal.ink,
            whiteSpace: 'nowrap',
          },
      [it.text],
    );
    const row = h('div', { display: 'flex', alignItems: 'center', gap: 22 }, [ic.el, label]);
    rows.append(row);
    return { ic, label, at: it.at };
  });
  col.append(head, rows);
  const t0 = ctx.startMs + ENTER;
  return {
    el: col,
    mount() {
      fit(title, 620, ctx.look.upper ? 64 : 70, 30, 2);
      items.forEach((it) => fit(it.label, 500, ctx.look.upper ? 38 : 46, 22, 1));
    },
    seek(tt) {
      if (kick) revealAt(kick, tt, t0, 360);
      revealAt(title, tt, t0 + 90, 440, 24, 16);
      items.forEach((it, i) => {
        const at = Math.max(it.at, t0 + 260 + i * 140);
        const p1 = prog(tt, at, 420);
        it.ic.el.style.opacity = p1 > 0 ? '1' : '0';
        it.ic.draw(easeOutCubic(p1));
        revealAt(it.label, tt, at + 70, 420, 0, 14);
        // Labels slide in from the left a touch.
        const e = easeOutCubic(prog(tt, at + 70, 420));
        it.label.style.transform = `translate3d(${((1 - e) * -14).toFixed(2)}px,0,0)`;
      });
    },
  };
}

function stack(p: Of<'stack'>, ctx: TplCtx): Tpl {
  const col = column(ctx, ctx.look.upper ? 30 : 26);
  const label = tagEl(ctx, p.label, 26);
  const list = h('div', {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: ctx.look.upper ? 6 : 2,
  });
  const withLogos = p.words.some((w) => w.media);
  const items = p.words.map((w) => {
    const el = h('div', { ...headingStyle(ctx, ctx.look.upper ? 86 : 92), whiteSpace: 'nowrap' }, [
      w.text,
    ]);
    if (withLogos) {
      css(el, { display: 'flex', alignItems: 'center', gap: '0.28em' });
      const tile = logoTile(ctx, w.media, w.text, 72);
      tile.draw(1);
      css(tile.el, { width: '0.92em', height: '0.92em', borderRadius: '0.22em' });
      el.prepend(tile.el);
    }
    list.append(el);
    return { el, at: w.at };
  });
  col.append(label, list);
  const t0 = ctx.startMs + ENTER;
  return {
    el: col,
    mount() {
      const sizes = items.map((it) => fit(it.el, 630, ctx.look.upper ? 86 : 92, 30, 1));
      const s = Math.min(...sizes);
      items.forEach((it) => (it.el.style.fontSize = `${s}px`));
    },
    seek(tt) {
      revealAt(label, tt, t0, 360, 12, 8);
      const ats = items.map((it, i) => Math.max(it.at, t0 + 200 + i * 160));
      items.forEach((it, i) => {
        revealAt(it.el, tt, ats[i]!, 420, 28, 18);
        const next = ats[i + 1];
        const g = next === undefined ? 0 : easeOutCubic(prog(tt, next, 260));
        it.el.style.color = g > 0 ? mix(ctx.pal.ink, ctx.pal.muted, g) : ctx.pal.ink;
      });
    },
  };
}

function checklist(p: Of<'checklist'>, ctx: TplCtx): Tpl {
  const col = column(ctx, 26);
  const kick = p.kicker ? kickerEl(ctx, p.kicker) : null;
  if (kick) col.append(kick);
  // A timeline scrubber (mono) gives the rows a sense of "measured".
  let knob: HTMLElement | null = null;
  let scrub: HTMLElement | null = null;
  if (ctx.look.upper) {
    knob = h('div', {
      position: 'absolute',
      top: -15,
      left: 0,
      width: 32,
      height: 32,
      borderRadius: 7,
      background: ctx.pal.ink,
    });
    scrub = h(
      'div',
      {
        position: 'relative',
        width: 560,
        height: 2,
        backgroundImage: `linear-gradient(to right, ${ctx.pal.muted} 55%, transparent 0)`,
        backgroundSize: '12px 2px',
        marginBottom: 18,
      },
      [knob],
    );
    col.append(scrub);
  }
  const table = h('div', {
    width: ctx.look.upper ? 580 : 620,
    display: 'flex',
    flexDirection: 'column',
    ...(ctx.look.upper
      ? {}
      : {
          background: ctx.pal.card,
          borderRadius: 26,
          padding: '18px 38px',
          boxShadow: ctx.pal.shadow,
        }),
  });
  const rows = p.rows.map((r, i) => {
    const lab = h(
      'div',
      {
        flex: '1',
        textAlign: 'left',
        fontFamily: ctx.look.sans,
        fontWeight: 700,
        fontSize: ctx.look.upper ? 32 : 42,
        textTransform: ctx.look.upper ? 'uppercase' : 'none',
        letterSpacing: ctx.look.upper ? '0' : '-0.02em',
        color: ctx.look.upper ? ctx.pal.ink : ctx.pal.cardInk,
      },
      [r.label],
    );
    const val = h(
      'div',
      {
        fontFamily: ctx.look.sans,
        fontWeight: 400,
        fontSize: ctx.look.upper ? 31 : 38,
        color: ctx.look.upper ? ctx.pal.ink : ctx.pal.muted,
        marginRight: 22,
        whiteSpace: 'nowrap',
      },
      [r.value ?? ''],
    );
    const ck = check(ctx.look.upper ? 34 : 44, ctx.look.upper ? ctx.pal.ink : ctx.pal.accent);
    const row = h(
      'div',
      {
        display: 'flex',
        alignItems: 'center',
        height: ctx.look.upper ? 72 : 96,
        borderBottom:
          i < p.rows.length - 1 || ctx.look.upper ? `1.5px solid ${ctx.pal.line}` : 'none',
      },
      [lab, val, ck.el],
    );
    table.append(row);
    return { row, lab, val, ck, at: r.at };
  });
  col.append(table);
  const t0 = ctx.startMs + ENTER;
  return {
    el: col,
    seek(tt) {
      if (kick) revealAt(kick, tt, t0, 360);
      if (scrub && knob) {
        revealAt(scrub, tt, t0 + 60, 360, 0, 6);
        const e = easeInOutCubic(prog(tt, t0 + 200, Math.max(800, ctx.endMs - ctx.startMs - 600)));
        knob.style.left = `${lerp(40, 480, e).toFixed(1)}px`;
      }
      if (!ctx.look.upper) revealAt(table, tt, t0, 420, 20, 10);
      rows.forEach((r, i) => {
        const at = Math.max(r.at, t0 + 220 + i * 150);
        revealAt(r.lab, tt, at, 380, 0, 12);
        revealAt(r.val, tt, at + 120, 380, 0, 12);
        const pc = prog(tt, at + 260, 300);
        r.ck.el.style.opacity = pc > 0 ? '1' : '0';
        r.ck.draw(easeOutCubic(pc));
        if (ctx.look.upper)
          r.row.style.borderBottomColor = prog(tt, at, 1) > 0 ? ctx.pal.line : 'transparent';
      });
    },
  };
}

function wireframe(
  ctx: TplCtx,
  dark: boolean,
  iconName?: string,
  media?: ReelMedia,
  name = '',
): HTMLElement {
  const bg = dark
    ? ctx.pal.card
    : ctx.pal.dark
      ? '#2A2A2E'
      : ctx.look.upper
        ? '#E9E9E9'
        : '#FFFFFF';
  const fg = dark ? ctx.pal.cardInk : ctx.pal.dark ? '#77777C' : '#B9B9B9';
  const box = h('div', {
    width: 250,
    height: 150,
    borderRadius: 18,
    background: bg,
    display: 'flex',
    alignItems: 'center',
    gap: 18,
    padding: '0 22px',
    boxSizing: 'border-box',
    ...(ctx.look.upper ? {} : { boxShadow: ctx.pal.shadow }),
  });
  if (media) {
    const tile = logoTile(ctx, media, name, 76);
    tile.draw(1);
    box.append(tile.el);
  } else if (iconName) {
    const ic = icon(iconName, 62, fg, 2);
    ic.draw(1);
    box.append(ic.el);
  } else {
    box.append(h('div', { width: 58, height: 58, borderRadius: 29, background: fg, flex: 'none' }));
  }
  const lines = h('div', { display: 'flex', flexDirection: 'column', gap: 9, flex: '1' });
  [1, 0.8, 0.62].forEach((w) =>
    lines.append(h('div', { height: 10, borderRadius: 5, background: fg, width: `${w * 100}%` })),
  );
  box.append(lines);
  return box;
}

function handles(ctx: TplCtx, inner: HTMLElement): HTMLElement {
  const c = ctx.pal.dark ? '#D0D0D4' : '#3A3A3A';
  const frame = h('div', { position: 'relative', padding: 18, border: `1.5px solid ${c}` }, [
    inner,
  ]);
  for (const [x, y] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ] as const) {
    frame.append(
      h('div', {
        position: 'absolute',
        width: 9,
        height: 9,
        background: ctx.pal.bg,
        border: `1.5px solid ${c}`,
        left: x ? 'auto' : -6,
        right: x ? -6 : 'auto',
        top: y ? 'auto' : -6,
        bottom: y ? -6 : 'auto',
      }),
    );
  }
  return frame;
}

function compare(p: Of<'compare'>, ctx: TplCtx): Tpl {
  const col = column(ctx, 34);
  const pair = h('div', { display: 'flex', gap: 26, alignItems: 'flex-start' });
  const side = (label: string, dark: boolean, ic?: string, media?: ReelMedia) => {
    const tag = ctx.look.upper
      ? tagEl(ctx, label, 26)
      : h(
          'div',
          {
            fontFamily: ctx.look.italic,
            fontStyle: 'italic',
            fontWeight: 700,
            fontSize: 36,
            color: dark ? ctx.pal.accent : ctx.pal.muted,
            letterSpacing: '-0.02em',
          },
          [label],
        );
    const card = wireframe(ctx, dark, ic, media, label);
    const body = ctx.look.upper ? handles(ctx, card) : card;
    const wrap = h(
      'div',
      { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 },
      [tag, body],
    );
    return { wrap, tag, body };
  };
  const L = side(p.left, p.winner === 'left', p.leftIcon, p.leftMedia);
  const R = side(p.right, p.winner === 'right' || p.winner === 'none', p.rightIcon, p.rightMedia);
  pair.append(L.wrap, R.wrap);
  const rows = h('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    minHeight: p.rows.length ? 0 : 0,
  });
  const rr = p.rows.map((r) => {
    const lab = h(
      'div',
      {
        fontFamily: ctx.look.sans,
        fontWeight: 700,
        fontSize: 32,
        textTransform: ctx.look.upper ? 'uppercase' : 'none',
        color: ctx.pal.ink,
        minWidth: 200,
        textAlign: 'left',
        letterSpacing: ctx.look.upper ? '0' : '-0.02em',
      },
      [r.text],
    );
    const ck = check(34, ctx.look.upper ? ctx.pal.ink : ctx.pal.accent);
    const row = h('div', { display: 'flex', alignItems: 'center', gap: 26 }, [lab, ck.el]);
    rows.append(row);
    return { lab, ck, at: r.at };
  });
  col.append(pair);
  if (p.rows.length) col.append(rows);
  const t0 = ctx.startMs + ENTER;
  return {
    el: col,
    seek(tt) {
      revealAt(L.wrap, tt, t0, 440, 26, 14);
      revealAt(R.wrap, tt, t0 + 260, 440, 26, 14);
      rr.forEach((r, i) => {
        const at = Math.max(r.at, t0 + 600 + i * 160);
        revealAt(r.lab, tt, at, 380, 0, 12);
        const pc = prog(tt, at + 200, 300);
        r.ck.el.style.opacity = pc > 0 ? '1' : '0';
        r.ck.draw(easeOutCubic(pc));
      });
    },
  };
}

function statement(p: Of<'statement'>, ctx: TplCtx): Tpl {
  const col = column(ctx, 20);
  let ic: ReturnType<typeof icon> | null = null;
  let strike: SVGElement | null = null;
  let iconWrap: HTMLElement | null = null;
  if (p.icon) {
    ic = icon(p.icon, 108, ctx.look.upper ? ctx.pal.ink : ctx.pal.accent, 1.6);
    iconWrap = h('div', { position: 'relative', width: 108, height: 108, marginBottom: 14 }, [
      ic.el,
    ]);
    if (p.strike) {
      const s = svg('svg', { viewBox: '0 0 92 92', width: 108, height: 108 });
      s.style.position = 'absolute';
      s.style.left = '0';
      s.style.top = '0';
      s.style.overflow = 'visible';
      strike = svg('line', {
        x1: 4,
        y1: 88,
        x2: 88,
        y2: 4,
        stroke: ctx.look.upper ? ctx.pal.ink : '#D64545',
        'stroke-width': 4,
        'stroke-linecap': 'round',
        pathLength: 1,
        'stroke-dasharray': '1 1',
        'stroke-dashoffset': 1,
      });
      s.append(strike);
      iconWrap.append(s);
    }
    col.append(iconWrap);
  }
  const lines = p.lines.map((l) => {
    const el = h('div', { ...headingStyle(ctx, ctx.look.upper ? 62 : 70), whiteSpace: 'nowrap' }, [
      l.text,
    ]);
    col.append(el);
    return { el, at: l.at };
  });
  const t0 = ctx.startMs + ENTER;
  return {
    el: col,
    mount() {
      lines.forEach((l) => fit(l.el, 630, ctx.look.upper ? 62 : 70, 28, 1));
    },
    seek(tt) {
      if (ic && iconWrap) {
        iconWrap.style.opacity = tt >= t0 ? '1' : '0';
        ic.draw(easeOutCubic(prog(tt, t0, 520)));
      }
      if (strike)
        strike.setAttribute(
          'stroke-dashoffset',
          (1 - easeOutCubic(prog(tt, t0 + 420, 280))).toFixed(4),
        );
      lines.forEach((l, i) => revealAt(l.el, tt, Math.max(l.at, t0 + 150 + i * 160), 420, 24, 16));
    },
  };
}

function counter(p: Of<'counter'>, ctx: TplCtx): Tpl {
  const col = column(ctx, 10);
  const kick = p.kicker ? kickerEl(ctx, p.kicker) : null;
  const ic = p.icon ? icon(p.icon, 64, ctx.look.upper ? ctx.pal.ink : ctx.pal.accent, 1.8) : null;
  if (ic) {
    css(ic.el, { marginBottom: 14 });
    col.append(ic.el);
  }
  if (kick) col.append(kick);
  const num = h('div', {
    fontFamily: ctx.look.sans,
    fontWeight: 800,
    fontSize: 150,
    letterSpacing: '-0.045em',
    lineHeight: 1,
    color: ctx.pal.ink,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  });
  const label = h(
    'div',
    ctx.look.upper
      ? {
          fontFamily: ctx.look.sans,
          fontWeight: 700,
          fontSize: 32,
          textTransform: 'uppercase',
          color: ctx.pal.ink,
          marginTop: 8,
        }
      : {
          fontFamily: ctx.look.italic,
          fontStyle: 'italic',
          fontWeight: 700,
          fontSize: 44,
          color: ctx.pal.accent,
          letterSpacing: '-0.02em',
          marginTop: 2,
        },
    [p.label],
  );
  col.append(num, label);
  const text = (v: number) => `${p.prefix}${formatNumber(v, p.decimals)}${p.suffix}`;
  const t0 = ctx.startMs + ENTER;
  const dur = clamp((ctx.endMs - ctx.startMs) * 0.55, 700, 1500);
  return {
    el: col,
    mount() {
      num.textContent = text(p.value);
      fit(num, 620, 150, 60, 1, 1);
      fit(label, 620, ctx.look.upper ? 32 : 44, 20, 2, 1.15);
    },
    seek(tt) {
      if (ic) {
        ic.el.style.opacity = tt >= t0 ? '1' : '0';
        ic.draw(easeOutCubic(prog(tt, t0, 480)));
      }
      if (kick) revealAt(kick, tt, t0, 360);
      const pn = prog(tt, t0 + 120, dur);
      num.textContent = text(p.value * easeOutExpo(pn));
      revealAt(num, tt, t0 + 60, 360, 18, 12);
      revealAt(label, tt, t0 + 120 + dur * 0.6, 420, 16, 12);
    },
  };
}

function progress(p: Of<'progress'>, ctx: TplCtx): Tpl {
  const col = column(ctx, 0);
  const card = h('div', {
    width: ctx.look.upper ? 600 : 630,
    padding: ctx.look.upper ? '46px 46px 40px' : '56px 52px 48px',
    boxSizing: 'border-box',
    borderRadius: 26,
    background: ctx.look.upper ? (ctx.pal.dark ? '#16161A' : '#FFFFFF') : ctx.pal.card,
    border: ctx.look.upper ? `1.5px solid ${ctx.pal.line}` : 'none',
    boxShadow: ctx.pal.shadow,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  });
  const ic = icon(
    p.icon ?? 'download',
    ctx.look.upper ? 92 : 112,
    ctx.look.upper ? ctx.pal.ink : ctx.pal.accent,
    1.7,
  );
  const ink = ctx.look.upper ? ctx.pal.ink : ctx.pal.cardInk;
  const titleA = h(
    'div',
    {
      fontFamily: ctx.look.sans,
      fontWeight: 700,
      fontSize: ctx.look.upper ? 40 : 50,
      letterSpacing: '-0.025em',
      color: ink,
    },
    [p.title],
  );
  const titleB = h(
    'div',
    {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      fontFamily: ctx.look.sans,
      fontWeight: 700,
      fontSize: ctx.look.upper ? 40 : 50,
      letterSpacing: '-0.025em',
      color: ink,
    },
    [p.doneTitle ?? p.title],
  );
  const titles = h(
    'div',
    { position: 'relative', marginTop: 22, alignSelf: 'stretch', textAlign: 'center' },
    [titleA, titleB],
  );
  const sub = h(
    'div',
    {
      fontFamily: ctx.look.sans,
      fontWeight: 400,
      fontSize: ctx.look.upper ? 20 : 27,
      color: ctx.pal.muted,
      marginTop: 8,
    },
    [p.sub ?? 'Process initiated'],
  );
  const fill = h('div', {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '0%',
    borderRadius: 4,
    background: ctx.look.upper ? ctx.pal.ink : ctx.pal.accent,
  });
  const track = h(
    'div',
    {
      position: 'relative',
      alignSelf: 'stretch',
      height: ctx.look.upper ? 8 : 12,
      borderRadius: 6,
      background: ctx.pal.dark ? '#2C2C31' : '#ECE8E1',
      marginTop: 38,
      overflow: 'hidden',
    },
    [fill],
  );
  const pct = h(
    'div',
    {
      fontFamily: ctx.look.sans,
      fontWeight: 600,
      fontSize: ctx.look.upper ? 19 : 25,
      color: ink,
      fontVariantNumeric: 'tabular-nums',
    },
    ['0%'],
  );
  const meta = h(
    'div',
    {
      alignSelf: 'stretch',
      display: 'flex',
      justifyContent: 'space-between',
      marginTop: 14,
      fontFamily: ctx.look.sans,
      fontSize: ctx.look.upper ? 19 : 25,
      color: ctx.pal.muted,
    },
    [h('div', {}, [p.task ?? 'Working on it']), pct],
  );
  card.append(ic.el, titles, sub, track, meta);
  col.append(card);
  const t0 = ctx.startMs + ENTER;
  const dur = Math.max(900, (ctx.endMs - ctx.startMs) * 0.62);
  return {
    el: col,
    seek(tt) {
      revealAt(card, tt, t0, 460, 30, 14);
      ic.draw(easeOutCubic(prog(tt, t0 + 120, 520)));
      const pf = easeInOutCubic(prog(tt, t0 + 420, dur));
      fill.style.width = `${(pf * 100).toFixed(2)}%`;
      pct.textContent = `${Math.round(pf * 100)}%`;
      const done = easeOutCubic(prog(tt, t0 + 420 + dur, 260));
      titleA.style.opacity = String(p.doneTitle ? 1 - done : 1);
      titleB.style.opacity = String(p.doneTitle ? done : 0);
      if (done > 0.5) sub.textContent = 'Complete';
      else sub.textContent = p.sub ?? 'Process initiated';
    },
  };
}

function terminal(p: Of<'terminal'>, ctx: TplCtx): Tpl {
  const col = column(ctx, 0, { perspective: '1400px' });
  const dark = ctx.pal.dark;
  const win = h('div', {
    width: 630,
    borderRadius: 20,
    background: dark ? '#17171A' : '#121214',
    border: dark ? '1px solid #2C2C31' : 'none',
    boxShadow: dark ? '0 30px 80px rgba(0,0,0,0.6)' : '0 30px 80px rgba(0,0,0,0.28)',
    overflow: 'hidden',
    transformOrigin: '50% 100%',
  });
  const bar = h('div', {
    height: 46,
    display: 'flex',
    alignItems: 'center',
    padding: '0 18px',
    gap: 8,
    position: 'relative',
    borderBottom: '1px solid #26262B',
  });
  ['#FF5F57', '#FEBC2E', '#28C840'].forEach((c) =>
    bar.append(h('div', { width: 13, height: 13, borderRadius: 7, background: c })),
  );
  bar.append(
    h(
      'div',
      {
        position: 'absolute',
        left: 0,
        right: 0,
        textAlign: 'center',
        fontFamily: ctx.look.sans,
        fontWeight: 500,
        fontSize: 15,
        color: '#8A8A90',
        pointerEvents: 'none',
      },
      [p.title ?? 'terminal'],
    ),
  );
  const body = h('div', {
    padding: '26px 28px 30px',
    minHeight: Math.max(4, p.lines.length) * 42 + 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    textAlign: 'left',
  });
  const lines = p.lines.map((l) => {
    const pre = h(
      'span',
      {
        color: l.kind === 'cmd' ? '#7C7CFF' : l.kind === 'ok' ? '#3DDC84' : '#6A6A70',
        marginRight: 12,
      },
      [l.kind === 'cmd' ? '›' : l.kind === 'ok' ? '✓' : ' '],
    );
    const txt = h('span', {
      color: l.kind === 'cmd' ? '#F4F4F5' : l.kind === 'ok' ? '#CFF5DD' : '#9C9CA3',
    });
    const caret = h('span', {
      display: 'inline-block',
      width: 13,
      height: 27,
      background: '#F4F4F5',
      marginLeft: 2,
      verticalAlign: '-4px',
    });
    const row = h(
      'div',
      {
        fontFamily: ctx.look.mono,
        fontSize: 25,
        lineHeight: 1.45,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      },
      [pre, txt, caret],
    );
    body.append(row);
    return { row, txt, caret, text: l.text, at: l.at, kind: l.kind };
  });
  win.append(bar, body);
  col.append(win);
  const t0 = ctx.startMs + ENTER;
  return {
    el: col,
    seek(tt) {
      const pw = prog(tt, t0, 520);
      const r = blurRise(pw, 40, 12);
      applyReveal(win, r, ` rotateX(${((1 - easeOutCubic(pw)) * 14).toFixed(2)}deg)`);
      let activeIdx = -1;
      lines.forEach((l, i) => {
        const at = Math.max(l.at, t0 + 300 + i * 200);
        const cps = l.kind === 'cmd' ? 34 : 120;
        const chars = tt < at ? 0 : Math.min(l.text.length, Math.floor(((tt - at) / 1000) * cps));
        l.row.style.visibility = tt >= at ? 'visible' : 'hidden';
        l.txt.textContent = l.text.slice(0, chars);
        if (tt >= at) activeIdx = i;
      });
      lines.forEach((l, i) => {
        const blinkOn = Math.floor((tt - t0) / 530) % 2 === 0;
        l.caret.style.visibility = i === activeIdx && blinkOn ? 'visible' : 'hidden';
      });
    },
  };
}

function smoothPath(pts: readonly [number, number][]): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0]![0].toFixed(1)},${pts[0]![1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function chart(p: Of<'chart'>, ctx: TplCtx): Tpl {
  const col = column(ctx, 26);
  const title = h('div', { ...headingStyle(ctx, ctx.look.upper ? 34 : 44) }, [p.title]);
  const W = 600;
  const H = 330;
  const padB = 40;
  const padT = 40;
  const s = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  s.style.overflow = 'visible';
  const vals = p.points.map((q) => q.value);
  const max = Math.max(...vals, 0) || 1;
  const min = Math.min(0, ...vals);
  const yOf = (v: number) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
  const lineCol = ctx.look.upper ? ctx.pal.ink : ctx.pal.accent;
  for (let g = 0; g <= 3; g++) {
    const y = padT + (g / 3) * (H - padT - padB);
    s.append(
      svg('line', {
        x1: 0,
        x2: W,
        y1: y,
        y2: y,
        stroke: ctx.pal.line,
        'stroke-width': g === 3 ? 2 : 1.2,
        ...(g < 3 ? { 'stroke-dasharray': '4 6' } : {}),
      }),
    );
  }
  const n = p.points.length;
  const labels: SVGElement[] = [];
  const fontAttrs = {
    'font-family': ctx.look.sans,
    'font-size': 17,
    'font-weight': 500,
    fill: ctx.pal.muted,
    'text-anchor': 'middle',
  };
  let draw: (tt: number, t0: number) => void;
  if (p.kind === 'line') {
    const step = W / (n - 1);
    const pts = p.points.map((q, i) => [i * step, yOf(q.value)] as [number, number]);
    const d = smoothPath(pts);
    const area = svg('path', {
      d: `${d} L${W},${H - padB} L0,${H - padB} Z`,
      fill: lineCol,
      opacity: 0.08,
    });
    const clipId = `rc${Math.round(ctx.startMs)}`;
    const clip = svg('clipPath', { id: clipId }, [
      svg('rect', { x: -10, y: 0, width: 0, height: H }),
    ]);
    const defs = svg('defs', {}, [clip]);
    const g = svg('g', { 'clip-path': `url(#${clipId})` }, [area]);
    const path = svg('path', {
      d,
      fill: 'none',
      stroke: lineCol,
      'stroke-width': 5,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      pathLength: 1,
      'stroke-dasharray': '1 1',
      'stroke-dashoffset': 1,
    });
    const last = pts[pts.length - 1]!;
    const dot = svg('circle', { cx: last[0], cy: last[1], r: 9, fill: lineCol });
    const ring = svg('circle', {
      cx: last[0],
      cy: last[1],
      r: 9,
      fill: 'none',
      stroke: lineCol,
      'stroke-width': 2,
    });
    const lastVal = p.points[n - 1]!.value;
    const tag = svg('text', {
      x: last[0],
      y: last[1] - 24,
      'font-family': ctx.look.sans,
      'font-size': 26,
      'font-weight': 800,
      fill: ctx.pal.ink,
      'text-anchor': 'end',
    });
    tag.textContent = `${formatNumber(lastVal, Number.isInteger(lastVal) ? 0 : 1)}${p.unit}`;
    s.append(defs, g, path, ring, dot, tag);
    p.points.forEach((q, i) => {
      const t = svg('text', {
        ...fontAttrs,
        x: i * step,
        y: H - 10,
        'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle',
      });
      t.textContent = q.label;
      s.append(t);
      labels.push(t);
    });
    const rect = clip.firstChild as SVGElement;
    draw = (tt, t0) => {
      const pd = easeInOutCubic(prog(tt, t0 + 200, 1400));
      path.setAttribute('stroke-dashoffset', (1 - pd).toFixed(4));
      rect.setAttribute('width', String(pd * (W + 20)));
      const pe = prog(tt, t0 + 1500, 360);
      dot.setAttribute('r', (9 * easeOutBack(pe)).toFixed(2));
      ring.setAttribute('r', (9 + 16 * prog(tt, t0 + 1500, 700)).toFixed(2));
      ring.setAttribute('opacity', (1 - prog(tt, t0 + 1500, 700)).toFixed(3));
      tag.setAttribute('opacity', easeOutCubic(prog(tt, t0 + 1560, 360)).toFixed(3));
    };
  } else {
    const gap = 18;
    const bw = (W - gap * (n - 1)) / n;
    const maxIdx = vals.indexOf(max);
    const bars = p.points.map((q, i) => {
      const x = i * (bw + gap);
      const hi = i === maxIdx;
      const fill = ctx.look.upper
        ? hi
          ? ctx.pal.ink
          : ctx.pal.faint
        : hi
          ? ctx.pal.accent
          : ctx.pal.faint;
      const r = svg('rect', { x, width: bw, y: H - padB, height: 0, rx: 8, fill });
      const v = svg('text', {
        ...fontAttrs,
        x: x + bw / 2,
        y: H - padB - 10,
        'font-size': 20,
        'font-weight': 800,
        fill: ctx.pal.ink,
      });
      const t = svg('text', { ...fontAttrs, x: x + bw / 2, y: H - 10 });
      t.textContent = q.label;
      s.append(r, v, t);
      labels.push(t);
      return { r, v, q };
    });
    draw = (tt, t0) => {
      bars.forEach((b, i) => {
        const pb = easeOutQuartSafe(prog(tt, t0 + 200 + i * 110, 700));
        const full = H - padB - yOf(b.q.value);
        const hh = Math.max(0, full * pb);
        b.r.setAttribute('y', (H - padB - hh).toFixed(1));
        b.r.setAttribute('height', hh.toFixed(1));
        b.v.setAttribute('y', (H - padB - hh - 12).toFixed(1));
        b.v.textContent =
          pb > 0.02
            ? `${formatNumber(b.q.value * pb, Number.isInteger(b.q.value) ? 0 : 1)}${p.unit}`
            : '';
      });
    };
  }
  const box = h('div', {}, []);
  box.append(s);
  col.append(title, box);
  const t0 = ctx.startMs + ENTER;
  return {
    el: col,
    mount() {
      fit(title, 600, ctx.look.upper ? 34 : 44, 22, 2, 1.1);
    },
    seek(tt) {
      revealAt(title, tt, t0, 400, 18, 12);
      revealAt(box, tt, t0 + 100, 420, 20, 8);
      draw(tt, t0);
    },
  };
}

const easeOutQuartSafe = (p: number): number => 1 - (1 - clamp(p)) ** 4;

function browser(p: Of<'browser'>, ctx: TplCtx): Tpl {
  const col = column(ctx, 0);
  const dark = ctx.pal.dark;
  const win = h('div', {
    position: 'relative',
    width: 600,
    borderRadius: 16,
    background: dark ? '#141418' : '#FFFFFF',
    border: `1.5px solid ${dark ? '#2C2C31' : '#E4E4E4'}`,
    boxShadow: dark ? '0 30px 80px rgba(0,0,0,0.55)' : '0 30px 70px rgba(0,0,0,0.14)',
    overflow: 'hidden',
  });
  const bar = h('div', {
    height: 48,
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    gap: 7,
    borderBottom: `1px solid ${dark ? '#26262B' : '#EFEFEF'}`,
  });
  ['#FF5F57', '#FEBC2E', '#28C840'].forEach((c) =>
    bar.append(h('div', { width: 12, height: 12, borderRadius: 6, background: c })),
  );
  bar.append(
    h(
      'div',
      {
        marginLeft: 16,
        flex: '1',
        height: 28,
        borderRadius: 8,
        background: dark ? '#202026' : '#F3F3F3',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: ctx.look.sans,
        fontSize: 14,
        fontWeight: 500,
        color: dark ? '#8A8A90' : '#777',
      },
      [p.url],
    ),
  );
  const nav = h('div', { display: 'flex', alignItems: 'center', gap: 14, padding: '20px 28px 0' });
  nav.append(
    h('div', { width: 22, height: 22, borderRadius: 6, background: dark ? '#FFFFFF' : '#111' }),
  );
  [46, 38, 52].forEach((w) =>
    nav.append(
      h('div', { width: w, height: 8, borderRadius: 4, background: dark ? '#2E2E34' : '#E8E8E8' }),
    ),
  );
  const content = h('div', {
    padding: '34px 40px 40px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: 14,
  });
  const head = h(
    'div',
    {
      fontFamily: ctx.look.sans,
      fontWeight: 800,
      fontSize: 40,
      letterSpacing: '-0.035em',
      lineHeight: 1.06,
      color: dark ? '#FFFFFF' : '#111',
    },
    [p.headline],
  );
  const sub = p.sub
    ? h(
        'div',
        {
          fontFamily: ctx.look.sans,
          fontSize: 17,
          lineHeight: 1.45,
          color: dark ? '#8C8C93' : '#777',
          maxWidth: 440,
        },
        [p.sub],
      )
    : null;
  const btn = p.button
    ? h(
        'div',
        {
          marginTop: 8,
          padding: '12px 22px',
          borderRadius: 999,
          background: ctx.look.upper ? (dark ? '#FFFFFF' : '#111') : ctx.pal.accent,
          color: ctx.look.upper ? (dark ? '#111' : '#FFF') : '#FFF',
          fontFamily: ctx.look.sans,
          fontWeight: 600,
          fontSize: 16,
        },
        [p.button],
      )
    : null;
  content.append(head);
  if (sub) content.append(sub);
  if (btn) content.append(btn);
  win.append(bar, nav, content);
  let slash: SVGElement | null = null;
  if (p.strikeAt !== undefined) {
    const s = svg('svg', { viewBox: '0 0 600 400', preserveAspectRatio: 'none' });
    css(s as unknown as HTMLElement, {
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
      overflow: 'visible',
      pointerEvents: 'none',
    });
    slash = svg('line', {
      x1: 40,
      y1: 380,
      x2: 560,
      y2: 30,
      stroke: '#E5484D',
      'stroke-width': 9,
      'stroke-linecap': 'round',
      pathLength: 1,
      'stroke-dasharray': '1 1',
      'stroke-dashoffset': 1,
    });
    s.append(slash);
    win.append(s);
  }
  col.append(win);
  const t0 = ctx.startMs + ENTER;
  return {
    el: col,
    mount() {
      fit(head, 520, 40, 24, 2, 1.06);
    },
    seek(tt) {
      const pw = prog(tt, t0, 520);
      const r = blurRise(pw, 30, 12);
      r.scale = lerp(0.94, 1, easeOutCubic(pw));
      applyReveal(win, r);
      revealAt(nav, tt, t0 + 160, 380, 8, 6);
      revealAt(head, tt, t0 + 220, 420, 14, 10);
      if (sub) revealAt(sub, tt, t0 + 330, 420, 12, 8);
      if (btn) revealAt(btn, tt, t0 + 430, 420, 12, 8);
      if (slash && p.strikeAt !== undefined)
        slash.setAttribute(
          'stroke-dashoffset',
          (1 - easeOutCubic(prog(tt, Math.max(p.strikeAt, t0 + 500), 260))).toFixed(4),
        );
    },
  };
}

function flow(p: Of<'flow'>, ctx: TplCtx): Tpl {
  const col = column(ctx, 0);
  const n = p.steps.length;
  const size = n >= 4 ? 118 : 138;
  const row = h('div', { display: 'flex', alignItems: 'flex-start', justifyContent: 'center' });
  const steps = p.steps.map((st, i) => {
    const circle = h('div', {
      width: size,
      height: size,
      borderRadius: ctx.look.upper ? 24 : size / 2,
      border: `2px solid ${ctx.pal.ink}`,
      boxSizing: 'border-box',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'transparent',
    });
    const pic = ctx.img(st.media);
    const ic = icon(st.icon, size * 0.44, ctx.pal.ink, 1.8);
    if (pic) {
      css(circle, { background: '#FFFFFF', borderColor: ctx.pal.line });
      const inner = size * 0.5;
      const k = Math.min(inner / pic.w, inner / pic.h);
      circle.append(
        h('img', { width: Math.round(pic.w * k), height: Math.round(pic.h * k) }, [], {
          src: pic.src,
          alt: '',
          decoding: 'sync',
        }),
      );
    } else circle.append(ic.el);
    const label = h(
      'div',
      {
        marginTop: 16,
        fontFamily: ctx.look.sans,
        fontWeight: 700,
        fontSize: n >= 4 ? 20 : 24,
        textTransform: ctx.look.upper ? 'uppercase' : 'none',
        letterSpacing: ctx.look.upper ? '0' : '-0.01em',
        color: ctx.pal.ink,
        width: size + 34,
        textAlign: 'center',
        lineHeight: 1.2,
      },
      [st.text],
    );
    const cell = h('div', { display: 'flex', flexDirection: 'column', alignItems: 'center' }, [
      circle,
      label,
    ]);
    let arrow: { el: HTMLElement; line: SVGElement; head: SVGElement } | null = null;
    if (i > 0) {
      const aw = n >= 4 ? 30 : 46;
      const s = svg('svg', { width: aw, height: 20, viewBox: `0 0 ${aw} 20` });
      const line = svg('line', {
        x1: 2,
        y1: 10,
        x2: aw - 4,
        y2: 10,
        stroke: ctx.pal.muted,
        'stroke-width': 2.4,
        'stroke-linecap': 'round',
        pathLength: 1,
        'stroke-dasharray': '1 1',
        'stroke-dashoffset': 1,
      });
      const head = svg('path', {
        d: `M${aw - 11},4 L${aw - 4},10 L${aw - 11},16`,
        fill: 'none',
        stroke: ctx.pal.muted,
        'stroke-width': 2.4,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        opacity: 0,
      });
      s.append(line, head);
      const el = h(
        'div',
        { height: size, display: 'flex', alignItems: 'center', margin: '0 4px' },
        [],
      );
      el.append(s);
      row.append(el);
      arrow = { el, line, head };
    }
    row.append(cell);
    return { circle, ic, label, cell, arrow, at: st.at, logo: !!pic };
  });
  col.append(row);
  const t0 = ctx.startMs + ENTER;
  return {
    el: col,
    seek(tt) {
      const ats = steps.map((s, i) => Math.max(s.at, t0 + i * 260));
      let cur = -1;
      steps.forEach((s, i) => {
        const at = ats[i]!;
        if (tt >= at) cur = i;
        const pr = prog(tt, at, 420);
        const r = blurRise(pr, 18, 10);
        r.scale = lerp(0.86, 1, easeOutBack(pr));
        applyReveal(s.cell, r);
        s.ic.draw(easeOutCubic(prog(tt, at + 80, 420)));
        if (s.arrow) {
          const pa = easeOutCubic(prog(tt, at - 200, 220));
          s.arrow.line.setAttribute('stroke-dashoffset', (1 - pa).toFixed(4));
          s.arrow.head.setAttribute('opacity', pa > 0.9 ? '1' : '0');
        }
      });
      steps.forEach((s, i) => {
        const on = i === cur;
        if (s.logo) {
          // Logos stay on white; the current step gets a heavier ring instead of a fill.
          s.circle.style.boxShadow = on ? `0 0 0 4px ${ctx.pal.ink}` : 'none';
          return;
        }
        s.circle.style.background = on ? ctx.pal.ink : 'transparent';
        s.ic.el.setAttribute('stroke', on ? ctx.pal.bg : ctx.pal.ink);
      });
    },
  };
}

function quote(p: Of<'quote'>, ctx: TplCtx): Tpl {
  const col = column(ctx, 0, { overflow: 'hidden' });
  const inner = h('div', {
    position: 'relative',
    width: 620,
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    alignItems: 'center',
  });
  const hl = p.highlight.map((x) => x.toLowerCase());
  const lines = p.lines.map((l) => {
    const el = h(
      'div',
      ctx.look.upper
        ? {
            fontFamily: ctx.look.sans,
            fontWeight: 600,
            fontSize: 38,
            letterSpacing: '-0.03em',
            lineHeight: 1.22,
            color: ctx.pal.ink,
            textAlign: 'center',
          }
        : {
            fontFamily: ctx.look.serif,
            fontWeight: 500,
            fontSize: 46,
            letterSpacing: '-0.02em',
            lineHeight: 1.15,
            color: ctx.pal.ink,
            textAlign: 'center',
          },
    );
    l.text.split(/\s+/).forEach((w, i) => {
      if (i) el.append(document.createTextNode(' '));
      const clean = w.toLowerCase().replace(/[^\p{L}\p{N}.]/gu, '');
      const isHl = hl.some((x) => x.split(/\s+/).includes(clean));
      el.append(h('span', isHl ? { color: ctx.pal.link } : {}, [w]));
    });
    inner.append(el);
    return { el, at: l.at, top: 0, hgt: 0 };
  });
  col.append(inner);
  const t0 = ctx.startMs + ENTER;
  return {
    el: col,
    mount() {
      lines.forEach((l) => {
        l.top = l.el.offsetTop;
        l.hgt = l.el.offsetHeight;
      });
    },
    seek(tt) {
      const ats = lines.map((l, i) => Math.max(l.at, t0 + i * 300));
      // Keep the active line at the centre: interpolate the scroll between lines.
      const target = (i: number) => {
        const l = lines[i]!;
        const mid = l.top + l.hgt / 2;
        const firstMid = lines[0]!.top + lines[0]!.hgt / 2;
        return -(mid - firstMid);
      };
      let y = target(0);
      for (let i = 1; i < lines.length; i++) {
        const e = easeInOutCubic(prog(tt, ats[i]!, 420));
        y = lerp(y, target(i), e);
      }
      const total = lines[lines.length - 1]!.top + lines[lines.length - 1]!.hgt - lines[0]!.top;
      inner.style.transform = `translate3d(0, ${(y + total / 2 - lines[0]!.hgt / 2).toFixed(1)}px, 0)`;
      lines.forEach((l, i) => {
        const pIn = prog(tt, ats[i]!, 420);
        const next = ats[i + 1];
        const pOut = next === undefined ? 0 : easeOutCubic(prog(tt, next, 420));
        const blur = (1 - easeOutCubic(pIn)) * 14 + pOut * 5;
        l.el.style.opacity = (clamp(pIn * 1.6) * (1 - pOut * 0.62)).toFixed(3);
        l.el.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : 'none';
        l.el.style.visibility = pIn > 0 ? 'visible' : 'hidden';
      });
    },
  };
}

// ----- speaker overlays -----------------------------------------------------------------------

function punch(p: Of<'punch'>, ctx: TplCtx): Tpl {
  const box = h('div', {
    position: 'absolute',
    left: 0,
    right: 0,
    top: ctx.look.upper ? 560 : 870,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    padding: '0 40px',
    gap: ctx.look.upper ? 6 : 0,
  });
  const shadow = '0 3px 26px rgba(0,0,0,0.42), 0 1px 3px rgba(0,0,0,0.35)';
  const top = p.top
    ? h(
        'div',
        ctx.look.upper
          ? {
              fontFamily: ctx.look.sans,
              fontWeight: 700,
              fontSize: 30,
              color: '#FFFFFF',
              textTransform: 'uppercase',
              textShadow: shadow,
            }
          : {
              fontFamily: ctx.look.italic,
              fontStyle: 'italic',
              fontWeight: 700,
              fontSize: 54,
              letterSpacing: '-0.02em',
              color: '#FFFFFF',
              textShadow: shadow,
              lineHeight: 0.95,
            },
        [p.top],
      )
    : null;
  const main = h(
    'div',
    ctx.look.upper
      ? {
          fontFamily: ctx.look.sans,
          fontWeight: 900,
          fontSize: 78,
          color: '#FFFFFF',
          textTransform: 'uppercase',
          letterSpacing: '-0.02em',
          lineHeight: 1,
          textShadow: shadow,
          whiteSpace: 'nowrap',
        }
      : p.top
        ? {
            fontFamily: ctx.look.sans,
            fontWeight: 800,
            fontSize: 56,
            color: '#FFFFFF',
            letterSpacing: '-0.045em',
            lineHeight: 1.0,
            textShadow: shadow,
            whiteSpace: 'nowrap',
          }
        : {
            // A lone punchline reads as an editorial italic over the chest.
            fontFamily: ctx.look.italic,
            fontStyle: 'italic',
            fontWeight: 700,
            fontSize: 70,
            color: '#FFFFFF',
            letterSpacing: '-0.02em',
            lineHeight: 0.98,
            textShadow: shadow,
            whiteSpace: 'nowrap',
          },
    [p.text],
  );
  if (top) box.append(top);
  box.append(main);
  const t0 = ctx.startMs + 40;
  return {
    el: box,
    mount() {
      fit(main, 640, ctx.look.upper ? 78 : p.top ? 56 : 70, 30, 1, 1);
    },
    seek(tt) {
      if (top) revealAt(top, tt, t0, 300, 10, 10);
      const pm = prog(tt, t0 + (top ? 140 : 0), 300);
      const r = blurRise(pm, 0, 12);
      r.scale = lerp(1.18, 1, easeOutCubic(pm));
      applyReveal(main, r);
    },
  };
}

function cta(p: Of<'cta'>, ctx: TplCtx): Tpl {
  const card = h('div', {
    position: 'absolute',
    left: 90,
    width: 540,
    top: 760,
    boxSizing: 'border-box',
    padding: '24px 30px',
    borderRadius: 22,
    background: ctx.look.upper ? 'rgba(255,255,255,0.97)' : '#F7F3EC',
    display: 'flex',
    alignItems: 'center',
    gap: 24,
    boxShadow: '0 22px 60px rgba(0,0,0,0.35)',
    transformOrigin: '50% 60%',
  });
  const ic = icon('message-square', 66, '#111111', 1.6);
  const verb = h(
    'div',
    {
      fontFamily: ctx.look.sans,
      fontWeight: 500,
      fontSize: 26,
      color: '#222',
      textTransform: 'uppercase',
      letterSpacing: '0.01em',
    },
    [p.verb],
  );
  const kw = h(
    'div',
    ctx.look.upper
      ? {
          fontFamily: ctx.look.sans,
          fontWeight: 900,
          fontSize: 56,
          color: '#0B0B0C',
          textTransform: 'uppercase',
          letterSpacing: '-0.02em',
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }
      : {
          fontFamily: ctx.look.italic,
          fontStyle: 'italic',
          fontWeight: 800,
          fontSize: 60,
          color: '#D4623A',
          letterSpacing: '-0.02em',
          lineHeight: 1,
          whiteSpace: 'nowrap',
        },
    [ctx.look.upper ? p.keyword : `“${p.keyword}”`],
  );
  const txt = h(
    'div',
    { display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' },
    [verb, kw],
  );
  card.append(ic.el, txt);
  const t0 = ctx.startMs + 60;
  return {
    el: card,
    mount() {
      fit(kw, 360, ctx.look.upper ? 56 : 60, 28, 1, 1);
    },
    seek(tt) {
      const pc = prog(tt, t0, 520);
      card.style.opacity = clamp(pc * 2.2).toFixed(3);
      card.style.visibility = pc > 0 ? 'visible' : 'hidden';
      card.style.transform = `translate3d(0, ${((1 - easeOutCubic(pc)) * 40).toFixed(1)}px, 0) scale(${lerp(0.86, 1, easeOutBack(pc)).toFixed(4)})`;
      ic.draw(easeOutCubic(prog(tt, t0 + 120, 500)));
      revealAt(verb, tt, t0 + 160, 320, 8, 6);
      revealAt(kw, tt, t0 + 420, 380, 10, 12);
    },
  };
}

function none(_p: Of<'none'>, _ctx: TplCtx): Tpl {
  return { el: h('div', {}), seek() {} };
}

/** Linear blend of two #RRGGBB colours. */
export function mix(a: string, b: string, p: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(lerp((pa >> s) & 255, (pb >> s) & 255, clamp(p)));
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

/** An AI-written scene (spec 30): its own frame, or its title until the custom runtime is in. */
function custom(p: Of<'custom'>, ctx: TplCtx): Tpl {
  return ctx.custom ? ctx.custom(p, ctx) : headline({ template: 'headline', title: p.title }, ctx);
}

const BUILDERS: { [K in ReelTemplate['template']]: (p: Of<K>, ctx: TplCtx) => Tpl } = {
  custom,
  headline,
  list,
  stack,
  checklist,
  compare,
  statement,
  counter,
  progress,
  terminal,
  chart,
  browser,
  flow,
  quote,
  punch,
  cta,
  none,
  logo,
  logos,
  // Pictures fall back to a text template when the picture is missing (spec 26 R2.3).
  image: (p, ctx) => {
    const pic = ctx.img(p.media);
    if (pic) return image(p, ctx, pic);
    const words = p.words.map((w) => w.text);
    const title = p.title ?? words.shift();
    return title
      ? headline(
          {
            template: 'headline',
            title,
            ...(p.kicker ? { kicker: p.kicker } : {}),
            ...(words.length ? { sub: words.join(' · ') } : {}),
          },
          ctx,
        )
      : none({ template: 'none' }, ctx);
  },
  website: (p, ctx) => {
    const pic = ctx.img(p.media);
    if (pic) return website(p, ctx, pic);
    return browser(
      {
        template: 'browser',
        url: p.url,
        headline: p.headline ?? p.url,
        ...(p.strikeAt !== undefined ? { strikeAt: p.strikeAt } : {}),
      },
      ctx,
    );
  },
};

export function buildTemplate(content: ReelTemplate, ctx: TplCtx): Tpl {
  const b = BUILDERS[content.template] as (p: ReelTemplate, ctx: TplCtx) => Tpl;
  return b(content, ctx);
}
