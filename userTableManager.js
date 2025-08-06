const { tableNameFromEmail, createUserTable } = require('./createUserTable');
const pool = require('./db');

function formatWorkMinutes(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} годин ${minutes} хвилин`;
}
async function handleStatusChange(email, name, google_id, status) {
  const tableName = tableNameFromEmail(email);

  await createUserTable(email);

 if (status === 'active') {
  console.log(`🟢 Logging in user ${email} → table: ${tableName}`);
 await pool.query(
  `INSERT INTO ${tableName} (google_id, email, name, login_time)
   VALUES ($1, $2, $3, date_trunc('minute', CURRENT_TIMESTAMP))`,
  [google_id, email, name]
);

  console.log(`✅ User ${email} login inserted`);
} else if (status === 'offline') {
  const result = await pool.query(
    `SELECT * FROM ${tableName}
     WHERE google_id = $1 AND logout_time IS NULL
     ORDER BY id DESC LIMIT 1`,
    [google_id]
  );

  if (result.rows.length === 0) {
    console.warn('⚠️ No active session found for logout.');
    return;
  }

  const record = result.rows[0];
  const loginDateTime = new Date(record.login_time);
  const logoutDateTime = new Date(); 
  if (isNaN(loginDateTime)) {
    console.error('❌ Invalid login_time:', record.login_time);
    return;
  }

  const diffMs = logoutDateTime - loginDateTime;
  const minutesWorked = Math.floor(diffMs / 60000);
  const earned = minutesWorked*3; // 3 грн per minute
  const formattedWorkTime = formatWorkMinutes(minutesWorked);

  await pool.query(
    `UPDATE ${tableName}
     SET logout_time = date_trunc('minute', CURRENT_TIMESTAMP),
         work_minutes = $1,
         expected_salary = $2,
         formatted_work_time = $3
     WHERE id = $4`,
    [minutesWorked, earned, formattedWorkTime, record.id]
  );

  console.log(`💼 Updated work session → ${formattedWorkTime} = ${earned} грн`);
}
}

module.exports = { handleStatusChange };
