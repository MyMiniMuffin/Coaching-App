const { neon } = require('@neondatabase/serverless');

exports.handler = async (event) => {
  // Vi tillater kun POST-forespørsler (sende data inn)
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // Koble til databasen
    const sql = neon(process.env.DATABASE_URL);
    
    // Hent dataene appen sendte
    const { username, password } = JSON.parse(event.body);

    // Spør databasen: Finnes denne brukeren?
    const result = await sql`
      SELECT id, username, name, role 
      FROM users 
      WHERE username = ${username} AND password = ${password}
      LIMIT 1
    `;

    // Hvis ingen treff (tom liste), er innlogging feil
    if (result.length === 0) {
      return { 
        statusCode: 401, 
        body: JSON.stringify({ error: 'Feil brukernavn eller passord' }) 
      };
    }

    // Hvis treff, send brukerinfo tilbake
    return {
      statusCode: 200,
      body: JSON.stringify(result[0]),
    };

  } catch (error) {
    console.error('Login error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Serverfeil under innlogging' }) };
  }
};
