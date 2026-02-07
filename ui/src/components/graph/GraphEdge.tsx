import { useState, memo } from 'react';
import { getBezierPath, EdgeLabelRenderer, type EdgeProps } from 'reactflow';

export interface GraphEdgeData {
  imports: string[];
  label: string;
  relationship?: string;
  highlighted?: boolean;
  dimmed?: boolean;
}

function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps<GraphEdgeData>) {
  const [hovered, setHovered] = useState(false);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isHighlighted = data?.highlighted;
  const isDimmed = data?.dimmed;

  const strokeColor = isHighlighted
    ? 'rgba(59, 130, 246, 0.8)'
    : isDimmed
    ? 'rgba(113, 113, 122, 0.1)'
    : 'rgba(113, 113, 122, 0.25)';

  const strokeWidth = isHighlighted ? 2 : 1;

  return (
    <>
      {/* Invisible wider path for easier hover detection */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ cursor: 'pointer' }}
      />
      {/* Visible edge */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={hovered ? 'rgba(59, 130, 246, 0.6)' : strokeColor}
        strokeWidth={hovered ? 2 : strokeWidth}
        markerEnd={markerEnd}
        style={{ transition: 'stroke 0.2s, stroke-width 0.2s' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      {/* Persistent relationship label on highlighted edges */}
      {isHighlighted && !hovered && data?.relationship && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'none',
            }}
            className="bg-surface-1/90 border border-accent-blue/20 rounded px-1.5 py-0.5"
          >
            <p className="text-[9px] text-accent-blue capitalize whitespace-nowrap">{data.relationship}</p>
          </div>
        </EdgeLabelRenderer>
      )}
      {/* Tooltip on hover */}
      {hovered && data && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'none',
            }}
            className="bg-surface-1 border border-border rounded-md px-2.5 py-1.5 shadow-xl z-50 max-w-[240px]"
          >
            {/* Relationship description (plain English) */}
            {data.relationship && (
              <p className="text-[10px] font-medium text-text-primary mb-1 capitalize">{data.relationship}</p>
            )}
            {/* Technical detail: import names */}
            {data.imports && data.imports.length > 0 && (
              <>
                <p className="text-[9px] text-text-tertiary mb-0.5">{data.imports.length} import{data.imports.length > 1 ? 's' : ''}:</p>
                <div className="flex flex-wrap gap-1 max-w-[220px]">
                  {data.imports.slice(0, 6).map((imp, i) => (
                    <span key={i} className="text-[9px] font-mono bg-accent-blue/10 text-accent-blue px-1 py-0.5 rounded">
                      {imp}
                    </span>
                  ))}
                  {data.imports.length > 6 && (
                    <span className="text-[9px] text-text-tertiary">+{data.imports.length - 6} more</span>
                  )}
                </div>
              </>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const edgeTypes = {
  custom: memo(CustomEdge),
};
