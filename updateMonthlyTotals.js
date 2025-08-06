const { tableNameFromEmail } = require('./createUserTable');
const pool = require('./db');

async function updateMonthlyTotals() {
  try {
    const { rows: users } = await pool.query('SELECT google_id, email FROM users');

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    for (const user of users) {
      const tableName = tableNameFromEmail(user.email);
      
      const query = `
        SELECT
          COALESCE(SUM(expected_salary), 0) AS total_salary,
          COALESCE(SUM(work_minutes), 0) AS total_minutes
        FROM ${tableName}
        WHERE login_time >= $1 AND login_time < $2
      `;

      const values = [monthStart.toISOString(), monthEnd.toISOString()];
      const result = await pool.query(query, values);
      const { total_salary, total_minutes } = result.rows[0];

      await pool.query(
        `UPDATE users
         SET total_salary_current_month = $1,
             total_minutes_current_month = $2
         WHERE google_id = $3`,
        [total_salary, total_minutes, user.google_id]
      );

      console.log(`🔄 Updated ${user.email} → salary: ${total_salary}, minutes: ${total_minutes}`);
    }

    // Якщо сьогодні 2 число — видаляємо записи за попередній місяць
    if (now.getDate() === 2) {
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);

      for (const user of users) {
        const tableName = tableNameFromEmail(user.email);

        await pool.query(
          `DELETE FROM ${tableName}
           WHERE login_time >= $1 AND login_time < $2`,
          [prevMonthStart.toISOString(), prevMonthEnd.toISOString()]
        );

        console.log(`🗑️ Deleted records for ${user.email} from ${prevMonthStart.toISOString()} to ${prevMonthEnd.toISOString()}`);
      }
    }

    console.log('✅ Monthly totals updated for all users.');
  } catch (err) {
    console.error('❌ Error updating monthly totals:', err);
  }
}

module.exports = { updateMonthlyTotals };