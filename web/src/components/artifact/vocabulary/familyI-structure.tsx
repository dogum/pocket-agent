import { useMemo, type JSX } from 'react'

import type {
  NetworkComponent,
  SankeyComponent,
  ThemeColor,
  TreeComponent,
} from '@shared/index'
import { toneClass } from './utils'

const COLOR_VAR: Record<ThemeColor, string> = {
  signal: 'var(--signal)',
  cool: 'var(--cool)',
  green: 'var(--green)',
  amber: 'var(--amber)',
  red: 'var(--red)',
  muted: 'var(--text-3)',
}

export function CNetwork({ nodes, edges }: NetworkComponent): JSX.Element {
  const W = 320
  const H = 220
  const positions = useMemo(() => {
    const radius = 82
    const center = { x: W / 2, y: H / 2 }
    return Object.fromEntries(
      nodes.map((node, index) => {
        const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2 - Math.PI / 2
        return [
          node.id,
          {
            x: center.x + Math.cos(angle) * radius,
            y: center.y + Math.sin(angle) * radius,
          },
        ]
      }),
    )
  }, [nodes])

  return (
    <div className="c-network">
      <svg viewBox={`0 0 ${W} ${H}`} role="img">
        {edges.map((edge, index) => {
          const from = positions[edge.from]
          const to = positions[edge.to]
          if (!from || !to) return null
          return (
            <g key={`${edge.from}-${edge.to}-${index}`}>
              <line
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={edge.color ? COLOR_VAR[edge.color] : 'var(--hairline-strong)'}
                strokeWidth={1.2}
              />
              {edge.label && (
                <text
                  x={(from.x + to.x) / 2}
                  y={(from.y + to.y) / 2}
                  textAnchor="middle"
                >
                  {edge.label}
                </text>
              )}
            </g>
          )
        })}
        {nodes.map((node) => {
          const point = positions[node.id]
          if (!point) return null
          return (
            <g key={node.id}>
              <circle
                cx={point.x}
                cy={point.y}
                r={18}
                fill={node.color ? COLOR_VAR[node.color] : 'var(--surface-2)'}
              />
              <text x={point.x} y={point.y + 4} textAnchor="middle">
                {node.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export function CTree({ root_label, nodes }: TreeComponent): JSX.Element {
  const rows = useMemo(() => flattenTree(nodes), [nodes])
  return (
    <div className="c-tree">
      {root_label && <div className="tree-root">{root_label}</div>}
      {rows.map((row) => (
        <div
          className={'tree-row' + toneClass(row.node.color)}
          key={row.node.id}
          style={{ paddingLeft: 10 + row.depth * 18 }}
        >
          <span className="branch" />
          <span className="label">{row.node.label}</span>
          {row.node.value && <strong>{row.node.value}</strong>}
        </div>
      ))}
    </div>
  )
}

export function CSankey({ nodes, flows }: SankeyComponent): JSX.Element {
  const max = Math.max(1, ...flows.map((flow) => flow.value))
  const labelFor = (id: string): string =>
    nodes.find((node) => node.id === id)?.label ?? id

  return (
    <div className="c-sankey">
      {flows.map((flow, index) => (
        <div className="flow-row" key={`${flow.from}-${flow.to}-${index}`}>
          <div className="flow-labels">
            <span>{labelFor(flow.from)}</span>
            <span>{labelFor(flow.to)}</span>
          </div>
          <div className="flow-track">
            <span
              className={flow.color ?? ''}
              style={{ width: `${Math.max(8, (flow.value / max) * 100)}%` }}
            />
          </div>
          <div className="flow-meta">
            <strong>{flow.value}</strong>
            {flow.label && <span>{flow.label}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

function flattenTree(
  nodes: TreeComponent['nodes'],
): Array<{ node: TreeComponent['nodes'][number]; depth: number }> {
  const byParent = new Map<string | undefined, TreeComponent['nodes']>()
  for (const node of nodes) {
    const list = byParent.get(node.parent_id) ?? []
    list.push(node)
    byParent.set(node.parent_id, list)
  }
  const rows: Array<{ node: TreeComponent['nodes'][number]; depth: number }> = []
  const visit = (parentId: string | undefined, depth: number): void => {
    for (const node of byParent.get(parentId) ?? []) {
      rows.push({ node, depth })
      visit(node.id, depth + 1)
    }
  }
  visit(undefined, 0)
  return rows
}
