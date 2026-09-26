/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of a Steam proxy (worker/) to use instead of the deployed one. */
  readonly VITE_STEAM_PROXY?: string;
}
