import { REPORT_KINDS, type ReportKind } from '../lib/reports'

interface Props {
  signedIn: boolean
  arming: ReportKind | null
  count: number
  onArm: (kind: ReportKind | null) => void
}

/** The "Report" button and kind picker; after picking a kind, the next map click places it. */
export function ReportsControl({ signedIn, arming, count, onArm }: Props) {
  if (!signedIn) return null
  return (
    <div className="reports-control">
      {arming ? (
        <div className="panel arming">
          <span>Click the map where the {arming.toLowerCase()} is</span>
          <button className="link" onClick={() => onArm(null)}>Cancel</button>
        </div>
      ) : (
        <details className="panel report-menu">
          <summary title={`${count} recent reports nearby`}>⚠️ Report{count ? ` · ${count}` : ''}</summary>
          <ul>
            {REPORT_KINDS.map((k) => (
              <li key={k.kind}>
                <button onClick={(e) => { onArm(k.kind); (e.currentTarget.closest('details') as HTMLDetailsElement).open = false }}>
                  <span className="report-dot" style={{ background: k.color }}>{k.icon}</span> {k.kind}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
