# ✦ Nexus Chat — MERN + Socket.io

A full-stack real-time chat application built with MongoDB, Express, React, Node.js, and Socket.io.

## Features
- JWT authentication (register/login)
- Multiple chat rooms (create/join)
- Real-time messaging with Socket.io
- Live typing indicators
- Online user presence
- Mobile responsive UI

## Project Structure
```
chat-app/
├── server/          # Express + Socket.io backend
│   ├── models/      # Mongoose schemas (User, Room, Message)
│   ├── routes/      # REST API routes
│   ├── middleware/  # JWT auth middleware
│   └── index.js     # Server entry point
└── client/          # React frontend
    └── src/
        ├── context/ # Auth + Socket context
        ├── pages/   # AuthPage, ChatPage
        └── components/
```

## Setup & Run

### 1. Prerequisites
- Node.js 18+
- MongoDB running locally (or provide a MongoDB Atlas URI)

### 2. Server Setup
```bash
cd server
npm install
cp .env.example .env
# Edit .env with your MongoDB URI and JWT secret (JWT_SECRET is required when NODE_ENV=production)
npm run dev
```

### 3. Client Setup
```bash
cd client
npm install
npm start
```

### 4. Environment Variables (server/.env)
```
PORT=5000
MONGO_URI=mongodb://localhost:27017/chatapp
JWT_SECRET=your_super_secret_key
CLIENT_URL=http://localhost:3000
```

## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/register | Create account |
| POST | /api/auth/login | Login |
| GET | /api/auth/me | Current user |
| GET | /api/rooms | List rooms |
| POST | /api/rooms | Create room |
| POST | /api/rooms/:id/join | Join a room |
| GET | /api/messages/:roomId | Get room messages |

## Socket Events
| Event | Direction | Payload |
|-------|-----------|---------|
| room:join | client→server | roomId |
| room:leave | client→server | roomId |
| message:send | client→server | { roomId, content } |
| message:receive | server→client | Message object |
| typing:start | client→server | { roomId } |
| typing:stop | client→server | { roomId } |
| typing:update | server→client | { userId, username, isTyping } |
| users:online | server→client | [userId, ...] |
| error:message | server→client | { message } |
| call:start / call:accept / call:reject / call:cancel / call:end | client→server | { roomId, to? } |
| webrtc:offer / webrtc:answer / webrtc:ice | both | { roomId, to, offer \| answer \| candidate } |
