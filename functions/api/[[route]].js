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

  // 🛡️ GLOBAL ERROR BOUNDARY: Ensures CORS is never dropped on a crash
  try {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // QUESTIONS (KV storage)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
      if (!session) {
        return new Response(JSON.stringify({ status: 'waiting' }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
      const data = JSON.parse(session);
      return new Response(JSON.stringify({
        status: data.status || 'waiting',
        duration: data.duration || 60,
        start_time: data.start_time || null,
        correct_answer: data.correct_answer || null
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 4. SUBMIT ANSWER
    if (path === '/api/questions/submit') {
      const body = await request.json();
      await db.put(`answer:${body.session_id}:${body.phone}`, JSON.stringify({
        session_id: body.session_id,
        full_name: body.full_name,
        phone: body.phone,
        student_id: body.student_id || '',
        answer: body.answer,
        ip_address: body.ip_address || 'unknown',
        user_agent: body.user_agent || 'unknown',
        device_fingerprint: body.device_fingerprint || 'unknown',
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19)
      }));
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 5. GET RESULTS
    if (path.includes('/results')) {
      const parts = path.split('/');
      const sessionId = parts[4];
      const sessionData = await db.get(`session:${sessionId}`, { type: "json" });
      
      if (!sessionData) {
        return new Response(JSON.stringify({
          session: { status: 'not_found' },
          stats: { total: 0, correct: 0, wrong: 0, answers: [] },
          debug: { keys: [] }
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      
      const list = await db.list({ prefix: `answer:${sessionId}:` });
      const answers = [];
      const keys = [];
      let correctCount = 0;
      
      // Safety check: Fallback to empty array if list.keys is undefined
      const safeKeys = list.keys || []; 
      
      for (const key of safeKeys) {
        keys.push(key.name);
        const ans = await db.get(key.name, { type: "json" });
        if (ans) {
          answers.push(ans);
          if (ans.answer && ans.answer === sessionData.correct_answer) {
            correctCount++;
          }
        }
      }
    
      return new Response(JSON.stringify({
        session: sessionData,
        stats: { 
          total: answers.length, 
          correct: correctCount, 
          wrong: answers.length - correctCount, 
          answers: answers 
        },
        debug: { keys: keys }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ATTENDANCE (Forward to Flask via Cloudflare Tunnel)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const FLASK_BASE = 'https://YOUR_TUNNEL_URL'; // ⚠️ Ensure this is updated

    // 6. ATTENDANCE START
    if (path === '/api/attendance/start') {
      const flaskUrl = `${FLASK_BASE}/api/attendance/start`;
      try {
        const response = await fetch(flaskUrl, { method: 'POST' });
        const data = await response.json();
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (error) {
        const sessionId = 'A' + Math.floor(Math.random() * 90000 + 10000);
        await db.put(`attendance:${sessionId}`, JSON.stringify({ status: 'active', created: Date.now(), attendees: [] }));
        return new Response(JSON.stringify({ session_id: sessionId }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // 7. ATTENDANCE CHECKIN
    if (path === '/api/attendance/checkin') {
      const body = await request.json();
      const session_id = body.session_id;
      const full_name = body.full_name || '';
      const phone = body.phone || '';
      const student_id = body.student_id || '';
      const ip_address = body.ip_address || 'unknown';
      const user_agent = body.user_agent || 'unknown';
      const device_fingerprint = body.device_fingerprint || 'unknown';

      if (!session_id || !full_name || !phone) {
        return new Response(JSON.stringify({ error: 'Missing fields' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const flaskUrl = `${FLASK_BASE}/api/attendance/checkin`;
      try {
        const response = await fetch(flaskUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id, full_name, phone, student_id,
            ip_address, user_agent, device_fingerprint
          })
        });
        const data = await response.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        const sessionKey = `attendance:${session_id}`;
        const sessionData = await db.get(sessionKey, { type: 'json' });
        if (!sessionData) {
          return new Response(JSON.stringify({ error: 'Session not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        if (sessionData.attendees) {
          const exists = sessionData.attendees.some(a => a.phone === phone || (student_id && a.student_id === student_id));
          if (exists) {
            return new Response(JSON.stringify({ error: 'مسجل بالفعل' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }

        const newAttendee = {
          id: 'A' + Math.floor(Math.random() * 90000 + 10000),
          student_id, full_name, phone,
          timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
          status: 'present', ip_address, user_agent, device_fingerprint
        };
        sessionData.attendees = sessionData.attendees || [];
        sessionData.attendees.push(newAttendee);
        await db.put(sessionKey, JSON.stringify(sessionData));
        return new Response(JSON.stringify({ success: true, attendance: newAttendee }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // 8. ATTENDANCE SESSION (GET)
    if (path.includes('/attendance/session/')) {
      const parts = path.split('/');
      const sessionId = parts[parts.length - 1];
      const flaskUrl = `${FLASK_BASE}/api/attendance/session/${sessionId}`;
      try {
        const response = await fetch(flaskUrl);
        const data = await response.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        const sessionData = await db.get(`attendance:${sessionId}`, { type: 'json' });
        if (!sessionData) {
          return new Response(JSON.stringify({ error: 'Session not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify(sessionData.attendees || []), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // 9. ATTENDANCE ALL
    if (path === '/api/attendance/all') {
      const flaskUrl = `${FLASK_BASE}/api/attendance/all`;
      try {
        const response = await fetch(flaskUrl);
        const data = await response.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify([]), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // 10. ATTENDANCE STATS
    if (path === '/api/attendance/stats') {
      const flaskUrl = `${FLASK_BASE}/api/attendance/stats`;
      try {
        const response = await fetch(flaskUrl);
        const data = await response.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          total_sessions: 0, total_checkins: 0, unique_students: 0, unique_phones: 0
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response('Not found', { status: 404, headers: corsHeaders });

  } catch (globalError) {
    // 🚨 THIS PREVENTS "FAILED TO FETCH"
    // If the server crashes, it returns the real error to the browser *with* CORS headers.
    return new Response(JSON.stringify({
      success: false,
      error: "API Crash",
      details: globalError.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
