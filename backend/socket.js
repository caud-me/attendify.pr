const $io = require('socket.io');

module.exports = (httpServer) => {
  const io = $io(httpServer);

  io.on('connection', (socket) => {
    console.log('A user connected');
    socket.on('disconnect', () => {
      console.log('User disconnected');
    });
  });

  return io;
};