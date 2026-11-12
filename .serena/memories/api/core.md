# API module

- Entry: apps/api/src/index.ts. It loads validated config then starts a Fastify server from buildServer.
- config.ts validates NODE_ENV, TRACE_CAPTCHA_HOST, TRACE_CAPTCHA_PORT, TRACE_CAPTCHA_LOG_LEVEL with Zod.
- server.ts owns body limit, redacted logging, error translation, /health/live, /health/ready, and /v1. Feature routes are not implemented yet.
- ApiError is the stable domain error type for safe client error responses.
- Never log Authorization, X-TraceCAPTCHA-Secret-Key, or verificationToken values.