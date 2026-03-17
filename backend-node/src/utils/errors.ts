export class AppError extends Error {
    statusCode: number;

    constructor(message: string, statusCode = 400) {
      super(message);
      this.name = "AppError";
      this.statusCode = statusCode;
    }
  }
  
  export class ValidationError extends AppError {
    constructor(message: string) {
      super(message, 400);
      this.name = "ValidationError";
    }
  }
  
  export class NotFoundError extends AppError {
    constructor(message: string) {
      super(message, 404);
      this.name = "NotFoundError";
    }
  }
  