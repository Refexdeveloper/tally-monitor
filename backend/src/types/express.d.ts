import type { IntegrationAgent } from '../models/infrastructure';
import type { AuthContext } from '../services/auth/authContext';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: AuthContext;
      /** Set by authenticateAgent for Bridge Agent endpoints. */
      agent?: IntegrationAgent;
      validatedQuery?: Record<string, unknown>;
    }
  }
}

export {};
