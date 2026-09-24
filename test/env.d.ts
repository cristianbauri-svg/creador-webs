// `env` se importa de "cloudflare:workers", que lo tipa como Cloudflare.Env:
// el tipo que `wrangler types` genera en ../worker-configuration.d.ts a partir
// de wrangler.jsonc. Con @cloudflare/vitest-plugin ya no existe ProvidedEnv.
declare module "*?raw" { const contenido: string; export default contenido; }
