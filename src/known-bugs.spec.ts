// Known problems that are NOT fixed yet. Each todo becomes a real failing test
// in the PR that fixes it (CLAUDE.md: every bug fix needs a test that fails
// before the fix and passes after). Nothing here asserts the buggy behavior.
describe('Known bugs (not fixed)', () => {
  describe('data model', () => {
    it.todo(
      'KNOWN BUG: a custom alias of 21-30 chars passes the DTO (max 30) but shortCode is varchar(20), so POST /urls/shorten answers 500',
    );
    it.todo(
      'KNOWN BUG: a unique-constraint violation on shortCode (two concurrent requests with the same alias) answers 500 instead of 409',
    );
  });

  describe('originalUrl validation', () => {
    it.todo(
      'KNOWN BUG: originalUrl without a scheme ("google.com") is accepted, so the redirect Location is a relative path',
    );
    it.todo(
      'KNOWN BUG: originalUrl pointing at internal addresses (127.0.0.1, 10.x.x.x, 169.254.169.254, [::1]) is accepted',
    );
    it.todo(
      'KNOWN BUG: originalUrl with userinfo (https://trusted.com@evil.com) is accepted',
    );
  });

  describe('pagination', () => {
    it.todo(
      'KNOWN BUG: GET /urls has no bounds: limit is unlimited, page=0 or a negative page reaches the database as a negative OFFSET (500), limit=0 gives totalPages Infinity',
    );
  });

  describe('cache', () => {
    it.todo(
      'KNOWN BUG: CacheModule ignores the Redis store option (cache-manager v7 only reads `stores`), so the cache is an in-process Map, not Redis',
    );
    it.todo(
      'KNOWN BUG: cache TTLs are passed in seconds but cache-manager v7 expects milliseconds, so entries live about 3.6 s instead of up to 1 h',
    );
  });

  describe('access control', () => {
    it.todo(
      'KNOWN BUG: PATCH /urls/:shortCode has no authentication or authorization; anyone can change where any link points',
    );
    it.todo(
      'KNOWN BUG: DELETE /urls/:shortCode has no authentication or authorization; anyone can delete any link',
    );
    it.todo(
      'KNOWN BUG: GET /urls lists every link (with click counts) to anonymous callers',
    );
  });

  describe('click tracking (found while writing the tests)', () => {
    it.todo(
      'KNOWN BUG: the click IP comes from the client-controlled X-Forwarded-For; a value longer than 45 chars makes the click INSERT fail, so the click is silently lost',
    );
    it.todo(
      'KNOWN BUG: the click INSERT and the clickCount UPDATE are not in one transaction, so clickCount can drift from the clicks table',
    );
  });
});
