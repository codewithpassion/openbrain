import { OpenBrainsError } from "@openbrains/shared";

export class NotSignedInError extends OpenBrainsError {
  public constructor(message = "not signed in — run `ob login`") {
    super("not_signed_in", message);
    this.name = "NotSignedInError";
  }
}

export class UnexpectedServerResponseError extends OpenBrainsError {
  public constructor(message: string, options?: ErrorOptions) {
    super("unexpected_server_response", message, options);
    this.name = "UnexpectedServerResponseError";
  }
}

export class NetworkError extends OpenBrainsError {
  public constructor(message: string, options?: ErrorOptions) {
    super("network_error", message, options);
    this.name = "NetworkError";
  }
}
