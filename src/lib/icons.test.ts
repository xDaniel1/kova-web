import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The icon font is subset to the names listed in index.html. Any icon the code uses must be in
// that list, or it renders as its ligature text. This collects icon names from <Icon name=...>,
// `icon: '...'` entries and the *_ICON lookup tables.
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? sources(join(dir, d.name)) : /\.tsx?$/.test(d.name) && !d.name.includes('.test.') ? [join(dir, d.name)] : []))
}

describe('icon font subset', () => {
  it('includes every icon the app uses', () => {
    const html = readFileSync('index.html', 'utf8')
    const subset = new Set(decodeURIComponent(html.match(/icon_names=([^&"]+)/)![1]).split(','))
    const used = new Set<string>()
    for (const f of sources('src')) {
      for (const line of readFileSync(f, 'utf8').split('\n')) {
        const isIconLine = /<Icon\b/.test(line) || /\bicon: '/.test(line) || /_ICON\b.*=/.test(line) || /^\s+'[a-z ]+': '[a-z_]+',/.test(line)
        if (!isIconLine) continue
        // In <Icon> lines take quoted names in the name prop; in tables take the values.
        let names: string[]
        if (/<Icon\b/.test(line)) {
          const prop = line.match(/name="([a-z_]+)"/)?.[1] ?? line.match(/name=\{([^}]*)\}/)?.[1] ?? ''
          // Skip strings that are arguments (includes('ferry')), keep the ternary results.
          names = prop.startsWith('') && !line.includes('name="') ? [...prop.replace(/\w+\('[^']*'\)/g, '').replace(/[!=]==? '[^']*'/g, '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]) : prop ? [prop] : []
        } else if (/\bicon: '/.test(line)) {
          names = [line.match(/\bicon: '([a-z_]+)'/)?.[1] ?? ''].filter(Boolean)
        } else {
          names = [...line.matchAll(/:\s*'([a-z_]+)'/g)].map((m) => m[1])
        }
        names.forEach((n) => used.add(n))
      }
    }
    expect(used.size).toBeGreaterThan(40)
    expect([...used].filter((n) => !subset.has(n)).sort()).toEqual([])
  })
})
