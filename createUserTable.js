const pool = require('./db');

function tableNameFromEmail(email) {
  return 'user_' + email.replace(/[@.]/g, '_');
}

async function createUserTable(email) {
  const tableName = tableNameFromEmail(email);
  console.log(`📥 createUserTable: ${email} → table: ${tableName}`);
  const query = `
   CREATE TABLE IF NOT EXISTS ${tableName} (
  id SERIAL PRIMARY KEY,
  google_id VARCHAR(255),
  email VARCHAR(255),
  name VARCHAR(255),
  login_time TIMESTAMP,
  logout_time TIMESTAMP,
  work_minutes INTEGER DEFAULT 0,
  expected_salary NUMERIC DEFAULT 0,
  formatted_work_time VARCHAR(50)
);
  `;
  await pool.query(query);
  console.log(`✅ Table created or already exists: ${tableName}`);
  return tableName;
}

module.exports = { createUserTable, tableNameFromEmail };
