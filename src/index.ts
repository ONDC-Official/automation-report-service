import express, { Request, Response } from 'express';
import reportRouter from './routes/reportRoute';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/generate-report', reportRouter);

app.use((err: any, req: Request, res: Response, next: any) => {
  console.error(err.stack);
  res.status(500).send('Something went wrong!');
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});