import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Sidebar from './Sidebar';
import ChatRoom from './ChatRoom';
import styles from './ChatLayout.module.css';
import { useAuth } from '../context/AuthContext';

export default function ChatLayout() {
  const { user } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      const res = await axios.get('/api/rooms');
      setRooms(res.data);
      if (res.data.length === 0) {
        // Seed default rooms for first-time setup
        await axios.post('/api/rooms/seed');
        const res2 = await axios.get('/api/rooms');
        setRooms(res2.data);
      }
    } catch (err) {
      console.error('Failed to fetch rooms', err);
    }
  };

  const createRoom = async (name, description, icon) => {
    try {
      const res = await axios.post('/api/rooms', { name, description, icon });
      setRooms((prev) => [res.data, ...prev]);
      setActiveRoom(res.data);
      setShowCreate(false);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className={styles.layout}>
      <Sidebar
        rooms={rooms}
        activeRoom={activeRoom}
        setActiveRoom={setActiveRoom}
        onCreateRoom={() => setShowCreate(true)}
      />
      <main className={styles.main}>
        {activeRoom ? (
          <ChatRoom room={activeRoom} />
        ) : (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>💬</span>
            <h2>Welcome, {user.avatar} {user.username}</h2>
            <p>Pick a room from the sidebar to start chatting.</p>
          </div>
        )}
      </main>

      {showCreate && (
        <CreateRoomModal onClose={() => setShowCreate(false)} onCreate={createRoom} />
      )}
    </div>
  );
}

function CreateRoomModal({ onClose, onCreate }) {
  const [form, setForm] = useState({ name: '', description: '', icon: '💬' });
  const icons = ['💬', '🎮', '💻', '🎵', '🎲', '🔥', '🌍', '📚', '🎯', '🚀', '⚡', '🌙'];

  const submit = (e) => {
    e.preventDefault();
    if (form.name.trim()) onCreate(form.name, form.description, form.icon);
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3>Create a Room</h3>
        <form onSubmit={submit}>
          <div className={styles.iconPicker}>
            {icons.map((ic) => (
              <button
                key={ic}
                type="button"
                className={`${styles.iconBtn} ${form.icon === ic ? styles.iconSelected : ''}`}
                onClick={() => setForm({ ...form, icon: ic })}
              >{ic}</button>
            ))}
          </div>
          <input
            placeholder="Room name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <input
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className={styles.modalActions}>
            <button type="button" className={styles.cancel} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.create}>Create</button>
          </div>
        </form>
      </div>
    </div>
  );
}
