const { betterAuth } = require("better-auth");
const auth = betterAuth({ database: { provider: "postgres", url: "" } });
console.log(Object.keys(auth.api));
