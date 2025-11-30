const { neon } = require('@neondatabase/serverless');

exports.handler = async (event) => {
  // Kun POST er tillatt
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    const { username, password } = JSON.parse(event.body);

    // Hent bruker basert på brukernavn og passord
    // NB: I produksjon bør passord hashes (bcrypt), men dette fungerer for demo.
    const result = await sql`
      SELECT id, username, name, role 
      FROM users 
      WHERE username = ${username} AND password = ${password}
      LIMIT 1
    `;

    if (result.length === 0) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Feil brukernavn eller passord' }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(result[0]),
    };
  } catch (error) {
    console.error('Login error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Serverfeil' }) };
  }
};
