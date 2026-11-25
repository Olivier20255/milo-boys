import 'dotenv/config';
import express from 'express';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import dashboardRoutes from './src/server/routes/dashboard.ts';
import studentRoutes from './src/server/routes/students.ts';
import academicRoutes from './src/server/routes/academics.ts';
import examRoutes from './src/server/routes/examinations.ts';
import financeRoutes from './src/server/routes/finance.ts';
import {
  adminRouter,
  attendanceRouter,
  commsRouter,
  staffRouter,
  timetableRouter,
} from './src/server/routes/operations.ts';

const app = express();
const PORT = 3000;

app.set('trust proxy', 1);
app.use(express.json({ limit: '4mb' }));

// Origin protection on state-changing API routes
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.headers.origin;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    if (origin && host) {
      try {
        const originHost = new URL(origin).host;
        if (originHost !== host && !originHost.includes('localhost')) {
          return res.status(403).json({ error: 'Origin mismatch rejected.' });
        }
      } catch {
        return res.status(403).json({ error: 'Invalid request origin.' });
      }
    }
  }
  next();
});

// Rate limiting on API routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 800,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment before retrying.' },
});
app.use('/api', apiLimiter);

// Serve uploaded student photos & staff documents safely
const uploadsDir = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// Health endpoint (non-DB check)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'MILO BOYS SMIS' });
});

// Mount domain API routers
app.use('/api', dashboardRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/academics', academicRoutes);
app.use('/api/examinations', examRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/attendance', attendanceRouter);
app.use('/api/staff', staffRouter);
app.use('/api/timetable', timetableRouter);
app.use('/api/communication', commsRouter);
app.use('/api/admin', adminRouter);

// Global error sanitizer
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled API error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'An unexpected server error occurred.',
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MILO BOYS SMIS server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
