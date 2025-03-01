const socket = io();
socket.on('fileChanged', (data) => {
  document.getElementById('fileContent').innerText = JSON.stringify(data, null, 2);
});