export default {
  async fetch(request, env) {
    if (request.method === "GET") {
      return Response.json({ ok: true, service: "yt-furigana-ai-proxy" });
    }
    if (request.method !== "POST") {
      return new Response("POST only", { status: 405 });
    }
    const secret = request.headers.get("x-proxy-secret") || "";
    if (!env.PROXY_SECRET || secret !== env.PROXY_SECRET) {
      return Response.json({ success: false, error: "unauthorized" }, { status: 401 });
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ success: false, error: "invalid_json" }, { status: 400 });
    }
    const model = body.model || "@cf/meta/llama-3.2-3b-instruct";
    const messages = body.messages;
    if (!Array.isArray(messages)) {
      return Response.json({ success: false, error: "messages_required" }, { status: 400 });
    }
    try {
      const result = await env.AI.run(model, {
        messages,
        temperature: body.temperature ?? 0.7,
        max_tokens: body.max_tokens ?? 512,
      });
      return Response.json({ success: true, result });
    } catch (err) {
      return Response.json(
        { success: false, error: String(err?.message || err) },
        { status: 500 }
      );
    }
  },
};
