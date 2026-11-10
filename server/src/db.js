import 'dotenv/config';
import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 10,
  // DATE 컬럼(마감일)은 'YYYY-MM-DD' 문자열 그대로 받는다 (시간대 변환으로 날짜가 바뀌는 문제 방지)
  dateStrings: ['DATE'],
});