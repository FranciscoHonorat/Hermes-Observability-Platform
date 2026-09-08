import { useNavigate } from 'react-router-dom';
import { ServiceMapNode, ServiceMapEdge } from '../api/client';

interface ServiceGraphProps {
  nodes: ServiceMapNode[];
  edges: ServiceMapEdge[];
}

const COLUMN_WIDTH = 220;
const ROW_HEIGHT = 90;
const MARGIN = 60;
const NODE_RADIUS_MIN = 22;
const NODE_RADIUS_MAX = 36;

/**
 * Assigns each service a column via BFS from "root" services (ones that
 * never appear as an edge's target) — standard shortest-path layering, so
 * it terminates cleanly even if the call graph has a cycle (a node is only
 * ever assigned on its first visit).
 */
function computeColumns(names: string[], edges: ServiceMapEdge[]): Map<string, number> {
  const targets = new Set(edges.map(e => e.target));
  const roots = names.filter(n => !targets.has(n));
  const startNodes = roots.length > 0 ? roots : names.slice(0, 1);

  const outgoing = new Map<string, string[]>();
  edges.forEach(e => {
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    outgoing.get(e.source)!.push(e.target);
  });

  const columns = new Map<string, number>();
  const queue: Array<[string, number]> = startNodes.map(n => [n, 0]);

  while (queue.length > 0) {
    const [name, col] = queue.shift()!;
    if (columns.has(name)) continue; // first visit wins (shortest path from a root)
    columns.set(name, col);
    for (const next of outgoing.get(name) || []) {
      if (!columns.has(next)) queue.push([next, col + 1]);
    }
  }

  names.forEach(n => { if (!columns.has(n)) columns.set(n, 0); });
  return columns;
}

function nodeColor(errorRate: number): string {
  if (errorRate >= 0.2) return 'fill-danger';
  if (errorRate > 0) return 'fill-warning';
  return 'fill-success';
}

const ServiceGraph: React.FC<ServiceGraphProps> = ({ nodes, edges }) => {
  const navigate = useNavigate();

  if (nodes.length === 0) {
    return (
      <p className="text-center text-gray-500 py-8">
        No cross-service calls found for the selected time range. Call{' '}
        <code className="font-mono">instrumentAxios()</code> on the axios instance a
        service uses to call another instrumented service to see an edge here.
      </p>
    );
  }

  const names = nodes.map(n => n.serviceName);
  const columns = computeColumns(names, edges);
  const maxColumn = Math.max(...columns.values());

  const byColumn = new Map<number, string[]>();
  names.forEach(n => {
    const col = columns.get(n)!;
    if (!byColumn.has(col)) byColumn.set(col, []);
    byColumn.get(col)!.push(n);
  });

  const maxRows = Math.max(...Array.from(byColumn.values()).map(v => v.length));
  const width = (maxColumn + 1) * COLUMN_WIDTH + MARGIN * 2;
  const height = Math.max(maxRows, 1) * ROW_HEIGHT + MARGIN * 2;

  const positions = new Map<string, { x: number; y: number }>();
  byColumn.forEach((namesInColumn, col) => {
    namesInColumn.forEach((name, i) => {
      const colHeight = namesInColumn.length * ROW_HEIGHT;
      const yOffset = (height - colHeight) / 2 + ROW_HEIGHT / 2;
      positions.set(name, {
        x: MARGIN + col * COLUMN_WIDTH + NODE_RADIUS_MAX,
        y: yOffset + i * ROW_HEIGHT
      });
    });
  });

  const maxCallCount = Math.max(...nodes.map(n => n.callCount), 1);
  const nodeByName = new Map(nodes.map(n => [n.serviceName, n]));
  const radiusFor = (name: string) => {
    const calls = nodeByName.get(name)?.callCount ?? 0;
    const scale = Math.log(calls + 1) / Math.log(maxCallCount + 1);
    return NODE_RADIUS_MIN + scale * (NODE_RADIUS_MAX - NODE_RADIUS_MIN);
  };

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="mx-auto">
        <defs>
          <marker id="service-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="fill-gray-400" />
          </marker>
        </defs>

        {edges.map((edge, i) => {
          const from = positions.get(edge.source);
          const to = positions.get(edge.target);
          if (!from || !to) return null;
          const rFrom = radiusFor(edge.source);
          const rTo = radiusFor(edge.target);
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const x1 = from.x + (dx / dist) * rFrom;
          const y1 = from.y + (dy / dist) * rFrom;
          const x2 = to.x - (dx / dist) * (rTo + 8);
          const y2 = to.y - (dy / dist) * (rTo + 8);
          const strokeWidth = 1.5 + Math.log(edge.callCount + 1);
          const isError = edge.errorCount > 0;

          return (
            <line
              key={`${edge.source}-${edge.target}-${i}`}
              x1={x1} y1={y1} x2={x2} y2={y2}
              className={isError ? 'stroke-danger' : 'stroke-gray-400'}
              strokeWidth={strokeWidth}
              markerEnd="url(#service-arrow)"
            >
              <title>
                {edge.source} → {edge.target}: {edge.callCount} calls, {edge.avgDurationMs.toFixed(1)}ms avg
                {isError ? `, ${edge.errorCount} errors` : ''}
              </title>
            </line>
          );
        })}

        {names.map((name) => {
          const pos = positions.get(name);
          const node = nodeByName.get(name);
          if (!pos || !node) return null;
          const r = radiusFor(name);

          return (
            <g
              key={name}
              transform={`translate(${pos.x}, ${pos.y})`}
              className="cursor-pointer"
              onClick={() => navigate(`/traces?service=${encodeURIComponent(name)}`)}
            >
              <circle r={r} className={`${nodeColor(node.errorRate)} opacity-90 hover:opacity-100`}>
                <title>
                  {name}: {node.callCount} calls received, {(node.errorRate * 100).toFixed(1)}% error rate
                </title>
              </circle>
              <text
                textAnchor="middle"
                y={r + 16}
                className="fill-gray-900 text-xs font-medium"
              >
                {name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default ServiceGraph;
