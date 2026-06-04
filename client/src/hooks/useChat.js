import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';

export function useChat(roomId) {
  const { socket } = useSocket();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    if (!socket || !roomId) return;

    socket.emit('room:join', roomId);

    const onHistory = (msgs) => setMessages(msgs);
    const onNew = (msg) => setMessages((prev) => [...prev, msg]);
    const onUpdated = (msg) =>
      setMessages((prev) => prev.map((m) => (m._id === msg._id ? msg : m)));
    const onTyping = ({ userId, username, isTyping }) => {
      if (userId === user._id) return;
      setTypingUsers((prev) =>
        isTyping
          ? prev.includes(username) ? prev : [...prev, username]
          : prev.filter((u) => u !== username)
      );
    };

    socket.on('messages:history', onHistory);
    socket.on('message:new', onNew);
    socket.on('message:updated', onUpdated);
    socket.on('typing:update', onTyping);

    return () => {
      socket.emit('room:leave', roomId);
      socket.off('messages:history', onHistory);
      socket.off('message:new', onNew);
      socket.off('message:updated', onUpdated);
      socket.off('typing:update', onTyping);
      setMessages([]);
      setTypingUsers([]);
    };
  }, [socket, roomId, user._id]);

  const sendMessage = useCallback((content) => {
    if (!socket || !content.trim()) return;
    socket.emit('message:send', { roomId, content });
  }, [socket, roomId]);

  const sendTyping = useCallback(() => {
    if (!socket) return;
    socket.emit('typing:start', { roomId });
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing:stop', { roomId });
    }, 2000);
  }, [socket, roomId]);

  const reactToMessage = useCallback((messageId, emoji) => {
    if (!socket) return;
    socket.emit('message:react', { messageId, emoji });
  }, [socket]);

  return { messages, typingUsers, sendMessage, sendTyping, reactToMessage };
}
