export {};

declare global {
  namespace Express {
    interface User {
      id: number;
      role: string;
      businessId?: number;
    }

    interface Request {
      user?: User;
    }
  }
}
