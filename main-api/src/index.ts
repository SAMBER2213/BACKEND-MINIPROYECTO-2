import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import routes
import healthRouter from './routes/health';
import usersRouter from './routes/users';
import roomsRouter from './routes/rooms';

// Import middleware
import { errorHandler, notFound } from './middleware/errorHandler';

// Import swagger config
import { swaggerSpec } from './config/swagger';

const app = express();
const PORT = process.env.PORT ?? 3001;

// ─── Security & Parsing ───────────────────────────────────────────
app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Logging ─────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ─── CORS ─────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL ?? 'http://localhost:5173',
  'https://frontend-miniproyecto-2.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., mobile apps, curl)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: Origen no permitido: ${origin}`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ─── API Documentation (Swagger) ──────────────────────────────────
app.use(
  '/api/docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'StudySync API Docs',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
      persistAuthorization: true,
    },
  })
);

// Expose swagger.json for tools like Postman
app.get('/api/docs.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// ─── Routes ───────────────────────────────────────────────────────
app.use('/api/health', healthRouter);
app.use('/api/users', usersRouter);
app.use('/api/rooms', roomsRouter);

// ─── Error Handling ───────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 StudySync Main API corriendo en http://localhost:${PORT}`);
  console.log(`📚 Swagger docs: http://localhost:${PORT}/api/docs`);
  console.log(`🌍 Entorno: ${process.env.NODE_ENV ?? 'development'}\n`);
});

export default app;
