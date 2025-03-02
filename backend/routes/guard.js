const express = require('express');
const router = express.Router();
const $pool = require('../database.js');
const { $requireRole } = require('../middleware.js');

router.get('/me', $requireRole(['guard']), async (req, res) => {

  const $guard_username = req.session.user.username;

  const [me_fullname] = await $pool.execute(`
      SELECT full_name FROM users WHERE username = ?
  `, [$guard_username]);

  const result = {
      fullname: me_fullname
  };

  res.json(result);
});

module.exports = router;