import { NumberRoll } from '@/components/ui/number-roll';

/** A 7-point sparkline (SVG polyline), oldest day first. */
export function Sparkline({
  values,
  color,
  width = 90,
  height = 28,
}: {
  values: readonly number[];
  color: string;
  width?: number;
  height?: number;
}) {
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values
    .map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - (v / max) * (height - 4)).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Stat tile (projects.png: 416×88 at y 800, number 24 px, label 12 px, sparkline right). */
export function StatTile({
  value,
  text,
  label,
  spark,
  color,
}: {
  /** A rolling number, or `text` for formatted values ("~1h 10m"). */
  value?: number;
  text?: string;
  label: string;
  spark: readonly number[];
  color: string;
}) {
  return (
    <div className="flex h-[88px] items-center justify-between rounded-card border border-line bg-panel pr-[26px] pl-5 shadow-quiet">
      <div>
        <p className="text-2xl leading-[30px] font-semibold tabular">
          {value !== undefined ? <NumberRoll value={value} /> : text}
        </p>
        <p className="mt-1.5 text-xs leading-4 text-text-2">{label}</p>
      </div>
      <Sparkline values={spark} color={color} />
    </div>
  );
}
