import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import useWebRTC from "../hooks/useWebRTC";
import CallUI from "../components/CallUI";
import "./ChatPage.css";

const getAvatar = (username) =>
  `https://api.dicebear.com/7.x/initials/svg?seed=${username}&backgroundColor=7c3aed&textColor=ffffff`;

export default function ChatPage() {
  const { user, logout } = useAuth();
  const { socket, onlineUsers } = useSocket();
  const [rooms, setRooms] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [typingUsers, setTypingUsers] = useState([]);
  const [newRoom, setNewRoom] = useState("");
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const bottomRef = useRef(null);
  const typingTimer = useRef(null);

  const {
    callState, callType, incomingCall,
    isMuted, isCamOff,
    localVideoRef, remoteVideoRef,
    startCall, acceptCall, rejectCall, endCall,
    toggleMute, toggleCamera,
  } = useWebRTC({ socket, roomId: activeRoom?._id, currentUser: user });

  useEffect(() => {
    axios.get("/api/rooms").then(({ data }) => setRooms(data));
  }, []);

  useEffect(() => {
    if (!socket || !activeRoom) return;
    socket.emit("room:join", activeRoom._id);
    axios.get(`/api/messages/${activeRoom._id}`).then(({ data }) => setMessages(data));

    const onMessage = (msg) => setMessages((prev) => [...prev, msg]);
    const onTyping = ({ username, isTyping }) => {
      setTypingUsers((prev) =>
        isTyping ? [...new Set([...prev, username])] : prev.filter((u) => u !== username)
      );
    };

    socket.on("message:receive", onMessage);
    socket.on("typing:update", onTyping);

    return () => {
      socket.off("message:receive", onMessage);
      socket.off("typing:update", onTyping);
      socket.emit("room:leave", activeRoom._id);
      setTypingUsers([]);
    };
  }, [socket, activeRoom]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (!input.trim() || !socket || !activeRoom) return;
    socket.emit("message:send", { roomId: activeRoom._id, content: input.trim() });
    socket.emit("typing:stop", { roomId: activeRoom._id });
    setInput("");
  };

  const handleTyping = (e) => {
    setInput(e.target.value);
    if (!socket || !activeRoom) return;
    socket.emit("typing:start", { roomId: activeRoom._id });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket.emit("typing:stop", { roomId: activeRoom._id });
    }, 1500);
  };

  const createRoom = async (e) => {
    e.preventDefault();
    if (!newRoom.trim()) return;
    const { data } = await axios.post("/api/rooms", { name: newRoom.trim() });
    setRooms((prev) => [...prev, data]);
    setNewRoom("");
    setShowNewRoom(false);
    setActiveRoom(data);
  };

  const joinRoom = async (room) => {
    await axios.post(`/api/rooms/${room._id}/join`);
    setActiveRoom(room);
    setSidebarOpen(false);
  };

  const isOnline = (uid) => onlineUsers.includes(String(uid));
  const formatTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="chat-app">
      {/* ── WebRTC Call UI overlay ─────────────── */}
      <CallUI
        callState={callState}
        callType={callType}
        incomingCall={incomingCall}
        isMuted={isMuted}
        isCamOff={isCamOff}
        localVideoRef={localVideoRef}
        remoteVideoRef={remoteVideoRef}
        onAccept={acceptCall}
        onReject={rejectCall}
        onEnd={endCall}
        onToggleMute={toggleMute}
        onToggleCamera={toggleCamera}
        roomName={activeRoom?.name || ""}
      />

      {/* ── Sidebar ───────────────────────────── */}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <span className="brand">✦ NEXUS</span>
          <button className="icon-btn" onClick={logout} title="Logout">⎋</button>
        </div>

        <div className="user-info">
          <img src={getAvatar(user.username)} alt="" className="avatar sm" />
          <div>
            <div className="username">{user.username}</div>
            <div className="status-dot online-text">● online</div>
          </div>
        </div>

        <div className="section-label">
          Rooms
          <button className="icon-btn sm" onClick={() => setShowNewRoom(!showNewRoom)}>+</button>
        </div>

        {showNewRoom && (
          <form onSubmit={createRoom} className="new-room-form">
            <input value={newRoom} onChange={(e) => setNewRoom(e.target.value)} placeholder="Room name..." autoFocus />
            <button type="submit">Create</button>
          </form>
        )}

        <div className="room-list">
          {rooms.map((r) => (
            <button
              key={r._id}
              className={`room-item ${activeRoom?._id === r._id ? "active" : ""}`}
              onClick={() => joinRoom(r)}
            >
              <span className="room-hash">#</span>
              <span>{r.name}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* ── Main ──────────────────────────────── */}
      <main className="chat-main">
        {activeRoom ? (
          <>
            <header className="chat-header">
              <button className="icon-btn mobile-menu" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
              <div className="room-info">
                <span className="room-hash lg">#</span>
                <h2>{activeRoom.name}</h2>
              </div>

              {/* Call buttons */}
              <div className="header-actions">
                <button
                  className="call-trigger-btn audio"
                  onClick={() => startCall("audio")}
                  disabled={callState !== "idle"}
                  title="Voice call"
                >
                  🎙️
                </button>
                <button
                  className="call-trigger-btn video"
                  onClick={() => startCall("video")}
                  disabled={callState !== "idle"}
                  title="Video call"
                >
                  📹
                </button>
                <div className="online-count">{onlineUsers.length} online</div>
              </div>
            </header>

            <div className="messages">
              {messages.length === 0 && (
                <div className="empty-state">
                  <div className="empty-icon">💬</div>
                  <p>No messages yet. Say hello!</p>
                </div>
              )}
              {messages.map((msg, i) => {
                const isMine = msg.sender._id === user._id || msg.sender === user._id;
                const senderName = msg.sender.username || "Unknown";
                const showAvatar = i === 0 || messages[i - 1].sender._id !== msg.sender._id;
                return (
                  <div key={msg._id || i} className={`msg ${isMine ? "mine" : ""}`}>
                    {!isMine && showAvatar && (
                      <img src={getAvatar(senderName)} alt="" className="avatar sm" />
                    )}
                    {!isMine && !showAvatar && <div className="avatar-spacer" />}
                    <div className="msg-body">
                      {!isMine && showAvatar && (
                        <div className="msg-meta">
                          <span className="msg-username">{senderName}</span>
                          <span className={`dot ${isOnline(msg.sender._id) ? "on" : "off"}`} />
                        </div>
                      )}
                      <div className="bubble">
                        {msg.content}
                        <span className="msg-time">{formatTime(msg.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {typingUsers.length > 0 && (
                <div className="typing-indicator">
                  <span>{typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing</span>
                  <div className="dots"><span/><span/><span/></div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <form className="chat-input-bar" onSubmit={sendMessage}>
              <input
                value={input}
                onChange={handleTyping}
                placeholder={`Message #${activeRoom.name}...`}
              />
              <button type="submit" disabled={!input.trim()}>↑</button>
            </form>
          </>
        ) : (
          <div className="no-room">
            <button className="icon-btn mobile-menu" onClick={() => setSidebarOpen(true)}>☰</button>
            <div className="no-room-content">
              <div className="no-room-icon">✦</div>
              <h2>Welcome to Nexus</h2>
              <p>Select or create a room to start chatting</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
