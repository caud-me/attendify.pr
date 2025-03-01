const $session = require('express-session');
const path = require('path'); // Add path module import

const $requireRole = (roles) => (req, res, next) => {
  if (!req.session.user || !roles.includes(req.session.user.role)) {
    console.error('[Attendify] Unauthorized access attempt');
    return res.status(403).sendFile(path.join(__dirname, '../frontend/403.html'));
  }
  next();
};

const sessionMiddleware = $session({
  secret: 'nzlnc3KCM34vs4bVEtChpfnq34f43jFWndh9opXMC8f9wenfp49CKLCnfk24XMr38r4',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 }
});

module.exports = { $requireRole, sessionMiddleware };