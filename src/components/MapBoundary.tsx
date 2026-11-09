import { Component, type ReactNode } from 'react'

/**
 * Keeps the rest of the app alive when the map cannot start: WebGL switched off or blocked,
 * or the map code failing to download. Search, places and directions lists still work.
 */
export class MapBoundary extends Component<{ children: ReactNode; onFail?: () => void }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    this.props.onFail?.()
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="map map-loading map-failed" role="status">
        <div className="map-failed-card">
          <strong>The map can’t be shown</strong>
          <span>Your browser has graphics acceleration (WebGL) turned off, or the map failed to load. Search, places and directions still work.</span>
          <button onClick={() => location.reload()}>Reload</button>
        </div>
      </div>
    )
  }
}
