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

  // 1. START SESSION
  if (path === '/api/questions/start') {
    const sessionId = 'S' + Math.floor(Math.random() * 90000 + 10000);
    await db.put(`session:${sessionId}`, JSON.stringify({ status: 'waiting', created: Date.now() }));
    return new Response(JSON.stringify({ success: true, session_id: sessionId }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // 2. TRIGGER QUESTION
  if (path.includes('/trigger')) {
    const sessionId = path.split('/')[3];
    const body = await request.json();
    await db.put(`session:${sessionId}`, JSON.stringify({
      status: 'active',
      correct_answer: body.correct_answer,
      duration: body.duration,
      start_time: Date.now()
    }));
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // 3. GET CURRENT QUESTION (Student Polling)
  if (path === '/api/questions/current') {
    const sessionId = url.searchParams.get('session');
    const session = await db.get(`session:${sessionId}`);
    return new Response(session || JSON.stringify({ status: 'waiting' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // 4. SUBMIT ANSWER
  if (path === '/api/questions/submit') {
    const body = await request.json();
    // Save individual student answer
    await db.put(`answer:${body.session_id}:${body.phone}`, JSON.stringify(body));
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // 5. GET RESULTS (Admin Panel Polling)
  if (path.includes('/results')) {
    const sessionId = path.split('/')[3];
    const sessionData = await db.get(`session:${sessionId}`, { type: "json" });
    
    // Cloudflare KV list is limited, for this scale we fetch all answers manually
    // In a production environment with 1000s of users, use a separate 'list' key
    const list = await db.list({ prefix: `answer:${sessionId}:` });
    const answers = [];
    let correct = 0;
    
    for (const key of list.keys) {
      const ans = await db.get(key.name, { type: "json" });
      answers.push(ans);
      // Logic: if student answer matches target (simplified comparison)
      if (ans.answer === sessionData.correct_answer) correct++;
    }

    return new Response(JSON.stringify({ 
      session: sessionData, 
      stats: { total: answers.length, correct, wrong: answers.length - correct, answers } 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  return new Response('Not Found', { status: 404 });
}
