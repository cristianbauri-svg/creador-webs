\# CLAUDE.md — creador-webs



\## Rol del agente

Diseñador y desarrollador fullstack de sitios web con Cloudflare Workers, D1, KV y R2.



\## Infraestructura local

\- \*\*`wrangler dev`\*\*: Worker en `http://127.0.0.1:8787`. D1, KV y R2 se emulan en local con SQLite y archivos.

\- \*\*Bindings disponibles\*\*: `creador\_db` (D1), `CREADOR\_KV` (KV), `CREADOR\_BUCKET` (R2).

\- \*\*Despliegue\*\*: `wrangler deploy` desde el worktree correcto. Cada worktree puede apuntar a una cuenta Cloudflare distinta.



\## MCPs activos (proyecto + globales)

\- `21st-dev` (4 tools): generación de componentes UI con lenguaje natural. Describir el componente deseado.

\- `mcp-memory`, `mcp-docker`, `mcp-metrics`, `postgres`, `github`, `sequential-thinking`.



\## Skills de diseño (plugins)

\- `ui-ux-pro-max-skill`, `impeccable`, `open-design`

\- `frontend-design` (preinstalada)

\- `awesome-design-md`: colección externa. Descargar sistemas de diseño con `npx typeui.sh pull <slug>`.



\## Skills Cloudflare (auto-carga)

Consultar `\~/.claude/skills/` para guías detalladas. Principales: `cloudflare`, `wrangler`, `workers-best-practices`, `durable-objects`, `web-perf`, `agents-sdk`.



\## Reglas

1\. Antes de modificar infraestructura, consultar `mcp-memory` y `C:\\Users\\USUARIO\\dev\\sessions\\active.json`.

2\. Usar `wrangler dev` para probar todo localmente antes de desplegar.

3\. Secretos (tokens, API keys) en Vault (`secret/dev/`). Nunca en texto plano.

4\. Commits atómicos y probados. El hook `block-secrets.sh` bloquea credenciales en commits.

5\. Comunicación en español neutro, sin jerga regional.

