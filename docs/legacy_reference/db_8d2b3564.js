// Load the project-root environment before reading any DB_* values. This also
// makes migration scripts and diagnostics behave the same as `npm start`.
require('./config/load-env');
const mysql = require('mysql2/promise');

let pool;
function databaseConfig() {
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'nexus_ai',
    waitForConnections: true,
    connectionLimit: Math.max(1, Math.min(20, Number(process.env.DB_CONNECTION_LIMIT || 5))),
    queueLimit: 0,
    charset: 'utf8mb4',
    timezone: 'Z',
    connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS || 8000),
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
  };
}
function getPool() {
  if (!pool) pool = mysql.createPool(databaseConfig());
  return pool;
}
async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}
async function pingDatabase() {
  const rows = await query('SELECT 1 AS ok');
  return rows[0]?.ok === 1;
}
async function closeDatabase() {
  if (pool) {
    const current = pool;
    pool = undefined;
    await current.end();
  }
}
module.exports = { getPool, query, pingDatabase, closeDatabase, databaseConfig };
