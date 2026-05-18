export class OpenBrainsError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "OpenBrainsError";
    this.code = code;
  }
}

export class ValidationError extends OpenBrainsError {
  public constructor(message: string, options?: ErrorOptions) {
    super("validation_error", message, options);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends OpenBrainsError {
  public constructor(message: string, options?: ErrorOptions) {
    super("not_found", message, options);
    this.name = "NotFoundError";
  }
}

export class TenancyError extends OpenBrainsError {
  public constructor(message: string, options?: ErrorOptions) {
    super("tenancy_error", message, options);
    this.name = "TenancyError";
  }
}

export class TrustGradeError extends OpenBrainsError {
  public constructor(message: string, options?: ErrorOptions) {
    super("trust_grade_error", message, options);
    this.name = "TrustGradeError";
  }
}
