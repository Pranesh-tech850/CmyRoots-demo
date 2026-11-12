import React, { useState, useCallback } from "react";
import Dashboard from "./components/Dashboard";
import Login from "./components/Login";

const KEY = "cmyroots_session";

function App() {
  const [session, setSession] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY));
    } catch {
      return null;
    }
  });

  // s = { token, user: { name, email, gender, avatar } }, as returned by the server
  const handleLogin = (s) => {
    localStorage.setItem(KEY, JSON.stringify(s));
    setSession(s);
  };

  // useCallback matters: Dashboard has onLogout in its socket effect deps,
  // so a new function on every render would reconnect the socket every time.
  const handleLogout = useCallback(() => {
    localStorage.removeItem(KEY);
    setSession(null);
  }, []);

  if (!session?.user) return <Login onLogin={handleLogin} />;

  return <Dashboard session={session} onLogout={handleLogout} />;
}

export default App;