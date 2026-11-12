// The web app version. Platforms share major.minor; each has its own patch and build. On the web the build is the CI run number
// and the commit identifies the exact deploy.
export const APP_VERSION = __APP_VERSION__
export const APP_BUILD = __APP_BUILD__
export const APP_COMMIT = __APP_COMMIT__
/** production | beta | test | dev, for Tower's install counts. */
export const APP_CHANNEL = __APP_CHANNEL__

/** "1.0.0 (42 · a1b2c3d)" */
export const VERSION_LABEL = `${APP_VERSION} (${APP_BUILD === 'dev' ? 'dev' : `build ${APP_BUILD}`} · ${APP_COMMIT})`
