const { neon } = require('@neondatabase/serverless');

exports.handler = async (event) => {
  const sql = neon(process.env.NETLIFY_DATABASE_URL);

  try {
    // --- GET: Hent all data ---
    if (event.httpMethod === 'GET') {
      const userId = event.queryStringParameters.id;
      if (!userId) return { statusCode: 400, body: 'Missing user ID' };

      // OPTIMALISERING: Kjører spørringene parallelt med Promise.all
      // Dette sparer tid fordi vi slipper å vente på at den første blir ferdig før vi starter den andre.
      const [userResult, checkins] = await Promise.all([
        sql`
          SELECT diet_plan, workout_plan, step_goal, total_weeks, start_date, is_paused, paused_at 
          FROM users 
          WHERE id = ${userId}
        `,
        sql`
          SELECT 
            id, date, weight, sleep, energy, accuracy, 
            strength_sessions as "strengthSessions", 
            cardio_sessions as "cardioSessions", 
            steps_reached as "stepsReached", 
            taken_supplements as "takenSupplements", 
            comment, image_url, images, created_at as timestamp 
          FROM checkins 
          WHERE user_id = ${userId}
        `
      ]);

      const user = userResult[0] || {};
      
      const formattedCheckins = checkins.map(c => {
        let imageList = [];
        if (c.images) {
          try { imageList = JSON.parse(c.images); } catch (e) { console.error("Feil ved parsing av bilder", e); }
        } else if (c.image_url) { imageList = [c.image_url]; }

        return {
          ...c,
          timestamp: new Date(c.timestamp).getTime(),
          images: imageList
        };
      });

      return {
        statusCode: 200,
        body: JSON.stringify({
          dietPlan: user.diet_plan || '',
          workoutPlan: user.workout_plan || '',
          stepGoal: user.step_goal || 10000,
          totalWeeks: user.total_weeks || 12,
          startDate: user.start_date,
          isPaused: user.is_paused || false,
          pausedAt: user.paused_at,
          checkins: formattedCheckins
        })
      };
    }

    // --- POST: Handlinger ---
    if (event.httpMethod === 'POST') {
      const { userId, type, data } = JSON.parse(event.body);

      if (type === 'plan_update') {
        // Enkle oppdateringer
        if (data.dietPlan !== undefined) await sql`UPDATE users SET diet_plan = ${data.dietPlan} WHERE id = ${userId}`;
        if (data.workoutPlan !== undefined) await sql`UPDATE users SET workout_plan = ${data.workoutPlan} WHERE id = ${userId}`;
        if (data.stepGoal !== undefined) await sql`UPDATE users SET step_goal = ${data.stepGoal} WHERE id = ${userId}`;
        if (data.totalWeeks !== undefined) await sql`UPDATE users SET total_weeks = ${data.totalWeeks} WHERE id = ${userId}`;
        
        // Startdato oppdatering
        if (data.startDate !== undefined) {
           await sql`UPDATE users SET start_date = ${data.startDate}, is_paused = false, paused_at = NULL WHERE id = ${userId}`;
        }

        // PAUSE LOGIKK
        if (data.action === 'pause') {
            const now = new Date().toISOString();
            await sql`UPDATE users SET is_paused = true, paused_at = ${now} WHERE id = ${userId}`;
        }
        
        // RESUME LOGIKK (Flytt startdato frem)
        if (data.action === 'resume') {
            // Hent nåværende data for å regne ut diff
            const userRes = await sql`SELECT start_date, paused_at FROM users WHERE id = ${userId}`;
            const u = userRes[0];
            
            if (u && u.paused_at && u.start_date) {
                const pauseStart = new Date(u.paused_at);
                const now = new Date();
                const diffTime = now - pauseStart; // Tid brukt i pause (ms)
                
                // Flytt startdato frem med like mye tid som vi var i pause
                const oldStart = new Date(u.start_date);
                const newStart = new Date(oldStart.getTime() + diffTime).toISOString();
                
                await sql`UPDATE users SET start_date = ${newStart}, is_paused = false, paused_at = NULL WHERE id = ${userId}`;
            } else {
                // Fallback hvis data mangler: bare skru av pause
                await sql`UPDATE users SET is_paused = false WHERE id = ${userId}`;
            }
        }
      } 
      
      else if (type === 'new_checkin') {
        const cardio = data.cardioSessions || 0;
        const imagesJson = JSON.stringify(data.images || []);
        await sql`
          INSERT INTO checkins (
            user_id, date, weight, sleep, energy, accuracy, 
            strength_sessions, cardio_sessions, steps_reached, taken_supplements, comment, images
          )
          VALUES (
            ${userId}, ${data.date}, ${data.weight}, ${data.sleep}, ${data.energy}, 
            ${data.accuracy}, ${data.strengthSessions}, ${cardio}, ${data.stepsReached}, 
            ${data.takenSupplements}, ${data.comment}, ${imagesJson}
          )
        `;
      }
      
      else if (type === 'delete_checkin') {
        await sql`DELETE FROM checkins WHERE id = ${data.checkinId}`;
      }

      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

  } catch (error) {
    console.error('Data error:', error);
    return { statusCode: 500, body: error.message };
  }
};