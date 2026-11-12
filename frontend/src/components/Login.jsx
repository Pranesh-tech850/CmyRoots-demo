import React, { useState } from "react";
import { SOCKET_URL } from "./constant";

/* Log in or sign up. On success calls onLogin({ token, user }). */
const Login = ({ onLogin }) => {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [identifier, setIdentifier] = useState(""); // login: name or email
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const isLogin = mode === "login";
      const res = await fetch(
        `${SOCKET_URL}/api/auth/${isLogin ? "login" : "signup"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isLogin
              ? { identifier, password }
              : { username, email, gender: gender || null, password }
          ),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }
      onLogin({ token: data.token, user: data.user });
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(false);
    }
  };

  const s = {
    page: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f6f6f4", fontFamily: "Arial, sans-serif" },
    card: { background: "#fff", width: 360, maxWidth: "92vw", padding: 28, borderRadius: 14, boxShadow: "0 4px 24px rgba(0,0,0,.08)" },
    input: { width: "100%", boxSizing: "border-box", padding: 11, margin: "6px 0 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 15 },
    btn: { width: "100%", padding: 12, border: 0, borderRadius: 8, background: "#111", color: "#fff", fontSize: 15, cursor: "pointer" },
    link: { background: "none", border: 0, color: "#2563eb", cursor: "pointer", fontSize: 14 },
    err: { color: "#b91c1c", fontSize: 14, margin: "0 0 12px" },
  };

  return (
    <div style={s.page}>
      <form style={s.card} onSubmit={submit}>
        <h2 style={{ marginTop: 0 }}>
          {mode === "login" ? "Log in to CmyRoots" : "Create your account"}
        </h2>

        {mode === "login" ? (
          <>
            <label>Name or email</label>
            <input style={s.input} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoFocus />
          </>
        ) : (
          <>
            <label>Name</label>
            <input style={s.input} value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
            <label>Email</label>
            <input style={s.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <label>Gender (optional)</label>
            <select style={s.input} value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">Prefer not to say</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
          </>
        )}

        <label>Password</label>
        <input style={s.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {mode === "signup" && (
          <p style={{ fontSize: 12, color: "#6b7280", marginTop: -6 }}>
            At least 8 characters, with a letter and a number.
          </p>
        )}

        {error && <p style={s.err}>{error}</p>}

        <button style={s.btn} disabled={busy}>
          {busy ? "Please wait…" : mode === "login" ? "Log in" : "Sign up"}
        </button>

        <p style={{ textAlign: "center", marginBottom: 0 }}>
          {mode === "login" ? "New here? " : "Already have an account? "}
          <button
            type="button"
            style={s.link}
            onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
          >
            {mode === "login" ? "Create an account" : "Log in"}
          </button>
        </p>
      </form>
    </div>
  );
};

export default Login;