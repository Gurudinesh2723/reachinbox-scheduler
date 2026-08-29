process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://reachinbox:reachinbox@localhost:5432/reachinbox_test';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.ELASTICSEARCH_URL = process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200';
process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? 'test-session-secret-value-1234567890';
