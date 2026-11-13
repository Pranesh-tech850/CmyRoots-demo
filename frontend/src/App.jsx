import React, { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";

import Dashboard from "./components/Dashboard";
import AuthPage from "./components/auth/AuthPage";
import {
  loadSession,
  saveSession,
  clearSession,
  SESSION_KEY,
} from "./components/auth/session";
import { checkSession } from "./components/auth/authapi";

function App() {
  const [session, setSession] = useState(loadSession);
  /* when a saved login exists, confirm with the server that it is still valid */
  const [checking, setChecking] = useState(() => Boolean(loadSession()));

  useEffect(() => {
    const saved = loadSession();
    if (!saved) return;

    let cancelled = false;
    checkSession(saved.token).then((res) => {
      if (cancelled) return;
      if (res.status === "invalid") {
        clearSession();
        setSession(null);
      }
      /* "offline": keep the saved login, the dashboard will reconnect later */
      setChecking(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  /* Same browser, several tabs: when another tab logs in or out (and this tab uses
     the remembered login), follow it, so one browser always shows ONE user.
     A different browser has its own storage, so it can be another user. */
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== SESSION_KEY && e.key !== null) return;
      if (sessionStorage.getItem(SESSION_KEY)) return; // this tab has its own "no remember" login
      const latest = loadSession();
      setSession((current) =>
        current?.token === latest?.token ? current : latest
      );
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const handleAuthenticated = useCallback((newSession, remember) => {
    saveSession(newSession, remember);
    setSession(newSession);
  }, []);

  const handleLogout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  if (checking) {

    return (
      <div className="auth-splash">
        <div>
          <Loader2 size={20} className="auth-spin" /> Loading your family...
        </div>
      </div>
    );
  }

  if (!session) return <AuthPage onAuthenticated={handleAuthenticated} />;

  return <Dashboard session={session} onLogout={handleLogout} />;
}

export default App;