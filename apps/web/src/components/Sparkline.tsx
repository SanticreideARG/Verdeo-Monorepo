/**
 * A single series drawn straight into the card behind its number.
 *
 * Hand-rolled SVG rather than a charting library on purpose: this is a path built from a list of
 * numbers — about twenty lines — and pulling in Recharts or Chart.js would add hundreds of
 * kilobytes to the bundle to draw one line. If real charts with axes, legends and tooltips ever
 * appear, that decision is worth revisiting; a sparkline is not the reason to make it.
 *
 * Borderless by design: it bleeds to the edges of its container and sits under the content, so it
 * reads as texture giving the number a direction rather than as a chart competing with it.
 */
export function Sparkline({
  label,
  values,
}: {
  /** Describes the trend for people who will never see the line. */
  label: string;
  values: readonly number[];
}) {
  // Two points is the minimum that can express a direction; below that there is nothing to say.
  if (values.length < 2) return null;

  const width = 100;
  const height = 32;
  const max = Math.max(...values);
  const min = Math.min(...values);
  // A flat series would divide by zero and, worse, draw a line at the top of the box as if it were
  // a peak. Flat renders down the middle instead.
  const span = max - min || 1;

  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = max === min ? height / 2 : height - ((value - min) / span) * height;
    return { x, y };
  });

  const line = points.map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  const last = points.at(-1);

  return (
    <svg
      aria-label={label}
      className="sparkline"
      preserveAspectRatio="none"
      role="img"
      viewBox={`0 0 ${width} ${height}`}
    >
      <path className="sparkline-area" d={area} />
      <path className="sparkline-line" d={line} />
      {/* The endpoint is where the eye lands: it is the current value. */}
      {last ? <circle className="sparkline-dot" cx={last.x} cy={last.y} r={2.2} /> : null}
    </svg>
  );
}
