# URL Shortener API

A production-grade URL shortener built with NestJS, featuring Redis caching, click analytics, rate limiting, and Swagger documentation.

![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=flat&logo=nestjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat&logo=redis&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)

## Features

- **URL Shortening** — Generate short links with nanoid, or set custom aliases
- **Click Analytics** — Track clicks per day, top referrers, device breakdown (mobile/desktop/bot)
- **Redis Caching** — Cache-aside pattern for fast redirects (~0.5ms cache hit vs ~5ms DB query)
- **Rate Limiting** — Per-route throttling (10/min for create, 200/min for redirect)
- **Link Expiration** — Auto-expire links after N minutes
- **Soft Delete** — Preserve analytics data when deleting links
- **Swagger Docs** — Interactive API documentation at `/api/docs`

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | NestJS + TypeScript | Modular architecture, dependency injection |
| Database | PostgreSQL 16 | Persistent storage (URLs + click tracking) |
| ORM | TypeORM | Entity mapping, query builder, migrations |
| Cache | Redis 7 | Cache-aside pattern, rate limit counters |
| Validation | class-validator | DTO-based input validation |
| Docs | @nestjs/swagger | Auto-generated OpenAPI documentation |
| Infra | Docker Compose | One-command dev environment (PG + Redis) |
| CI | GitHub Actions | Lint → Build → Test on every push |

## Quick Start

```bash
# Clone
git clone https://github.com/misu2tdt/url_shorten_backend.git
cd url_shorten_backend

# Install
npm install

# Environment
cp .env.example .env

# Start PostgreSQL + Redis
docker compose up -d

# Run
npm run start:dev

# Open API docs
# http://localhost:3000/api/docs
```

## API Endpoints

| Method | Path | Description | Rate Limit |
|--------|------|-------------|------------|
| `POST` | `/urls/shorten` | Create short URL | 10/min |
| `GET` | `/urls` | List all URLs (paginated) | 100/min |
| `GET` | `/urls/:code/stats` | Click analytics | 100/min |
| `GET` | `/urls/:code` | Redirect to original URL | 200/min |
| `PATCH` | `/urls/:code` | Update URL | 100/min |
| `DELETE` | `/urls/:code` | Soft delete URL | 100/min |

## Architecture
Request flow:
Client
→ ThrottlerGuard (rate limiting)
→ ValidationPipe (DTO validation)
→ Controller (route handling)
→ Service (business logic)
→ Redis (cache check — HIT? return cached)
→ PostgreSQL (cache MISS? query DB, then cache result)
Click tracking:
Redirect response sent immediately (302)
→ trackClick() runs async (fire-and-forget)
→ INSERT into clicks table + atomic increment clickCount

## Engineering Decisions

**Why cache-aside instead of cache-through?**
The app controls cache logic explicitly — check Redis first, fallback to PostgreSQL on miss, then populate cache. This gives fine-grained control over TTL per link (expiring links get shorter cache TTL) and immediate invalidation on update/delete.

**Why fire-and-forget for click tracking?**
Redirect is the critical path — users expect instant response. Analytics INSERT is non-critical. By not awaiting `trackClick()`, the 302 response returns in ~0.5ms (cache hit) instead of ~5ms. If the INSERT fails, we lose one click record — acceptable trade-off for analytics data.

**Why nanoid instead of Math.random()?**
`Math.random()` is not cryptographically secure and has high collision probability due to Birthday Paradox (~50% chance at 7,700 IDs with 6 chars). nanoid uses `crypto.getRandomValues()`, and with 8 chars needs ~2.7 million IDs before 1% collision probability. A retry loop handles the rare collision case.

**Why soft delete?**
Hard delete loses all click analytics data. Setting `isActive = false` preserves the data for reporting while making the link inaccessible. The link can also be restored if needed.

## Project Structure
src/
├── main.ts                          # Bootstrap + Swagger + GlobalFilter
├── app.module.ts                    # ConfigModule, TypeORM, CacheModule, ThrottlerModule
├── common/
│   └── filters/
│       └── http-exception.filter.ts # Consistent error response format
└── urls/
├── urls.module.ts               # Feature module (entities, guard)
├── urls.controller.ts           # 7 routes + Swagger decorators
├── urls.service.ts              # Cache-aside, CRUD, analytics, tracking
├── dto/
│   ├── shorten-url.dto.ts       # Create validation (URL, alias, expiry)
│   └── update-url.dto.ts        # Update validation (partial)
└── entities/
├── url.entity.ts            # URLs table (9 columns)
└── click.entity.ts          # Click tracking table (6 columns)

## Analytics Response Example

```json
GET /urls/my-link/stats

{
  "shortCode": "my-link",
  "originalUrl": "https://example.com",
  "totalClicks": 142,
  "analytics": {
    "clicksPerDay": [
      { "date": "2026-06-01", "count": 45 },
      { "date": "2026-06-02", "count": 67 },
      { "date": "2026-06-03", "count": 30 }
    ],
    "topReferrers": [
      { "referrer": "facebook.com", "count": 58 },
      { "referrer": "Direct", "count": 44 },
      { "referrer": "twitter.com", "count": 25 }
    ],
    "deviceBreakdown": [
      { "device": "mobile", "count": 82 },
      { "device": "desktop", "count": 55 },
      { "device": "bot", "count": 5 }
    ]
  }
}
```