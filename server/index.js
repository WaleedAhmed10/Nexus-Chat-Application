const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const messageRoutes = require("./routes/messages");
const roomRoutes = require("./routes/rooms");
const { verifySocketToken } = require("./middleware/auth");
const Message = require("./models/Message");
const { canAccessRoom } = require("./utils/roomAccess");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:3000", credentials: true }));
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/rooms", roomRoutes);

app.get("/", (req, res) => res.json({ status: "Chat API running" }));

// Socket.io middleware
io.use(verifySocketToken);

// Track online users: userId -> Set of socketIds (a user may have several tabs/devices)
const onlineUsers = new Map();

const broadcastOnline = () => io.emit("users:online", Array.from(onlineUsers.keys()));

// A socket may only signal/type in rooms it has successfully joined
const inRoom = (socket, roomId) => typeof roomId === "string" && socket.rooms.has(roomId);

io.on("connection", (socket) => {
  const userId = socket.user.id;
  const username = socket.user.username;

  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
  onlineUsers.get(userId).add(socket.id);
  broadcastOnline();
  console.log(`✅ ${username} connected (${socket.id})`);

  // Join a room (only if public or the user is a member)
  socket.on("room:join", async (roomId) => {
    try {
      if (!(await canAccessRoom(roomId, userId))) {
        return socket.emit("error:message", { message: "No access to this room" });
      }
      socket.join(roomId);
      socket.emit("room:joined", roomId);
    } catch (err) {
      console.error(err);
    }
  });

  // Leave a room
  socket.on("room:leave", (roomId) => {
    if (typeof roomId !== "string") return;
    if (socket.rooms.has(roomId)) {
      socket.to(roomId).emit("typing:update", { userId, username, isTyping: false });
    }
    socket.leave(roomId);
  });

  // Send message
  socket.on("message:send", async ({ roomId, content } = {}) => {
    try {
      if (!inRoom(socket, roomId)) {
        return socket.emit("error:message", { message: "Join the room before sending messages" });
      }
      if (typeof content !== "string" || !content.trim()) return;
      if (content.trim().length > 2000) {
        return socket.emit("error:message", { message: "Message is too long (max 2000 characters)" });
      }

      const message = await Message.create({
        room: roomId,
        sender: userId,
        content,
      });
      await message.populate("sender", "username avatar");

      io.to(roomId).emit("message:receive", message);
    } catch (err) {
      console.error(err);
      socket.emit("error:message", { message: "Failed to send message" });
    }
  });

  // Typing indicators
  socket.on("typing:start", ({ roomId } = {}) => {
    if (!inRoom(socket, roomId)) return;
    socket.to(roomId).emit("typing:update", { userId, username, isTyping: true });
  });
  socket.on("typing:stop", ({ roomId } = {}) => {
    if (!inRoom(socket, roomId)) return;
    socket.to(roomId).emit("typing:update", { userId, username, isTyping: false });
  });

  // ─── WebRTC Call Signaling ───────────────────────────────────────
  // Every signaling message is relayed only to sockets inside a room this
  // socket has joined, and carries an optional `to` user id so the clients
  // can ignore messages that are meant for somebody else.

  const relay = (event, outEvent, build) =>
    socket.on(event, (payload = {}) => {
      if (!inRoom(socket, payload.roomId)) return;
      socket.to(payload.roomId).emit(outEvent, build(payload));
    });

  // Initiate a call to a room
  relay("call:start", "call:incoming", (p) => ({
    callerId: userId,
    callerName: username,
    roomId: p.roomId,
    callType: p.callType === "audio" ? "audio" : "video",
  }));

  // Caller cancels before answer
  relay("call:cancel", "call:cancelled", () => ({ callerId: userId }));

  // Callee accepts
  relay("call:accept", "call:accepted", (p) => ({ calleeId: userId, calleeName: username, to: p.to }));

  // Callee rejects
  relay("call:reject", "call:rejected", (p) => ({ calleeId: userId, to: p.to }));

  // End call
  relay("call:end", "call:ended", () => ({ by: userId }));

  // WebRTC offer (caller → callee)
  relay("webrtc:offer", "webrtc:offer", (p) => ({ offer: p.offer, from: userId, to: p.to }));

  // WebRTC answer (callee → caller)
  relay("webrtc:answer", "webrtc:answer", (p) => ({ answer: p.answer, from: userId, to: p.to }));

  // ICE candidates (both directions)
  relay("webrtc:ice", "webrtc:ice", (p) => ({ candidate: p.candidate, from: userId, to: p.to }));

  // Clear this user's typing indicator in every room when the socket drops
  socket.on("disconnecting", () => {
    for (const roomId of socket.rooms) {
      if (roomId === socket.id) continue;
      socket.to(roomId).emit("typing:update", { userId, username, isTyping: false });
    }
  });

  // Disconnect – user stays online while any other socket of theirs is open
  socket.on("disconnect", () => {
    const sockets = onlineUsers.get(userId);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) onlineUsers.delete(userId);
    }
    broadcastOnline();
    console.log(`❌ ${username} disconnected`);
  });
});

// DB + Server
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/chatapp";

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });
