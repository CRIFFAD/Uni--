/* ============================================================
   Summit Hub — R2 upload Worker.
   Verifies the caller is a logged-in Summit Hub user (via
   Supabase), then uploads/deletes photos in R2.
   ============================================================ */

const ALLOWED_METHODS = 'POST, DELETE, OPTIONS';

function withCors(response, env){
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', env.ALLOWED_ORIGIN || '*');
  headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS);
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-File-Name');
  return new Response(response.body, { status: response.status, headers });
}

async function verifyUser(request, env){
  const auth = request.headers.get('Authorization');
  if (!auth) return null;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: env.SUPABASE_ANON_KEY }
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user && user.id ? user : null;
}

export default {
  async fetch(request, env){
    if (request.method === 'OPTIONS'){
      return withCors(new Response(null, { status: 204 }), env);
    }

    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/upload'){
      const user = await verifyUser(request, env);
      if (!user){
        return withCors(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }), env);
      }

      const rawName = request.headers.get('X-File-Name') || 'photo.jpg';
      const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const key = `${user.id}/${Date.now()}-${safeName}`;

      const body = await request.arrayBuffer();
      if (body.byteLength === 0 || body.byteLength > 8 * 1024 * 1024){
        return withCors(new Response(JSON.stringify({ error: 'File must be under 8MB' }), { status: 400 }), env);
      }

      await env.LISTINGS_BUCKET.put(key, body, {
        httpMetadata: { contentType: request.headers.get('Content-Type') || 'image/jpeg' }
      });

      const publicUrl = `${env.PUBLIC_R2_URL}/${key}`;
      return withCors(new Response(JSON.stringify({ url: publicUrl, key }), {
        headers: { 'Content-Type': 'application/json' }
      }), env);
    }

    if (request.method === 'DELETE' && url.pathname === '/delete'){
      const user = await verifyUser(request, env);
      if (!user){
        return withCors(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }), env);
      }

      const key = url.searchParams.get('key');
      if (!key || !key.startsWith(`${user.id}/`)){
        return withCors(new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }), env);
      }

      await env.LISTINGS_BUCKET.delete(key);
      return withCors(new Response(JSON.stringify({ deleted: true }), {
        headers: { 'Content-Type': 'application/json' }
      }), env);
    }

    return withCors(new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }), env);
  }
};
