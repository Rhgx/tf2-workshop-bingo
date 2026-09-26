/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the deployed Steam proxy (worker/). Unset in dev, where Vite proxies `api/`. */
  readonly VITE_STEAM_PROXY?: string;
}
