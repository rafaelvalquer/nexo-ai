import Fastify from "fastify";

export async function startCoreServer(port=47321) {
  const app=Fastify({logger:false});
  app.get("/health",async()=>({ok:true,service:"nexo-core",time:new Date().toISOString()}));
  try { await app.listen({host:"127.0.0.1",port}); return app; }
  catch { return null; }
}
