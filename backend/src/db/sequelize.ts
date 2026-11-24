import { Sequelize } from 'sequelize';
import { env } from '../config/env';
import { logger } from '../config/logger';

export const sequelize = new Sequelize(env.DB_NAME, env.DB_USER, env.DB_PASSWORD, {
  dialect: 'mysql',
  host: env.DB_SOCKET_PATH ? undefined : env.DB_HOST,
  port: env.DB_SOCKET_PATH ? undefined : env.DB_PORT,
  timezone: '+00:00',
  logging: env.LOG_LEVEL === 'debug' ? (sql) => logger.debug(sql) : false,
  pool: { max: env.DB_POOL_MAX, min: 0, acquire: 20000, idle: 10000 },
  dialectOptions: {
    charset: 'utf8mb4',
    ...(env.DB_SOCKET_PATH ? { socketPath: env.DB_SOCKET_PATH } : {}),
    ...(env.DB_SSL ? { ssl: { rejectUnauthorized: true } } : {}),
    decimalNumbers: false,
  },
  define: {
    underscored: true,
    timestamps: true,
    charset: 'utf8mb4',
    collate: 'utf8mb4_0900_ai_ci',
  },
});
