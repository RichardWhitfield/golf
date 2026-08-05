interface ImportMetaEnv {
  /**
   * The Lambda Function URL. **Public by design** — it ships in `dist/` and is not a secret,
   * which is why it is a repository *variable* rather than a secret (D19, D22).
   */
  readonly VITE_API_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
