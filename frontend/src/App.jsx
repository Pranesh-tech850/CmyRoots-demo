import React, { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";

import Dashboard from "./components/Dashboard";
import AuthPage from "./components/auth/AuthPage";
import InvitePage from "./components/auth/InvitePage";
import { checkSession, logout } from "./components/auth/authapi";
import { notifyError } from "./components/alerts";

function App() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);

  // Relationship request token from the email link (?token=...).
  const [requestToken, setRequestToken] = useState(() =>
    new URLSearchParams(window.location.search).get("token")
  );

  // Logged-out visitors with a token answer the request first (no login needed).
  const [inviteHandled, setInviteHandled] = useState(false);

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
    return () => { cancelled = true; };
  }, []);

  const handleAuthenticated = useCallback((user) => {
    setSession({ user });
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
      setSession(null);
    } catch (err) {
      console.error("Logout request failed:", err);
      notifyError("Unable to log out. Please try again.", "Logout failed");
    }
  }, []);

  // Called when the logged-out person finished (or postponed) the invitation.
  const handleInviteFinished = useCallback(({ answered }) => {
    if (answered) {
      // answered or invalid -> remove the token from the address bar
      const url = new URL(window.location.href);
      url.searchParams.delete("token");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
      setRequestToken(null);
    }
    // "Decide later" keeps the token, so it is offered again after login.
    setInviteHandled(true);
  }, []);

  // The logged-in person answered (or the link was bad): forget the token for good.
  const handleInviteDone = useCallback(() => {
    setRequestToken(null);
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
    if (requestToken && !inviteHandled) {
      return <InvitePage token={requestToken} onFinished={handleInviteFinished} />;
    }
    return (
      <AuthPage onAuthenticated={handleAuthenticated} inviteToken={requestToken} fromInvite={inviteHandled} />
    );
  }

  return (
    <Dashboard session={session} onLogout={handleLogout} requestToken={requestToken} onInviteDone={handleInviteDone} />
  );
}

export default App;