import 'dotenv/config';
import express, { Request, Response } from 'express';
import { authenticateAgent } from './agentAuth.js';

const app = express();
app.use(express.json());

interface TokenRequestBody {
  scopes?: string;
}

// POST /auth/token
// Runs the full 3-step agent authentication flow and returns an access token.
app.post('/auth/token', async (req: Request<{}, {}, TokenRequestBody>, res: Response) => {
  try {
    const result = await authenticateAgent(req.body.scopes);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const port = process.env.PORT ?? 3001;
app.listen(port, () => {
  console.log(`Agent auth server listening on http://localhost:${port}`);
});
