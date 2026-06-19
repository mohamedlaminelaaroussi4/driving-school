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

  // 1. START SESSION (Generate Session ID)
  if (path === '/api/questions/start') {
    const sessionId = 'S' + Math.floor(Math.random() * 90000 + 10000);
    await db.put(`session:${sessionId}`, JSON.stringify({ status: 'waiting', created: Date.now() }));
    return new Response(JSON.stringify({ success: true, session_id: sessionId }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }

  // 2. TRIGGER QUESTION (Activate Session)
  if (path.includes('/trigger')) {
    const sessionId = path.split('/')[3];
    const body = await request.json();
    const sessionData = {
      status: 'active',
      question: body.question || 'سؤال مباشر',
      correct_answer: body.correct_answer,
      duration: body.duration || 60,
      start_time: Date.now()
    };
    await db.put(`session:${sessionId}`, JSON.stringify(sessionData));
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }

  // 3. GET CURRENT QUESTION (Polling)
  if (path === '/api/questions/current') {
    const sessionId = url.searchParams.get('session');
    const session = await db.get(`session:${sessionId}`);
    if (!session) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: corsHeaders });
    return new Response(session, { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }

  // 4. SUBMIT ANSWER
  if (path === '/api/questions/submit') {
    const body = await request.json();
    await db.put(`answer:${body.session_id}:${body.phone}`, JSON.stringify(body));
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }

  return new Response('Not Found', { status: 404 });
}
