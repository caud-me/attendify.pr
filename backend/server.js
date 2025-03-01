const $express = require("express");
const $path = require("path");
const $http = require('http');
const $app = $express();
const $port = 3000;

const { sessionMiddleware } = require("./middleware.js");
const setupRoutes = require("./routes.js");
const setupSocket = require("./socket.js");
const $pool = require("./database.js");

const $httpServer = $http.createServer($app);
const $io = setupSocket($httpServer);

$app.use($express.static($path.join(__dirname, "../frontend")));
$app.use($express.json());
$app.use($express.urlencoded({ extended: true }));
$app.use(sessionMiddleware);

setupRoutes($app, $pool);

const $startServer = () => {
  $httpServer.listen($port, () => {
    console.log(`Server is running on http://localhost:${$port}`);
  });
};

module.exports = { $startServer, $io };
