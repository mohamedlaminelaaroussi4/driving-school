const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const path = url.pathname;
  const db = env.DB; // Ensure your Binding in Settings is named 'DB'

  try {
    // 1. POLLING: Student asks "Is it started?"
    if (path === '/api/questions/current') {
      const sessionId = url.searchParams.get('session');
      const data = await db.get(`session:${sessionId}`);
      return new Response(data || JSON.stringify({ error: 'Question not yet active' }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // 2. SUBMIT: Student sends answer
    if (path === '/api/questions/submit' && request.method === 'POST') {
      const body = await request.json();
      await db.put(`ans:${body.session_id}:${body.phone}`, JSON.stringify(body), { expirationTtl: 7200 });
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    return new Response('Not Found', { status: 404 });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
}
