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
    const parts = path.split('/');
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
    await db.put(`answer:${body.session_id}:${body.phone}`, JSON.stringify(body));
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // 5. GET RESULTS
  if (path.includes('/results')) {
    const parts = path.split('/');
    const sessionId = parts[4];
    const sessionData = await db.get(`session:${sessionId}`, { type: "json" });
    const list = await db.list({ prefix: `answer:${sessionId}:` });
    
    const answers = [];
    let correctCount = 0;
    const keys = [];
    for (const key of list.keys) {
      keys.push(key.name);
      const ans = await db.get(key.name, { type: "json" });
      answers.push(ans);
      if (ans.answer === sessionData.correct_answer) correctCount++;
    }

    return new Response(JSON.stringify({
      session: sessionData,
      stats: { total: answers.length, correct: correctCount, wrong: answers.length - correctCount, answers: answers },
      debug: { keys: keys }  // 🔥 added debug field
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
    // 6. ATTENDANCE START
  if (path === '/api/attendance/start') {
    const sessionId = 'A' + Math.floor(Math.random() * 90000 + 10000);
    await db.put(`attendance:${sessionId}`, JSON.stringify({ status: 'active', created: Date.now(), attendees: [] }));
    return new Response(JSON.stringify({ session_id: sessionId }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // 7. ATTENDANCE CHECKIN
  if (path === '/api/attendance/checkin') {
    const body = await request.json();
    const { session_id, full_name, phone, student_id } = body;
    if (!session_id || !full_name || !phone) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    // Get existing attendees
    const sessionKey = `attendance:${session_id}`;
    const sessionData = await db.get(sessionKey, { type: 'json' });
    if (!sessionData) {
      return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    // Prevent duplicate check-in (same phone or student_id)
    if (sessionData.attendees) {
      const exists = sessionData.attendees.some(a => a.phone === phone || (student_id && a.student_id === student_id));
      if (exists) {
        return new Response(JSON.stringify({ error: 'مسجل بالفعل' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }
    // Add new attendee
    const newAttendee = {
      id: 'A' + Math.floor(Math.random() * 90000 + 10000),
      student_id: student_id || '',
      full_name,
      phone,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      status: 'present'
    };
    sessionData.attendees = sessionData.attendees || [];
    sessionData.attendees.push(newAttendee);
    await db.put(sessionKey, JSON.stringify(sessionData));
    return new Response(JSON.stringify({ success: true, attendance: newAttendee }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // 8. ATTENDANCE SESSION (GET)
  if (path.includes('/attendance/session/')) {
    const parts = path.split('/');
    const sessionId = parts[parts.length - 1]; // last part
    const sessionData = await db.get(`attendance:${sessionId}`, { type: 'json' });
    if (!sessionData) {
      return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    // Return the attendees list
    return new Response(JSON.stringify(sessionData.attendees || []), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  return new Response('Not found', { status: 404 });
}
