import { createAuth } from "./src/lib/auth.js";
// Mock Cloudflare workers for test
import { Module } from "module";
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === "cloudflare:workers") return {};
  return originalRequire.apply(this, arguments);
};
process.env.DATABASE_URL="postgres://...";
process.env.BETTER_AUTH_SECRET="test";
const auth = createAuth();
console.log("API keys:", Object.keys(auth.api));
