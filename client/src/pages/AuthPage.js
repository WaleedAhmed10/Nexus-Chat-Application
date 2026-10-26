import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import "./AuthPage.css";

export default function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      if (mode === "login") await login(form.email, form.password);
      else await register(form.username, form.email, form.password);
    } catch (err) {
      setError(err.response?.data?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-bg">
        <div className="auth-grid" />
        <div className="auth-glow" />
      </div>
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">✦ NEXUS</div>
          <p className="auth-sub">Real-time chat, reimagined</p>
        </div>
        <div className="auth-tabs">
          {["login","register"].map(m => (
            <button key={m} className={`auth-tab ${mode===m?"active":""}`} onClick={() => { setMode(m); setError(""); }}>
              {m === "login" ? "Sign In" : "Create Account"}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="auth-form">
          {mode === "register" && (
            <div className="field">
              <label>Username</label>
              <input name="username" value={form.username} onChange={handle} placeholder="cooluser" required />
            </div>
          )}
          <div className="field">
            <label>Email</label>
            <input name="email" type="email" value={form.email} onChange={handle} placeholder="you@example.com" required />
          </div>
          <div className="field">
            <label>Password</label>
            <input name="password" type="password" value={form.password} onChange={handle} placeholder="••••••••" required minLength={6} />
          </div>
          {error && <div className="auth-error">{error}</div>}
          <button className="auth-btn" disabled={loading}>
            {loading ? "..." : mode === "login" ? "Enter Nexus →" : "Join Nexus →"}
          </button>
        </form>
      </div>
    </div>
  );
}
