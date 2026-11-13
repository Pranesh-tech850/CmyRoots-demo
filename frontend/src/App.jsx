
import React, { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";

import Dashboard from "./components/Dashboard";
import AuthPage from "./components/auth/AuthPage";
import { checkSession, logout } from "./components/auth/authapi";

function App() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);

  // Read the relationship request token from the email link.
  const requestToken = new URLSearchParams(
    window.location.search
  ).get("token");

  // Restore the logged-in user using the HttpOnly cookie.
  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      try {
        const res = await checkSession();

        if (cancelled) return;

        if (res.status === "success" && res.user) {
          setSession({ user: res.user });
        } else {
          setSession(null);
        }
      } catch (err) {
        console.error("Could not restore session:", err);
        if (!cancelled) setSession(null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  // Login or signup succeeded.
  const handleAuthenticated = useCallback((user) => {
    setSession({ user });
  }, []);

  // Logout from the backend and clear React state.
const handleLogout = useCallback(async () => {
  try {
    await logout();
    setSession(null);
  } catch (err) {
    console.error("Logout request failed:", err);
    alert("Unable to log out. Please try again.");
  }
}, []);

  if (checking) {
    return (
      <div className="auth-splash">
        <div>
          <Loader2 size={20} className="auth-spin" />
          Loading your family...
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <AuthPage onAuthenticated={handleAuthenticated} />
    );
  }

  return (
    <Dashboard
      session={session}
      onLogout={handleLogout}
      requestToken={requestToken}
    />
  );
}

export default App;