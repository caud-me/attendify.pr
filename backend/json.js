const $chokidar = require("chokidar");
const $path = require("path");
const $fs = require("fs");
const { $tryCatch } = require("./shortcuts.js");
const { $io } = require('./server');
const $datapath = $path.join(__dirname, "../data/data.json");

// ----------------------------------------------------------------------------
const $watch_json = () => {
  console.log("[Attendify] Watching data.json...");
  $chokidar.watch($datapath).on("change", () => {
    const data = $read_json();
    $io.emit('fileChanged', data);
  });
};

const $read_json = () => {
  const data = $tryCatch(() => JSON.parse($fs.readFileSync($datapath, "utf8")), {});
  console.log("[Attendify]", data);
  return data;
};

module.exports = { $watch_json };