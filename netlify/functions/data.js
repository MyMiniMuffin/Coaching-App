const { neon } = require('@neondatabase/serverless');

exports.handler = async (event) => {
  const sql = neon(process.env.NETLIFY_DATABASE_URL);

  try {
    // --- GET: Hent all data ---
    if (event.httpMethod === 'GET') {
      const userId = event.queryStringParameters.id;
      if (!userId) return { statusCode: 400, body: 'Missing user ID' };

      const userResult = await sql`SELECT diet_plan, workout_plan, step_goal FROM users WHERE id = ${userId}`;
      const user = userResult[0] || {};

      // Hent både gammel (image_url) og ny (images) kolonne
      const checkins = await sql`
        SELECT 
          id, date, weight, sleep, energy, accuracy, 
          strength_sessions as "strengthSessions", 
          cardio_sessions as "cardioSessions", 
          steps_reached as "stepsReached", 
          taken_supplements as "takenSupplements", 
          comment, image_url, images, created_at as timestamp 
        FROM checkins 
        WHERE user_id = ${userId}
      `;
      
      const formattedCheckins = checkins.map(c => {
        // Logikk for å håndtere både nye og gamle bilder
        let imageList = [];
        if (c.images) {
          try {
            // Prøv å lese den nye listen
            imageList = JSON.parse(c.images);
          } catch (e) {
            console.error("Feil ved parsing av bilder", e);
          }
        } else if (c.image_url) {
          // Fallback til gammelt system hvis nytt er tomt
          imageList = [c.image_url];
        }

        return {
          ...c,
          timestamp: new Date(c.timestamp).getTime(),
          images: imageList // Send alltid en liste (array) til frontend
        };
      });

      return {
        statusCode: 200,
        body: JSON.stringify({
          dietPlan: user.diet_plan || '',
          workoutPlan: user.workout_plan || '',
          stepGoal: user.step_goal || 10000,
          checkins: formattedCheckins
        })
      };
    }

    // --- POST: Handlinger ---
    if (event.httpMethod === 'POST') {
      const { userId, type, data } = JSON.parse(event.body);

      if (type === 'plan_update') {
        if (data.dietPlan !== undefined) await sql`UPDATE users SET diet_plan = ${data.dietPlan} WHERE id = ${userId}`;
        if (data.workoutPlan !== undefined) await sql`UPDATE users SET workout_plan = ${data.workoutPlan} WHERE id = ${userId}`;
        if (data.stepGoal !== undefined) await sql`UPDATE users SET step_goal = ${data.stepGoal} WHERE id = ${userId}`;
      } 
      
      else if (type === 'new_checkin') {
        const cardio = data.cardioSessions || 0;
        // Konverter bilde-listen til tekst for lagring
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