// Sorts a place's photos into Google-Maps-style tabs, on the device, like the iPhone's
// PhotoCategorizer. The Places API returns photos without categories, so each photo already
// loaded for the place page is looked at by a small image classifier (MobileNet v2, 8-bit, 2 MB,
// served with the app) running in the browser. Nothing leaves the device.
//
// iPhone reads menus from the text in the photo (many lines and several prices); the web has no
// text recognition built in, so it uses the classifier's own "menu" class, which ImageNet trains
// on photos of printed menus. Food & drink and Atmosphere come from the classifier on both.

import type { PlacePhoto } from './google'
import { photoURL } from './google'

export type PhotoCategory = 'menu' | 'food' | 'atmosphere'

export const CATEGORY_LABELS: Record<PhotoCategory, string> = {
  menu: 'Menu',
  food: 'Food & drink',
  atmosphere: 'Atmosphere',
}
export const CATEGORY_ORDER: PhotoCategory[] = ['menu', 'food', 'atmosphere']

// ImageNet class ids (0–999).
const MENU = [922]
const FOOD = [
  440, 441, 503, 504, 572, 809, 849, 907, // beer bottle, beer glass, cocktail shaker, coffee mug, goblet, soup bowl, teapot, wine bottle
  ...range(923, 969), // plate, guacamole, consomme … espresso, cup, eggnog
]
const ATMOSPHERE = [
  415, 424, 454, 467, 498, 509, 582, 624, 762, 788, 860, 865, // bakery, barbershop, bookshop, butcher, cinema, confectionery, grocery, library, restaurant, shoe shop, tobacco shop, toyshop
  423, 532, 559, 598, 619, 706, 765, 846, 905, 703, 421, 858, // barber chair, dining table, folding chair, home theater, lampshade, patio, rocking chair, table lamp, window shade, park bench, bannister, tile roof
]

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i)
}

const sum = (p: ArrayLike<number>, ids: number[], offset: number) => ids.reduce((s, i) => s + (p[i + offset] ?? 0), 0)

/** Pure scoring, split from the model so it can be tested: `probs` are the classifier's
 *  probabilities over ImageNet (1000 classes, or 1001 with a background class first). */
export function categoryOf(probs: ArrayLike<number>): PhotoCategory | null {
  const offset = probs.length === 1001 ? 1 : 0
  // Printed menus score 0.4–0.95 on real photos, but a tray of food laid out in a grid can reach
  // ~0.3, so the bar is set above that: a menu left in All is better than food under Menu.
  if (sum(probs, MENU, offset) >= 0.35) return 'menu'
  const food = sum(probs, FOOD, offset)
  const room = sum(probs, ATMOSPHERE, offset)
  if (food >= 0.25 && food >= room) return 'food'
  if (room >= 0.2) return 'atmosphere'
  if (food >= 0.25) return 'food'
  return null
}

// ---------- the model, loaded on first use

type Classify = (img: HTMLImageElement) => Promise<Float32Array>
let classifier: Promise<Classify | null> | null = null
/** After a failed load (often a brief network drop), when the next place may try again. */
let retryAt = 0
let failures = 0
let modelFetchStarted = false

function loadClassifier(): Promise<Classify | null> {
  if (classifier === null && Date.now() < retryAt) return Promise.resolve(null)
  classifier ??= (async () => {
    modelFetchStarted = false
    try {
      const tf = await import('@tensorflow/tfjs-core')
      await import('@tensorflow/tfjs-backend-webgl')
      await import('@tensorflow/tfjs-backend-cpu')
      const { loadGraphModel } = await import('@tensorflow/tfjs-converter')
      await tf.ready()
      // No GPU: the CPU backend takes seconds per photo and stalls the page, so the photos are
      // left unsorted instead (as when there's no backend at all).
      if (tf.getBackend() !== 'webgl') return null
      modelFetchStarted = true
      const model = await loadGraphModel(`${import.meta.env.BASE_URL}models/photo-sorter-v1/model.json`)
      return async (img: HTMLImageElement) => {
        const logits = tf.tidy(() => {
          // MobileNet v2 (TF Hub, classification/3) takes 224×224 RGB scaled to [0, 1].
          const pixels = tf.div(tf.cast(tf.browser.fromPixels(img), 'float32'), 255) as import('@tensorflow/tfjs-core').Tensor3D
          const input = tf.expandDims(tf.image.resizeBilinear(pixels, [224, 224]), 0)
          return tf.softmax(model.predict(input) as import('@tensorflow/tfjs-core').Tensor2D)
        })
        const probs = (await logits.data()) as Float32Array
        logits.dispose()
        return probs
      }
    } catch {
      // The model didn't load: try again on a later place, waiting longer each time (30 s, 1 min,
      // 2 min … up to 10 min), and drop a cached model in case that is what's broken.
      failures++
      retryAt = Date.now() + Math.min(600_000, 30_000 * 2 ** (failures - 1))
      classifier = null
      // Only when the model itself failed (a library chunk failing to download says nothing
      // about the cached model), and by suffix, so it follows the worker's cache version.
      if (modelFetchStarted) {
        try {
          for (const name of await caches.keys()) if (name.endsWith('-models')) await caches.delete(name)
        } catch { /* no Cache API */ }
      }
      return null
    }
  })()
  return classifier
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous' // the photo host allows it; needed to read the pixels
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('photo failed'))
    img.src = src
  })
}

// ---------- results, kept for the session

const STORE = 'kova.photoCategories.v1'
const known = new Map<string, PhotoCategory | null>(readStore())

function readStore(): [string, PhotoCategory | null][] {
  try {
    const raw = JSON.parse(sessionStorage.getItem(STORE) ?? '[]')
    return Array.isArray(raw) ? raw.filter((e) => Array.isArray(e) && typeof e[0] === 'string') : []
  } catch {
    return []
  }
}

function writeStore() {
  try {
    sessionStorage.setItem(STORE, JSON.stringify([...known].slice(-300)))
  } catch {
    /* private mode or full: results only last for this page */
  }
}

/** Whether sorting should run: not on a metered "save data" connection. */
export function canSortPhotos(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  return !c?.saveData
}

/** Categories for a place's photos, keyed by photo name. Calls `onUpdate` as each photo is sorted. */
export async function sortPhotos(photos: PlacePhoto[], onUpdate: (categories: Map<string, PhotoCategory | null>) => void, signal?: AbortSignal): Promise<void> {
  const result = new Map<string, PhotoCategory | null>()
  for (const p of photos) if (known.has(p.name)) result.set(p.name, known.get(p.name)!)
  if (result.size) onUpdate(new Map(result))
  const todo = photos.filter((p) => !known.has(p.name))
  if (!todo.length || !canSortPhotos()) return
  const classify = await loadClassifier()
  if (!classify) return
  for (const p of todo) {
    if (signal?.aborted) return
    try {
      // The same URL (and CORS mode) the thumbnails use, so it comes from the browser cache
      // instead of being fetched, and billed, a second time.
      const img = await loadImage(photoURL(p, 200))
      const category = categoryOf(await classify(img))
      known.set(p.name, category)
      result.set(p.name, category)
      writeStore()
      if (!signal?.aborted) onUpdate(new Map(result))
    } catch {
      /* a photo that won't load or classify stays in All only */
    }
  }
}

/** The classifier's probabilities for one image URL, or null without a model. For checks and tests. */
export async function probabilitiesFor(src: string): Promise<Float32Array | null> {
  const classify = await loadClassifier()
  return classify ? classify(await loadImage(src)) : null
}
