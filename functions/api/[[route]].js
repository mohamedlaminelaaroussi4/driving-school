export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const db = env.DB; // Ensure you have a D1 or KV binding named 'DB'

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // 1. START SESSION
    if (path === '/api/questions/start') {
      const sessionId = 'S' + Math.floor(Math.random() * 90000 + 10000);
      const initialData = { status: 'waiting', created: Date.now() };
      await db.put(`session:${sessionId}`, JSON.stringify(initialData));
      
      return new Response(JSON.stringify({ success: true, session_id: sessionId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2. TRIGGER QUESTION
    if (path.includes('/trigger')) {
      const sessionId = path.split('/')[3];
      const body = await request.json();
      
      const sessionData = {
        status: 'active',
        question: body.question || 'سؤال مباشر',
        correct_answer: body.correct_answer,
        duration: body.duration,
        start_time: Date.now()
      };
      
      await db.put(`session:${sessionId}`, JSON.stringify(sessionData));
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // 3. FETCH RESULTS (Placeholder for now)
    if (path.includes('/results')) {
      return new Response(JSON.stringify({ session: {}, stats: { total: 0, correct: 0, wrong: 0, answers: [] } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Endpoint not found' }), { status: 404 });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
}
