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
  // Match exact pattern: /api/questions/session/{id}/trigger
 if (path.includes('/trigger')) {
   const parts = path.split('/');
   // For /api/questions/session/S12345/trigger
   // parts[1]=api, parts[2]=questions, parts[3]=session, parts[4]=S12345, parts[5]=trigger
   const sessionId = parts[4]; 
    
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

// 5. GET RESULTS
  // Admin calls: /api/questions/session/S42856/results
  if (path.includes('/results')) {
    const parts = path.split('/');
    const sessionId = parts[4]; // Gets S42856
    
    const sessionData = await db.get(`session:${sessionId}`, { type: "json" });
    const list = await db.list({ prefix: `answer:${sessionId}:` });
    
    const answers = [];
    let correctCount = 0;
    
    for (const key of list.keys) {
      const ans = await db.get(key.name, { type: "json" });
      answers.push(ans);
      // Correct comparison logic
      if (ans.answer === sessionData.correct_answer) correctCount++;
    }

    return new Response(JSON.stringify({ 
      session: sessionData, 
      stats: { total: answers.length, correct: correctCount, wrong: answers.length - correctCount, answers: answers } 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
