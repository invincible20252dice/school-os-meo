// Loaded only by verification children, never by the deployed application.
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const allowed = value => ["127.0.0.1", "::1", "[::1]", "localhost"].includes(value);
function assertHost(host) {
  if (!allowed(host)) throw new Error("Verification blocked external network access");
}
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const options = Array.isArray(args[0]) ? args[0][0] : args[0];
  const host = typeof options === "object" ? options.host : typeof args[1] === "string" ? args[1] : "localhost";
  if (host) assertHost(host);
  return connect.apply(this, args);
};
for (const transport of [http, https]) {
  for (const method of ["request", "get"]) {
    const original = transport[method];
    transport[method] = function (input, ...rest) {
      const host = typeof input === "string" || input instanceof URL
        ? new URL(input).hostname : input.hostname || input.host || "localhost";
      assertHost(host);
      return original.call(this, input, ...rest);
    };
  }
}
const originalFetch = globalThis.fetch;
globalThis.fetch = function (input, init) {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  assertHost(url.hostname);
  return originalFetch.call(this, input, init);
};
