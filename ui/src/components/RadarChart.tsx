/**
 * SVG Radar/Spider Chart — minimal, no dependencies.
 * Renders a web diagram of attributes with labels.
 */

interface RadarChartProps {
  data: { label: string; value: number; max?: number }[];
  size?: number;
  color?: string;
  className?: string;
}

export function RadarChart({ data, size = 280, color = '#3b82f6', className }: RadarChartProps) {
  if (data.length < 3) return null;

  const padding = 52; // Space for labels
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size / 2) - padding;
  const levels = 5;
  const angleStep = (2 * Math.PI) / data.length;

  const getPoint = (index: number, value: number, max: number) => {
    const angle = (index * angleStep) - Math.PI / 2;
    const r = (value / max) * radius;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  };

  const gridRings = Array.from({ length: levels }, (_, i) => {
    const r = ((i + 1) / levels) * radius;
    return data.map((_, j) => {
      const angle = (j * angleStep) - Math.PI / 2;
      return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
    }).join(' ');
  });

  const dataPoints = data.map((d, i) => {
    const p = getPoint(i, d.value, d.max || 10);
    return `${p.x},${p.y}`;
  }).join(' ');

  const axes = data.map((_, i) => {
    const angle = (i * angleStep) - Math.PI / 2;
    return {
      x2: cx + radius * Math.cos(angle),
      y2: cy + radius * Math.sin(angle),
    };
  });

  const labels = data.map((d, i) => {
    const angle = (i * angleStep) - Math.PI / 2;
    const labelRadius = radius + 16;
    const x = cx + labelRadius * Math.cos(angle);
    const y = cy + labelRadius * Math.sin(angle);
    let anchor: 'start' | 'middle' | 'end' = 'middle';
    if (Math.cos(angle) > 0.15) anchor = 'start';
    if (Math.cos(angle) < -0.15) anchor = 'end';

    return { x, y, label: d.label, value: d.value, anchor };
  });

  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox={`0 0 ${size} ${size}`}
      style={{ overflow: 'visible' }}
    >
      {gridRings.map((points, i) => (
        <polygon
          key={`ring-${i}`}
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth={0.5}
          className="text-border"
          opacity={0.4}
        />
      ))}

      {axes.map((axis, i) => (
        <line
          key={`axis-${i}`}
          x1={cx}
          y1={cy}
          x2={axis.x2}
          y2={axis.y2}
          stroke="currentColor"
          strokeWidth={0.5}
          className="text-border"
          opacity={0.25}
        />
      ))}

      <polygon
        points={dataPoints}
        fill={color}
        fillOpacity={0.1}
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />

      {data.map((d, i) => {
        const p = getPoint(i, d.value, d.max || 10);
        return (
          <circle key={`point-${i}`} cx={p.x} cy={p.y} r={2.5} fill={color} />
        );
      })}

      {labels.map((l, i) => (
        <text
          key={`label-${i}`}
          x={l.x}
          y={l.y}
          textAnchor={l.anchor}
          dominantBaseline="central"
          className="fill-text-tertiary"
          fontSize={8.5}
          fontFamily="Inter, system-ui, sans-serif"
          fontWeight={500}
        >
          {l.label}
        </text>
      ))}
    </svg>
  );
}
