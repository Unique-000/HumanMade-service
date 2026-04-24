# HumanMade API Routes

## Base URL
`/api`

---

## Core

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api` | Health check - Verifies API is working |

---

## Users (`/api/users`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/users/register` | Creates a new user with 16-character login |
| GET | `/api/users/login` | Checks if user account exists |

---

## Images (`/api/images`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/images/:code` | Retrieves photo URL, metadata, and location based on 6-character code |
| POST | `/api/images/upload` | Uploads JPEG image to storage and saves metadata (location, timestamp) to database |
| POST | `/api/images/check` | Checks if photo exists by SHA256 hash or finds visually similar images via perceptual hash |

---

## Rate Limiting
- **Window**: 15 minutes
- **Limit**: 100 requests per IP per window
