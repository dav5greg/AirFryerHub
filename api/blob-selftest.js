import { del, get, head, put } from "@vercel/blob";

const STORE_ID = "store_mf4bvG7gskaNUTXi";
const PATH = "airfryer/_selftest.json";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }

  try {
    const payload = JSON.stringify({ ok: true, timestamp: Date.now() });

    const written = await put(PATH, payload, {
      access: "private",
      storeId: STORE_ID,
      allowOverwrite: true,
      contentType: "application/json"
    });

    const metadata = await head(PATH, {
      access: "private",
      storeId: STORE_ID
    });

    const stored = await get(PATH, {
      access: "private",
      storeId: STORE_ID,
      useCache: false
    });

    const content = await new Response(stored.stream).text();
    await del(PATH, {
      storeId: STORE_ID
    });

    response.status(200).json({
      ok: content === payload,
      etag: metadata.etag,
      url: written.url,
      deleted: true
    });
  } catch (error) {
    response.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
