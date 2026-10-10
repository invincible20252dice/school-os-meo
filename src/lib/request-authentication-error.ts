/** Authentication failure only; never contains provider messages or tokens. */
export class RequestAuthenticationError extends Error {
  constructor() {
    super("UNAUTHENTICATED");
    this.name = "RequestAuthenticationError";
  }
}
