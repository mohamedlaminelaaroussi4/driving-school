const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  
  // Handle CORS preflight
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const path = url.pathname;

  try {
    // 1. START SESSION
    if (path === '/api/start' && request.method === 'POST') {
      const sessionId = 's' + Math.random().toString(36).substring(2, 7);
      await env.DB.put(`session:${sessionId}`, JSON.stringify({ status: 'waiting' }), { expirationTtl: 7200 });
      return new Response(JSON.stringify({ session_id: sessionId }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2. TRIGGER SESSION
    if (path === '/api/trigger' && request.method === 'POST') {
      const { session_id, answer, duration } = await request.json();
      await env.DB.put(`session:${session_id}`, JSON.stringify({ 
        status: 'active', correct_answer: answer, duration: duration || 60, started_at: Date.now() 
      }), { expirationTtl: 7200 });
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // 3. STUDENT POLLING
    if (path === '/api/current') {
      const sessionId = url.searchParams.get('session');
      const data = await env.DB.get(`session:${sessionId}`);
      return new Response(data, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 4. STUDENT SUBMIT
    if (path === '/api/submit' && request.method === 'POST') {
      const body = await request.json();
      await env.DB.put(`ans:${body.session_id}:${body.phone}`, JSON.stringify(body), { expirationTtl: 7200 });
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }

  return new Response('Not Found', { status: 404 });
}
