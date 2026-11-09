/** Material Symbols, the icon set Google Maps uses. `fill` switches to the solid variant. */
export function Icon({ name, fill, size, className }: { name: string; fill?: boolean; size?: number; className?: string }) {
  return (
    <span
      className={'msym' + (className ? ' ' + className : '')}
      aria-hidden
      style={{ fontVariationSettings: `'FILL' ${fill ? 1 : 0}`, ...(size ? { fontSize: size } : {}) }}
    >
      {name}
    </span>
  )
}
