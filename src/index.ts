export interface Env {
  creador_db: D1Database;
  CREADOR_KV: KVNamespace;
  CREADOR_BUCKET: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return new Response('Not Found', { status: 404 });
  },
};