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

// Track online users: userId -> socketId
const onlineUsers = new Map();

io.on("connection", (socket) => {
  const userId = socket.user.id;
  const username = socket.user.username;

  onlineUsers.set(userId, socket.id);
  io.emit("users:online", Array.from(onlineUsers.keys()));
  console.log(`✅ ${username} connected (${socket.id})`);

  // Join a room
  socket.on("room:join", (roomId) => {
    socket.join(roomId);
    socket.emit("room:joined", roomId);
  });

  // Leave a room
  socket.on("room:leave", (roomId) => {
    socket.leave(roomId);
  });

  // Send message
  socket.on("message:send", async ({ roomId, content }) => {
    try {
      const message = await Message.create({
        room: roomId,
        sender: userId,
        content,
      });
      await message.populate("sender", "username avatar");

      io.to(roomId).emit("message:receive", message);
    } catch (err) {
      socket.emit("error", { message: "Failed to send message" });
    }
  });

  // Typing indicators
  socket.on("typing:start", ({ roomId }) => {
    socket.to(roomId).emit("typing:update", { userId, username, isTyping: true });
  });
  socket.on("typing:stop", ({ roomId }) => {
    socket.to(roomId).emit("typing:update", { userId, username, isTyping: false });
  });

  // ─── WebRTC Call Signaling ───────────────────────────────────────

  // Initiate a call to a room
  socket.on("call:start", ({ roomId, callType }) => {
    socket.to(roomId).emit("call:incoming", {
      callerId: userId,
      callerName: username,
      roomId,
      callType, // "video" | "audio"
    });
  });

  // Caller cancels before answer
  socket.on("call:cancel", ({ roomId }) => {
    socket.to(roomId).emit("call:cancelled", { callerId: userId });
  });

  // Callee accepts
  socket.on("call:accept", ({ roomId }) => {
    socket.to(roomId).emit("call:accepted", { calleeId: userId, calleeName: username });
  });

  // Callee rejects
  socket.on("call:reject", ({ roomId }) => {
    socket.to(roomId).emit("call:rejected", { calleeId: userId });
  });

  // End call
  socket.on("call:end", ({ roomId }) => {
    socket.to(roomId).emit("call:ended", { by: userId });
  });

  // WebRTC offer (caller → callee)
  socket.on("webrtc:offer", ({ roomId, offer }) => {
    socket.to(roomId).emit("webrtc:offer", { offer, from: userId });
  });

  // WebRTC answer (callee → caller)
  socket.on("webrtc:answer", ({ roomId, answer }) => {
    socket.to(roomId).emit("webrtc:answer", { answer, from: userId });
  });

  // ICE candidates (both directions)
  socket.on("webrtc:ice", ({ roomId, candidate }) => {
    socket.to(roomId).emit("webrtc:ice", { candidate, from: userId });
  });

  // Disconnect
  socket.on("disconnect", () => {
    onlineUsers.delete(userId);
    io.emit("users:online", Array.from(onlineUsers.keys()));
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
