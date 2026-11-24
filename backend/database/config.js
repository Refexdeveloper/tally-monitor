require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env'), quiet: true });

function required(name) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable ${name} (see backend/.env.example)`);
  }
  return value;
}

function connection() {
  const base = {
    dialect: 'mysql',
    database: required('DB_NAME'),
    username: required('DB_USER'),
    password: process.env.DB_PASSWORD ?? '',
    timezone: '+00:00',
    logging: false,
    migrationStorageTableName: 'sequelize_meta',
    // Seeders are idempotent and intentionally re-runnable, so they are not tracked.
    seederStorage: 'none',
    define: { charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' },
    dialectOptions: { charset: 'utf8mb4' },
  };
  if (process.env.DB_SOCKET_PATH) {
    base.dialectOptions.socketPath = process.env.DB_SOCKET_PATH;
  } else {
    base.host = process.env.DB_HOST ?? '127.0.0.1';
    base.port = Number(process.env.DB_PORT ?? 3306);
  }
  if (process.env.DB_SSL === 'true') {
    base.dialectOptions.ssl = { rejectUnauthorized: true };
  }
  return base;
}

module.exports = {
  development: connection(),
  test: connection(),
  production: connection(),
};
