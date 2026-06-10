export interface Env {
  creador_db: D1Database;
  CREADOR_KV: KVNamespace;
  CREADOR_BUCKET: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // D1
    await env.creador_db.exec(`CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, name TEXT)`);
    await env.creador_db.prepare(`INSERT INTO test (name) VALUES ('Hola desde D1 local')`).run();
    const dbResult = await env.creador_db.prepare(`SELECT * FROM test`).all();

    // KV
    await env.CREADOR_KV.put("mensaje", "KV local funciona");
    const kvValue = await env.CREADOR_KV.get("mensaje");

    // R2
    await env.CREADOR_BUCKET.put("test.txt", "R2 local funciona");
    const obj = await env.CREADOR_BUCKET.get("test.txt");
    const r2Value = obj ? await obj.text() : "no encontrado";

    return new Response(JSON.stringify({
      d1: dbResult.results,
      kv: kvValue,
      r2: r2Value
    }));
  },
};