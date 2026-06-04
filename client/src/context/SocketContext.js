import { createContext, useContext, useEffect, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "./AuthContext";

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const { token } = useAuth();
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);

  useEffect(() => {
    if (!token) return;

    const s = io(process.env.REACT_APP_SERVER_URL || "http://localhost:5000", {
      auth: { token },
      reconnectionAttempts: 5,
    });

    s.on("connect", () => console.log("Socket connected"));
    s.on("users:online", (users) => setOnlineUsers(users));
    s.on("connect_error", (err) => console.error("Socket error:", err.message));

    setSocket(s);
    return () => s.disconnect();
  }, [token]);

  return (
    <SocketContext.Provider value={{ socket, onlineUsers }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
