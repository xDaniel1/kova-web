/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_MAPBOX_TOKEN?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare const __APP_VERSION__: string
declare const __APP_BUILD__: string
declare const __APP_COMMIT__: string
