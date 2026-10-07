// Run schema migrations before accepting traffic in hosted environments.
await import('./migrate.js');
await import('./server.js');
