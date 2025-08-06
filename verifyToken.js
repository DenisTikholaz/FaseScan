const { OAuth2Client } = require('google-auth-library');

const WEB_CLIENT_ID = process.env.GOOGLE_WEB_CLIENT_ID;
const client = new OAuth2Client(WEB_CLIENT_ID);

const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization || req.body.token;

  if (!token) {
    return res.status(401).json({ error: 'Token is missing' });
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: WEB_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    req.user = {
      googleId: payload.sub,
      email: payload.email,
      name: payload.name,
    };

  
    if (!payload.email.endsWith('@gmail.com')) {
      return res.status(403).json({ error: 'Only Gmail accounts are allowed.' });
    }

    next(); 
  } catch (error) {
    console.error('❌ Token verification failed:', error);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

module.exports = verifyToken;
