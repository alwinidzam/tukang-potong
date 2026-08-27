import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import apiRouter from '../server/routes.js';
import { db } from '../server/db.js';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.SESSION_SECRET));

// Initialize Cloud Firestore Sync
db.initFirestoreSync().catch(err => {
  console.warn('[Firestore Boot Warn]:', err);
});

// API Router
app.use('/api', apiRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

export default app;
