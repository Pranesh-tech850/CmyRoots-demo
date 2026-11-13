import React, { useState, useMemo } from "react";
import {
  Network,
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  Check,
  AlertCircle,
  Users,
  MessageSquare,
} from "lucide-react";

import "../../styles/Auth.css";
import { login, signup } from "./authapi";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .'_-]{1,38}[\p{L}\p{N}.]$/u;

/* 0-4 */
function passwordScore(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 12) s++;
  return s;
}
const STRENGTH = ["Too short", "Weak", "Okay", "Good", "Strong"];

const GENDERS = [
  { value: "F", label: "Female" },
  { value: "M", label: "Male" },
  { value: "", label: "Prefer not to say" },
];

const Field = ({ icon, label, error, children }) => (
  <label className={`auth-field ${error ? "has-error" : ""}`}>
    <span className="auth-label">{label}</span>
    <span className="auth-input-wrap">
      <span className="auth-input-icon">{icon}</span>
      {children}
    </span>
    {error && <span className="auth-field-error">{error}</span>}
  </label>
);

const AuthPage = ({ onAuthenticated }) => {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const isSignup = mode === "signup";

  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [agree, setAgree] = useState(false);

  const [touched, setTouched] = useState({});
  const [serverError, setServerError] = useState("");
  const [busy, setBusy] = useState(false);

  const touch = (k) => setTouched((t) => ({ ...t, [k]: true }));

  const switchMode = (m) => {
    setMode(m);
    setServerError("");
    setTouched({});
    setPassword("");
    setConfirm("");
    setShowPw(false);
  };

  /* field-level problems (shown after the field was touched or on submit) */
  const errors = useMemo(() => {
    const e = {};
    if (isSignup) {
      if (!NAME_RE.test(name.trim().replace(/\s+/g, " "))) e.name = "Use 3-40 letters or numbers";
      if (!EMAIL_RE.test(email.trim())) e.email = "Enter a valid email address";
      if (password.length < 8) e.password = "At least 8 characters";
      else if (!/[A-Za-z]/.test(password) || !/\d/.test(password))
        e.password = "Use at least one letter and one number";
      if (confirm !== password) e.confirm = "Passwords do not match";
      if (!agree) e.agree = "Please accept to continue";
    } else {
      if (!identifier.trim()) e.identifier = "Enter your name or email";
      if (!password) e.password = "Enter your password";
    }
    return e;
  }, [isSignup, name, email, password, confirm, agree, identifier]);

  const show = (k) => (touched[k] ? errors[k] : undefined);
  const score = passwordScore(password);

  const submit = async (ev) => {
    ev.preventDefault();
    if (busy) return;
    setServerError("");

    if (Object.keys(errors).length) {
      setTouched({ identifier: 1, name: 1, email: 1, password: 1, confirm: 1, agree: 1 });
      return;
    }

    setBusy(true);
    try {
      const data = isSignup
  ? await signup({
      username: name.trim().replace(/\s+/g, " "),
      email: email.trim(),
      gender: gender || null,
      password,
      remember,
    })
  : await login(identifier.trim(), password, remember);

onAuthenticated(data.user);
    } catch (err) {
      setServerError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      {/* ---------- brand side ---------- */}
      <aside className="auth-brand">
        <div className="auth-brand-top">
          <div className="auth-logo"><Network size={24} /></div>
          <span>FamilyTree</span>
        </div>

        <div className="auth-brand-body">
          <h1>Keep your family<br />close, wherever<br />they are.</h1>
          <p>
            Build your family tree, share moments and stay in touch,
            all in one private place.
          </p>

          <ul className="auth-points">
            <li><Users size={18} /> Grow a living family tree together</li>
            <li><MessageSquare size={18} /> Chat with relatives, one-to-one or in groups</li>
            <li><Lock size={18} /> Relations only appear after both sides accept</li>
          </ul>
        </div>

        {/* decorative tree */}
        <svg className="auth-deco" viewBox="0 0 320 170" aria-hidden="true">
          <g stroke="rgba(255,255,255,.28)" strokeWidth="1.5" fill="none">
            <path d="M160 40 V70 M160 70 H70 V100 M160 70 H250 V100 M70 100 V122 M70 122 H35 V140 M70 122 H105 V140" />
          </g>
          {[[160, 28], [70, 108], [250, 108], [35, 148], [105, 148]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i === 0 ? 14 : 11} fill="rgba(255,255,255,.14)" stroke="rgba(255,255,255,.55)" strokeWidth="1.5" />
          ))}
        </svg>
      </aside>

      {/* ---------- form side ---------- */}
      <main className="auth-form-side">
        <div className="auth-card">
          <div className="auth-mobile-logo">
            <div className="auth-logo dark"><Network size={22} /></div>
            <span>FamilyTree</span>
          </div>

          <div className="auth-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={!isSignup}
              className={!isSignup ? "active" : ""}
              onClick={() => switchMode("login")}
            >
              Log in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isSignup}
              className={isSignup ? "active" : ""}
              onClick={() => switchMode("signup")}
            >
              Sign up
            </button>
          </div>

          <h2>{isSignup ? "Create your account" : "Welcome back"}</h2>
          <p className="auth-sub">
            {isSignup
              ? "Join your family network in less than a minute."
              : "Log in to see your family tree and messages."}
          </p>

          {serverError && (
            <div className="auth-alert" role="alert">
              <AlertCircle size={18} />
              <span>{serverError}</span>
            </div>
          )}

          <form onSubmit={submit} noValidate>
            {isSignup ? (
              <>
                <Field icon={<User size={18} />} label="Full name" error={show("name")}>
                  <input
                    type="text"
                    autoComplete="name"
                    placeholder="e.g. Priya Nair"
                    value={name}
                    maxLength={40}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => touch("name")}
                  />
                </Field>

                <Field icon={<Mail size={18} />} label="Email" error={show("email")}>
                  <input
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => touch("email")}
                  />
                </Field>

                <div className="auth-field">
                  <span className="auth-label">Gender <em>(used for relation names like Father / Mother)</em></span>
                  <div className="auth-segment">
                    {GENDERS.map((g) => (
                      <button
                        key={g.label}
                        type="button"
                        className={gender === g.value ? "active" : ""}
                        onClick={() => setGender(g.value)}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <Field icon={<User size={18} />} label="Name or email" error={show("identifier")}>
                <input
                  type="text"
                  autoComplete="username"
                  autoFocus
                  placeholder="Your name or email"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  onBlur={() => touch("identifier")}
                />
              </Field>
            )}

            <Field icon={<Lock size={18} />} label="Password" error={show("password")}>
              <input
                type={showPw ? "text" : "password"}
                autoComplete={isSignup ? "new-password" : "current-password"}
                placeholder={isSignup ? "At least 8 characters" : "Your password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => touch("password")}
              />
              <button
                type="button"
                className="auth-eye"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </Field>

            {isSignup && (
              <>
                {password && (
                  <div className="auth-strength" aria-live="polite">
                    <div className="auth-strength-bars">
                      {[1, 2, 3, 4].map((n) => (
                        <i key={n} className={score >= n ? `on s${score}` : ""} />
                      ))}
                    </div>
                    <span>{STRENGTH[score]}</span>
                  </div>
                )}

                <Field icon={<Lock size={18} />} label="Confirm password" error={show("confirm")}>
                  <input
                    type={showPw ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Type the password again"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    onBlur={() => touch("confirm")}
                  />
                  {confirm && confirm === password && (
                    <span className="auth-ok"><Check size={18} /></span>
                  )}
                </Field>
              </>
            )}

            {isSignup ? (
              <label className={`auth-check ${show("agree") ? "has-error" : ""}`}>
                <input
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => { setAgree(e.target.checked); touch("agree"); }}
                />
                <span>
                  I agree that my name and email can be shown to relatives I connect with.
                </span>
              </label>
            ) : (
              <label className="auth-check">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <span>Keep me logged in on this device</span>
              </label>
            )}
            {isSignup && show("agree") && <span className="auth-field-error">{show("agree")}</span>}

            <button type="submit" className="auth-submit" disabled={busy}>
              {busy ? (
                <><Loader2 size={18} className="auth-spin" /> {isSignup ? "Creating account..." : "Logging in..."}</>
              ) : (
                <>{isSignup ? "Create account" : "Log in"} <ArrowRight size={18} /></>
              )}
            </button>
          </form>

          <p className="auth-switch">
            {isSignup ? "Already have an account?" : "New to FamilyTree?"}{" "}
            <button type="button" onClick={() => switchMode(isSignup ? "login" : "signup")}>
              {isSignup ? "Log in" : "Create an account"}
            </button>
          </p>
        </div>
      </main>
    </div>
  );
};

export default AuthPage;