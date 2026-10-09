import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { apiRuntimePromise } from "./runtime.js";

const app: Express = express();

app.use((request: Request, response: Response, next: NextFunction): void => {
  void apiRuntimePromise.then(
    ({ app: api }) => { api(request, response, next); },
    (error: unknown) => { next(error); }
  );
});

export default app;
