# Salon AI Receptionist

White-label AI receptionist SaaS for nail salons.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase
- Twilio Voice/SMS
- OpenAI Realtime API
- Separate voice websocket server later

## Project Structure

```txt
salon-ai-receptionist/
├── apps/
│   ├── web/
│   └── voice-server/
├── supabase/
│   ├── schema.sql
│   ├── seed.sql
│   └── policies.sql
├── README.md
└── package.json
```

## Current Status

This is the initial clean project structure. Twilio, Supabase integration, OpenAI Realtime API, and the separate voice websocket server are intentionally not implemented yet.

## Development

```bash
cd salon-ai-receptionist
npm run dev:web
```
