// Runs before every e2e spec file (jest `setupFiles`). Defaults only: a value
// already present in the environment (CI, shell) always wins, and the guard in
// test-app.ts still refuses any database whose name does not end with "_test".
process.env.DB_DATABASE ??= 'url_shortener_test';
process.env.APP_URL ??= 'http://localhost:3000';
