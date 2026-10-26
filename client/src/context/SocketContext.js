import { createContext, useContext, useEffect, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "./AuthContext";

const SocketContext = createContext({ socket: null, onlineUsers: [] });

export const SocketProvider = ({ children }) => {
  const { token, logout } = useAuth();
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);

  useEffect(() => {
    if (!token) return;

    // No reconnectionAttempts cap: the default (retry forever) keeps the chat
    // alive after a long network drop instead of dying after 5 tries.
    const s = io(process.env.REACT_APP_SERVER_URL || "http://localhost:5000", {
      auth: { token },
    });

    s.on("connect", () => console.log("Socket connected"));
    s.on("users:online", (users) => setOnlineUsers(users));
    s.on("error:message", (e) => console.error("Server:", e.message));
    s.on("connect_error", (err) => {
      console.error("Socket error:", err.message);
      // The server rejected our token – stop retrying and sign out.
      if (["Invalid token", "No token", "User not found"].includes(err.message)) {
        s.disconnect();
        logout();
      }
    });

    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
      setOnlineUsers([]);
    };
  }, [token, logout]);

  return (
    <SocketContext.Provider value={{ socket, onlineUsers }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
