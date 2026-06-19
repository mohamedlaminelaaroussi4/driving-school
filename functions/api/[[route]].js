export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const db = env.DB; 

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // 1. GET CURRENT QUESTION
  if (path === '/api/questions/current') {
    const sessionId = url.searchParams.get('session');
    const session = await db.get(`session:${sessionId}`);
    if (!session) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: corsHeaders });
    
    return new Response(session, { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }

  // 2. SUBMIT ANSWER
  if (path === '/api/questions/submit') {
    const body = await request.json();
    // Logic to save answer to KV
    await db.put(`answer:${body.session_id}:${body.phone}`, JSON.stringify(body));
    
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }

  return new Response('Not Found', { status: 404 });
}
