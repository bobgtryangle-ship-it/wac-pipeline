// netlify/functions/upload.js
// Mints a one-time signed upload URL for Supabase Storage.
// The SERVICE key lives ONLY in a Netlify environment variable (SUPABASE_SERVICE_KEY).
// The browser never sees it; it only receives a short-lived signed URL for ONE file path.

exports.handler = async (event) => {
  // Basic CORS so the upload page can call this.
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Use POST" }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;            // e.g. https://xxxx.supabase.co
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;     // secret service_role key
  const BUCKET = process.env.SUPABASE_BUCKET || "reports";

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server not configured (missing env vars)." }) };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Bad request body." }) }; }

  const path = (body.path || "").replace(/^\/+/, "");
  if (!path || /\.\./.test(path)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid file path." }) };
  }

  // Ask Supabase Storage for a signed upload URL for this exact path.
  const endpoint = `${SUPABASE_URL}/storage/v1/object/upload/sign/${BUCKET}/${encodeURI(path)}`;
  try {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "apikey": SERVICE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const text = await r.text();
    if (!r.ok) {
      return { statusCode: r.status, headers, body: JSON.stringify({ error: "Supabase rejected the request.", detail: text }) };
    }

    // Supabase returns { url: "/object/upload/sign/<bucket>/<path>?token=..." }
    const data = JSON.parse(text);
    const signedPath = data.url || data.signedURL || "";
    const uploadUrl = `${SUPABASE_URL}/storage/v1${signedPath}`;
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${encodeURI(path)}`;

    return { statusCode: 200, headers, body: JSON.stringify({ uploadUrl, publicUrl }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Could not reach Supabase.", detail: String(e) }) };
  }
};
