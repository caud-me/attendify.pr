const $path = require('path');

const $resolvePath = (filePath) => $path.join(__dirname, filePath);
const $tryCatch = (fn, fallback) => { try { return fn(); } catch (error) { console.error(error.message); return fallback; }};

const $generatePassword = (length) => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let password = "";
  for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * charset.length);
      password += charset[randomIndex];
  }
  return password;
}

const $toUsername = (fullName) => {
  return fullName
      .replace(/[^a-zA-Z\s]/g, '') // regex!!!
      .trim()
      .split(/\s+/) // regex-mini
      .map(name => name.toLowerCase())
      .join('.');
}

module.exports = { $tryCatch, $resolvePath, $generatePassword, $toUsername };