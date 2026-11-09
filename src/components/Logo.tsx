/** The Kova mark: a pin standing in a ring, on the brand gradient. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return <img src="/favicon.svg" width={size} height={size} alt="" className="logo-mark" />
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <LogoMark size={28} />
      <span>Kova</span>
    </span>
  )
}
