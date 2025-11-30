const { neon } = require('@neondatabase/serverless');

exports.handler = async (event) => {
  const sql = neon(process.env.DATABASE_URL);
  
  try {
    // HENTE BRUKERE (GET)
    if (event.httpMethod === 'GET') {
      const users = await sql`SELECT id, username, name, role FROM users`;
      return { statusCode: 200, body: JSON.stringify(users) };
    }

    // LAGE NY BRUKER (POST)
    if (event.httpMethod === 'POST') {
      const { name, username, password, role } = JSON.parse(event.body);
      
      // Legg til i databasen
      await sql`
        INSERT INTO users (name, username, password, role)
        VALUES (${name}, ${username}, ${password}, ${role || 'athlete'})
      `;
      
      // Hent den nye listen over alle brukere og send tilbake
      const allUsers = await sql`SELECT id, username, name, role FROM users`;
      return { statusCode: 200, body: JSON.stringify(allUsers) };
    }

    // SLETTE BRUKER (DELETE)
    if (event.httpMethod === 'DELETE') {
      const { id } = JSON.parse(event.body);
      
      // Vi må slette brukerens innsjekker først (pga database-regler)
      await sql`DELETE FROM checkins WHERE user_id = ${id}`;
      // Deretter sletter vi brukeren
      await sql`DELETE FROM users WHERE id = ${id}`;
      
      const allUsers = await sql`SELECT id, username, name, role FROM users`;
      return { statusCode: 200, body: JSON.stringify(allUsers) };
    }

  } catch (error) {
    console.error('Users error:', error);
    return { statusCode: 500, body: error.message };
  }
};
