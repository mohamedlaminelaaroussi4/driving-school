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

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ━━━ QUESTIONS API ━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    // START SESSION
    if (path === '/api/questions/start') {
      const sessionId = 'S' + Math.floor(Math.random() * 90000 + 10000);
      await db.put(`session:${sessionId}`, JSON.stringify({
        status: 'waiting',
        created: Date.now(),
        answers: []           // ← all answers go here
      }));
      return new Response(JSON.stringify({ success: true, session_id: sessionId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // TRIGGER QUESTION
    if (path.includes('/trigger')) {
      const parts = path.split('/');
      const sessionId = parts[4];
      const body = await request.json();

      // Preserve existing answers array
      const existing = await db.get(`session:${sessionId}`, { type: "json" });
      const existingAnswers = existing?.answers || [];

      await db.put(`session:${sessionId}`, JSON.stringify({
        status: 'active',
        correct_answer: body.correct_answer,
        duration: body.duration,
        start_time: Date.now(),
        answers: existingAnswers
      }));
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // STUDENT POLLING – still no correct_answer leaked
    if (path === '/api/questions/current') {
      const sessionId = url.searchParams.get('session');
      const session = await db.get(`session:${sessionId}`);
      if (!session) {
        return new Response(JSON.stringify({ status: 'waiting' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      const data = JSON.parse(session);
      return new Response(JSON.stringify({
        status: data.status || 'waiting',
        duration: data.duration || 60,
        start_time: data.start_time || null
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // SUBMIT ANSWER – store directly in session
    if (path === '/api/questions/submit') {
      const body = await request.json();
      const sessionKey = `session:${body.session_id}`;
      const sessionData = await db.get(sessionKey, { type: "json" });

      if (!sessionData) {
        return new Response(JSON.stringify({ error: 'Session not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Build answer object (same as before)
      const newAnswer = {
        full_name: body.full_name,
        phone: body.phone,
        student_id: body.student_id || '',
        answer: body.answer,
        ip_address: body.ip_address || 'unknown',
        user_agent: body.user_agent || 'unknown',
        device_fingerprint: body.device_fingerprint || 'unknown',
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19)
      };

      // Replace existing answer from same phone (no duplicates)
      const existingIndex = sessionData.answers.findIndex(a => a.phone === body.phone);
      if (existingIndex >= 0) {
        sessionData.answers[existingIndex] = newAnswer;
      } else {
        sessionData.answers.push(newAnswer);
      }

      await db.put(sessionKey, JSON.stringify(sessionData));

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // GET RESULTS – read directly from session
    if (path.includes('/results')) {
      const parts = path.split('/');
      const sessionId = parts[4];
      const sessionData = await db.get(`session:${sessionId}`, { type: "json" });

      if (!sessionData) {
        return new Response(JSON.stringify({ error: 'Session not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const correctAnswer = sessionData.correct_answer
        ? sessionData.correct_answer.split(',').sort().join(',')
        : '';

      const answers = sessionData.answers || [];

      return new Response(JSON.stringify({
        session: sessionData,
        stats: {
          total: answers.length,
          correct: answers.filter(a => {
            const studentAnswer = (a.answer || '').split(',').sort().join(',');
            return studentAnswer === correctAnswer;
          }).length,
          wrong: answers.filter(a => {
            const studentAnswer = (a.answer || '').split(',').sort().join(',');
            return studentAnswer !== correctAnswer;
          }).length,
          answers: answers
        }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ━━━ ATTENDANCE API (unchanged) ━━━━━━━━━━━━━━━━━
    const FLASK_BASE = 'https://YOUR_TUNNEL_URL';   // ← replace with your tunnel

    if (path === '/api/attendance/start') {
      try {
        const res = await fetch(`${FLASK_BASE}/api/attendance/start`, { method: 'POST' });
        const data = await res.json();
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch {
        const sessionId = 'A' + Math.floor(Math.random() * 90000 + 10000);
        await db.put(`attendance:${sessionId}`, JSON.stringify({ status: 'active', created: Date.now(), attendees: [] }));
        return new Response(JSON.stringify({ session_id: sessionId }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    if (path === '/api/attendance/checkin') {
      const body = await request.json();
      const { session_id, full_name, phone, student_id } = body;
      if (!session_id || !full_name || !phone) {
        return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      try {
        const res = await fetch(`${FLASK_BASE}/api/attendance/checkin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await res.json();
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch {
        const key = `attendance:${session_id}`;
        const data = await db.get(key, { type: 'json' });
        if (!data) return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        if (data.attendees.some(a => a.phone === phone || (student_id && a.student_id === student_id))) {
          return new Response(JSON.stringify({ error: 'مسجل بالفعل' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const newAtt = {
          id: 'A' + Math.floor(Math.random() * 90000 + 10000),
          student_id, full_name, phone,
          timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
          status: 'present',
          ip_address: body.ip_address || 'unknown',
          user_agent: body.user_agent || 'unknown',
          device_fingerprint: body.device_fingerprint || 'unknown'
        };
        data.attendees.push(newAtt);
        await db.put(key, JSON.stringify(data));
        return new Response(JSON.stringify({ success: true, attendance: newAtt }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    if (path.includes('/attendance/session/')) {
      const sessionId = path.split('/').pop();
      try {
        const res = await fetch(`${FLASK_BASE}/api/attendance/session/${sessionId}`);
        const data = await res.json();
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch {
        const data = await db.get(`attendance:${sessionId}`, { type: 'json' });
        if (!data) return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        return new Response(JSON.stringify(data.attendees || []), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    if (path === '/api/attendance/all') {
      try {
        const res = await fetch(`${FLASK_BASE}/api/attendance/all`);
        const data = await res.json();
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch {
        return new Response(JSON.stringify([]), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    if (path === '/api/attendance/stats') {
      try {
        const res = await fetch(`${FLASK_BASE}/api/attendance/stats`);
        const data = await res.json();
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch {
        return new Response(JSON.stringify({ total_sessions: 0, total_checkins: 0, unique_students: 0, unique_phones: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    return new Response(JSON.stringify({ error: 'Endpoint not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: "API Crash", details: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
