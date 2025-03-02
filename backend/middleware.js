const $session = require('express-session');

function $requireRole(roles) {
  return (req, res, next) => {
    if (roles.includes(req.session.user.role)) {
      return next();
    } else {
      return res.status(403).json({ message: 'Forbidden' });
    }
  };
}

module.exports = { $requireRole };