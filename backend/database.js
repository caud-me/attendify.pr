const $mysql = require('mysql2/promise');

const $pool = $mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'Jamesros092607',
  database: 'attendify5',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

console.log('Attendify database is ready');

module.exports = $pool;