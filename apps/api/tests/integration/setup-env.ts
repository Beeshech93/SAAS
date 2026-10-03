if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to a disposable PostgreSQL database with migrations applied');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.LOG_LEVEL = 'silent';
process.env.RATE_LIMIT_AUTH_MAX = '1000';
process.env.WHATSAPP_VERIFY_TOKEN = 'verify-token-for-tests';
process.env.WHATSAPP_APP_SECRET = 'app-secret-for-tests';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
