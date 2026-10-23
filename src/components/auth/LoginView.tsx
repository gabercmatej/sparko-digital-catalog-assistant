"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode, SVGProps } from "react";
import { LOGIN_MESSAGES, messageForQuery } from "@/lib/auth/messages";
import { LoginBackground } from "./LoginBackground";
import styles from "./LoginView.module.css";

const GENERIC_ERROR = "Prijava trenutno ni mogoča. Poskusite znova čez trenutek.";
const CONFIG_NOTICE = "Prijava trenutno ni na voljo. Skrbnik mora dokončati nastavitev.";
const REGISTER_INFO = "Registracija trenutno ni na voljo. Za dostop se obrnite na skrbnika.";

function Svg({ children, ...rest }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

const UserIcon = () => (
  <Svg>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
  </Svg>
);
const LockIcon = () => (
  <Svg>
    <rect x="4" y="11" width="16" height="10" rx="2.5" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Svg>
);
const EyeIcon = () => (
  <Svg>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);
const EyeOffIcon = () => (
  <Svg>
    <path d="M3 3l18 18" />
    <path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.5 6.5C3.8 8.3 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.4 4.5-1" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </Svg>
);
const ArrowIcon = () => (
  <Svg width="22" height="22" strokeWidth="2.4">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);
const InfoIcon = () => (
  <Svg width="18" height="18">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 7.5v.01" />
  </Svg>
);
const AlertIcon = () => (
  <Svg width="18" height="18">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v6M12 16.5v.01" />
  </Svg>
);

export function LoginView({
  next,
  configError,
  activation,
}: {
  next: string;
  configError: boolean;
  activation?: { ready: boolean };
}) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [registerInfo, setRegisterInfo] = useState(false);
  const idRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // No-JS fallback redirect brings the error in the query string.
    const q = messageForQuery(new URLSearchParams(window.location.search).get("napaka"));
    /* eslint-disable react-hooks/set-state-in-effect -- one-time read of the URL after mount */
    if (q) setError(q);
    /* eslint-enable react-hooks/set-state-in-effect */
    // Autofocus only with a precise pointer (never on phones).
    if (window.matchMedia("(pointer: fine)").matches) idRef.current?.focus();
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password, next }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        redirect?: string;
        error?: string;
      } | null;
      if (res.ok && data?.ok && data.redirect) {
        window.location.replace(data.redirect);
        return; // keep loading state until navigation
      }
      setError(data?.error && [401, 403, 429, 503].includes(res.status) ? data.error : GENERIC_ERROR);
    } catch {
      setError(GENERIC_ERROR);
    }
    setLoading(false);
  }

  return (
    <div className={styles.root}>
      <LoginBackground />
      <main className={styles.column}>
        <div className={styles.hero}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.mascot}
            src="/brand/sparko-mascot.webp"
            alt="Sparko"
            width={375}
            height={360}
          />
        </div>

        <p className={styles.wordmark} aria-hidden="true">
          Sparko
        </p>
        <h1 className={styles.title}>{activation ? "Aktivacija" : "Prijava"}</h1>
        <p className={styles.subtitle}>
          {activation
            ? "Za aktivacijo osebnega dostopa vpišite prejeto uporabniško ime in geslo."
            : "Vpišite podatke za dostop do aplikacije."}
        </p>

        <form className={styles.panel} method="post" action="/api/auth/login" onSubmit={onSubmit}>
          <input type="hidden" name="next" value={next} />

          <label className={styles.label} htmlFor="login-identifier">
            Uporabniško ime ali e-pošta
          </label>
          <div className={styles.field}>
            <span className={styles.lead}>
              <UserIcon />
            </span>
            <input
              ref={idRef}
              id="login-identifier"
              name="identifier"
              type="text"
              className={styles.input}
              placeholder="Vpišite uporabniško ime ali e-pošto"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value);
                setError("");
              }}
            />
          </div>

          <label className={styles.label} htmlFor="login-password">
            Geslo
          </label>
          <div className={styles.field}>
            <span className={styles.lead}>
              <LockIcon />
            </span>
            <input
              id="login-password"
              name="password"
              type={show ? "text" : "password"}
              className={`${styles.input} ${styles.inputTrail}`}
              placeholder="Vpišite geslo"
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
            />
            <button
              type="button"
              className={styles.eye}
              aria-label={show ? "Skrij geslo" : "Pokaži geslo"}
              aria-pressed={show}
              onClick={() => setShow((v) => !v)}
            >
              {show ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>

          {error && (
            <p className={styles.error} role="alert">
              <AlertIcon />
              <span>{error}</span>
            </p>
          )}
          {configError && <p className={styles.notice}>{CONFIG_NOTICE}</p>}
          {activation && !activation.ready && (
            <p className={styles.notice}>{LOGIN_MESSAGES.activation_invalid}</p>
          )}

          <button type="submit" className={styles.submit} disabled={loading} aria-busy={loading}>
            {loading ? (
              <>
                <span className={styles.spinner} aria-hidden="true" />
                {activation ? "Aktiviranje…" : "Prijavljanje…"}
              </>
            ) : (
              <>
                {activation ? "Aktiviraj dostop" : "Prijavi se"}
                <ArrowIcon />
              </>
            )}
          </button>

          {/* Registration is not available yet: the link only explains how to get access. */}
          <p className={styles.register}>
            Še nimate računa?{" "}
            <button
              type="button"
              className={styles.registerLink}
              aria-controls="login-register-info"
              aria-expanded={registerInfo}
              onClick={() => setRegisterInfo(true)}
            >
              Registriraj se
            </button>
          </p>
          <p id="login-register-info" className={styles.registerInfo} role="status">
            {registerInfo && REGISTER_INFO}
          </p>
        </form>

        <p className={styles.footer}>
          <InfoIcon />
          <span>Podatke za prijavo prejmete od skrbnika.</span>
        </p>

        <footer className={styles.legal}>
          <span>Demo je last podjetja Sedem d.o.o.</span>
          <span className={styles.legalStrong} lang="en">
            Strictly confidential
          </span>
        </footer>
      </main>
    </div>
  );
}
