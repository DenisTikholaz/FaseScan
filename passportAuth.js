require('dotenv').config();
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const pool = require('./db');

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  const res = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  done(null, res.rows[0]);
});
const { insertLoginRecord } = require('./userTableManager');
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_WEB_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: '/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  const { id, displayName, emails } = profile;
  const email = emails[0].value;

  try {
    let user = await pool.query('SELECT * FROM users WHERE google_id = $1', [id]);
    if (user.rows.length === 0) {
      const newUser = await pool.query(
        'INSERT INTO users (google_id, name, email) VALUES ($1, $2, $3) RETURNING *',
        [id, displayName, email]
      );
      await insertLoginRecord(email, displayName, 'active');
      return done(null, newUser.rows[0]);
    } else {
       await insertLoginRecord(email, displayName, 'active');
      return done(null, user.rows[0]);
    }
  } catch (err) {
    return done(err, null);
  }
}));
