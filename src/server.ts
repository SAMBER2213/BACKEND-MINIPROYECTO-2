import 'dotenv/config';
import cors from 'cors';
import express, { Request, Response, NextFunction } from 'express';
import router from './routes';

const app = express();
const port = Number(process.env.PORT || 8000);

app.use(cors());
app.use(express.json());
app.use('/api', router);

app.use((_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(port, () => {
  console.log(`API Planificador funcionando en el puerto ${port}`);
});
