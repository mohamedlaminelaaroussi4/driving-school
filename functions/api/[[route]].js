const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const db = env.DB;

  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // ADMIN: Start Session
    if (path === '/api/questions/start' && request.method === 'POST') {
      const sessionId = 's' + Math.random().toString(36).substring(2, 7);
      await db.put(`session:${sessionId}`, JSON.stringify({ status: 'waiting' }), { expirationTtl: 7200 });
      return new Response(JSON.stringify({ success: true, session_id: sessionId }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ADMIN: Trigger Session
    if (path.includes('/trigger') && request.method === 'POST') {
      const sessionId = path.split('/')[3]; // Extracts ID from /api/questions/session/ID/trigger
      const { correct_answer, duration } = await request.json();
      await db.put(`session:${sessionId}`, JSON.stringify({ status: 'active', correct_answer, duration }), { expirationTtl: 7200 });
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // ADMIN: Results
    if (path.includes('/results')) {
      const sessionId = path.split('/')[3];
      const sessionData = await db.get(`session:${sessionId}`, { type: 'json' });
      // Logic to fetch all keys starting with `ans:${sessionId}:`
      // For simplicity, this is a placeholder. 
      return new Response(JSON.stringify({ session: sessionData, stats: { total: 0, correct: 0, wrong: 0, answers: [] } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // STUDENT: Current Question
    if (path === '/api/questions/current') {
      const sessionId = url.searchParams.get('session');
      const data = await db.get(`session:${sessionId}`);
      return new Response(data || JSON.stringify({ status: 'waiting' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // STUDENT: Submit
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
