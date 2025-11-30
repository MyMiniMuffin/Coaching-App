const { neon } = require('@neondatabase/serverless');

exports.handler = async (event) => {
  const sql = neon(process.env.DATABASE_URL);

  try {
    // GET: Hent all data for en bruker
    if (event.httpMethod === 'GET') {
      const userId = event.queryStringParameters.id;
      
      if (!userId) return { statusCode: 400, body: 'Missing user ID' };

      // Hent brukerinfo (planer, mål)
      const userResult = await sql`SELECT diet_plan, workout_plan, step_goal FROM users WHERE id = ${userId}`;
      const user = userResult[0] || {};

      // Hent innsjekker
      const checkins = await sql`
        SELECT 
          id, date, weight, sleep, energy, accuracy, 
          strength_sessions as "strengthSessions", 
          steps_reached as "stepsReached", 
          taken_supplements as "takenSupplements", 
          comment, image_url as image, created_at as timestamp 
        FROM checkins 
        WHERE user_id = ${userId}
      `;
      
      // Formater timestamp til tall (for sortering i frontend)
      const formattedCheckins = checkins.map(c => ({
        ...c,
        timestamp: new Date(c.timestamp).getTime()
      }));

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

    // POST: Lagre data (Oppdater plan ELLER ny innsjekk)
    if (event.httpMethod === 'POST') {
      const { userId, type, data } = JSON.parse(event.body);

      if (type === 'plan_update') {
        // Oppdater planer eller mål
        if (data.dietPlan !== undefined) await sql`UPDATE users SET diet_plan = ${data.dietPlan} WHERE id = ${userId}`;
        if (data.workoutPlan !== undefined) await sql`UPDATE users SET workout_plan = ${data.workoutPlan} WHERE id = ${userId}`;
        if (data.stepGoal !== undefined) await sql`UPDATE users SET step_goal = ${data.stepGoal} WHERE id = ${userId}`;
      } 
      else if (type === 'new_checkin') {
        // Lagre ny innsjekk
        await sql`
          INSERT INTO checkins (
            user_id, date, weight, sleep, energy, accuracy, 
            strength_sessions, steps_reached, taken_supplements, comment, image_url
          )
          VALUES (
            ${userId}, ${data.date}, ${data.weight}, ${data.sleep}, ${data.energy}, 
            ${data.accuracy}, ${data.strengthSessions}, ${data.stepsReached}, 
            ${data.takenSupplements}, ${data.comment}, ${data.image}
          )
        `;
      }

      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

  } catch (error) {
    console.error('Data error:', error);
    return { statusCode: 500, body: error.message };
  }
};
