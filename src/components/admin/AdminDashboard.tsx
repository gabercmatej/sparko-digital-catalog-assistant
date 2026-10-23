"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import styles from "./AdminDashboard.module.css";

type AdminAccount = {
  id: string;
  username: string;
  role: "reviewer" | "admin";
  status: "active" | "revoked";
  activatedAt: number | null;
  activationPending: boolean;
  activationIssuedAt: number | null;
  devices: { slot: number; boundAt: number }[];
  maxDevices: number;
  stats: { visits: number; pageViews: number; lastSeen: number | null };
};
type Overview = { accounts: AdminAccount[]; totals: { visits: number; activatedReviewers: number } };
type Secret = { kind: "link" | "password"; label: string; value: string };

const dateFormat = new Intl.DateTimeFormat("sl-SI", { timeZone: "Europe/Ljubljana", dateStyle: "medium", timeStyle: "short" });
const fmt = (ms: number | null | undefined) => (typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? dateFormat.format(new Date(ms)) : "—");

function statusOf(a: AdminAccount): { text: string; tone: "ok" | "wait" | "off" } {
  if (a.status === "revoked") return { text: "Preklican", tone: "off" };
  if (a.role === "admin" || a.activatedAt !== null) return { text: "Aktiviran", tone: "ok" };
  if (a.activationPending) return { text: "Čaka na aktivacijo", tone: "wait" };
  return { text: "Ni aktiviran", tone: "off" };
}

export function AdminDashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [secret, setSecret] = useState<Secret | null>(null);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [visits, setVisits] = useState<Record<string, number[] | "error" | "loading">>({});
  const openRef = useRef<string | null>(null);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const toLogin = () => window.location.replace("/prijava");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/accounts", { cache: "no-store" });
      if (res.status === 401 || res.status === 403) return toLogin();
      if (!res.ok) throw new Error("load");
      setData((await res.json()) as Overview);
      setLoadError(null);
    } catch {
      setLoadError("Podatkov ni bilo mogoče naložiti.");
    }
  }, []);

  const loadVisits = useCallback(async (id: string) => {
    setVisits((v) => ({ ...v, [id]: "loading" }));
    try {
      const res = await fetch(`/api/admin/accounts/${encodeURIComponent(id)}/visits`, { cache: "no-store" });
      if (!res.ok) throw new Error("visits");
      const body = (await res.json()) as { visits: number[] };
      setVisits((v) => ({ ...v, [id]: body.visits }));
    } catch {
      setVisits((v) => ({ ...v, [id]: "error" }));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial client-side data fetch
    void load();
  }, [load]);

  const toggleVisits = (id: string) => {
    if (open === id) return setOpen(null);
    setOpen(id);
    void loadVisits(id);
  };

  const refresh = async () => {
    setSecret(null);
    setMessage("");
    await load();
    if (openRef.current) await loadVisits(openRef.current);
  };

  const act = async (a: AdminAccount, action: string, opts: { ok: string; confirmText?: string; secretLabel?: string }) => {
    if (opts.confirmText && !window.confirm(opts.confirmText)) return;
    setSecret(null);
    setCopied(false);
    setMessage("");
    setBusy(`${a.id}:${action}`);
    try {
      const res = await fetch(`/api/admin/accounts/${encodeURIComponent(a.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.status === 401) return toLogin();
      const body = (await res.json().catch(() => ({}))) as { error?: string; activationUrl?: string; password?: string; signedOut?: boolean };
      if (!res.ok) {
        setMessage(body.error ?? "Dejanja ni bilo mogoče izvesti.");
        return;
      }
      if (body.activationUrl) setSecret({ kind: "link", label: opts.secretLabel ?? "Aktivacijska povezava", value: body.activationUrl });
      if (body.password) setSecret({ kind: "password", label: opts.secretLabel ?? "Novo geslo", value: body.password });
      setMessage(body.signedOut ? `${opts.ok} Vaša seja bo potekla, prijavite se z novim geslom.` : opts.ok);
      await load();
      if (openRef.current === a.id) await loadVisits(a.id);
    } catch {
      setMessage("Dejanja ni bilo mogoče izvesti.");
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret.value);
      setCopied(true);
    } catch {
      setMessage("Kopiranje ni uspelo. Besedilo označite in kopirajte ročno.");
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      toLogin();
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Skrbništvo dostopa</h1>
          <p className={styles.subtitle}>Pregledovalci, aktivacije, brskalniki in obiski.</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.btn} onClick={refresh}>
            Osveži
          </button>
          <button type="button" className={styles.btn} onClick={logout}>
            Odjava
          </button>
        </div>
      </header>

      <div className={styles.summary}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{data ? data.totals.visits : "—"}</span>
          <span className={styles.statLabel}>Skupaj obiskov</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{data ? data.totals.activatedReviewers : "—"}</span>
          <span className={styles.statLabel}>Aktiviranih pregledovalcev</span>
        </div>
      </div>

      <div role="status" aria-live="polite" className={styles.live}>
        {message}
      </div>

      {secret && (
        <section className={styles.secret} aria-label="Enkratna skrivnost">
          <strong>{secret.label}</strong>
          <code className={styles.secretValue}>{secret.value}</code>
          <p className={styles.warn}>Prikazano samo enkrat. Pošljite ga osebno pregledovalcu.</p>
          <div className={styles.row}>
            <button type="button" className={styles.btnPrimary} onClick={copy}>
              {copied ? "Kopirano" : "Kopiraj"}
            </button>
            <button type="button" className={styles.btn} onClick={() => setSecret(null)}>
              Skrij
            </button>
          </div>
        </section>
      )}

      {loadError && <p className={styles.error}>{loadError}</p>}
      {!data && !loadError && <p className={styles.muted}>Nalaganje …</p>}

      {data && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Uporabnik</th>
                <th scope="col">Vloga</th>
                <th scope="col">Status</th>
                <th scope="col">Prva aktivacija</th>
                <th scope="col">Brskalnik</th>
                <th scope="col">Obiski</th>
                <th scope="col">Ogledi strani</th>
                <th scope="col">Zadnji obisk</th>
              </tr>
            </thead>
            {data.accounts.map((a) => {
              const st = statusOf(a);
              const reviewer = a.role === "reviewer";
              const list = visits[a.id];
              return (
                <tbody key={a.id} data-account={a.username}>
                  <tr>
                    <th scope="row" className={styles.name}>
                      {a.username}
                    </th>
                    <td>{reviewer ? "Pregledovalec" : "Skrbnik"}</td>
                    <td>
                      <span className={`${styles.badge} ${styles[st.tone]}`}>{st.text}</span>
                    </td>
                    <td>{fmt(a.activatedAt)}</td>
                    <td>
                      {reviewer ? (
                        <>
                          {a.devices.length ? (
                            <>
                              Vezan
                              <div className={styles.small}>od {fmt(a.devices[0].boundAt)}</div>
                            </>
                          ) : (
                            "Ni vezan"
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{a.stats.visits}</td>
                    <td>{a.stats.pageViews}</td>
                    <td>{fmt(a.stats.lastSeen)}</td>
                  </tr>
                  <tr className={styles.actionsRow}>
                    <td colSpan={8}>
                      <div className={styles.row}>
                        {reviewer && (
                          <>
                            <button
                              type="button"
                              className={styles.btn}
                              disabled={busy !== null}
                              onClick={() =>
                                act(a, "reset", {
                                  ok: "Dostop je ponastavljen.",
                                  secretLabel: "Aktivacijska povezava",
                                  confirmText: `Ponastavi dostop za ${a.username}? Dosedanji brskalnik bo odstranjen, seje končane, ustvarjena bo nova aktivacijska povezava.`,
                                })
                              }
                            >
                              Ponastavi dostop
                            </button>
                            <button
                              type="button"
                              className={styles.btn}
                              disabled={busy !== null || a.activatedAt !== null || a.devices.length > 0}
                              title={a.activatedAt !== null ? "Račun je že aktiviran – uporabite »Ponastavi dostop«." : undefined}
                              onClick={() => act(a, "new_link", { ok: "Nova povezava je ustvarjena.", secretLabel: "Aktivacijska povezava" })}
                            >
                              Nova aktivacijska povezava
                            </button>
                            {a.status === "active" ? (
                              <button
                                type="button"
                                className={styles.btnDanger}
                                disabled={busy !== null}
                                onClick={() => act(a, "revoke", { ok: "Dostop je preklican." })}
                              >
                                Prekliči dostop
                              </button>
                            ) : (
                              <button type="button" className={styles.btn} disabled={busy !== null} onClick={() => act(a, "restore", { ok: "Dostop je obnovljen." })}>
                                Obnovi dostop
                              </button>
                            )}
                          </>
                        )}
                        <button
                          type="button"
                          className={styles.btn}
                          disabled={busy !== null}
                          onClick={() => act(a, "rotate_password", { ok: "Geslo je spremenjeno.", secretLabel: "Novo geslo" })}
                        >
                          Novo geslo
                        </button>
                        {reviewer && (
                          <button type="button" className={styles.link} aria-expanded={open === a.id} onClick={() => toggleVisits(a.id)}>
                            Zgodovina obiskov
                          </button>
                        )}
                      </div>
                      {reviewer && open === a.id && (
                        <div className={styles.history}>
                          {list === "loading" || list === undefined ? (
                            <p className={styles.muted}>Nalaganje …</p>
                          ) : list === "error" ? (
                            <p className={styles.error}>Zgodovine ni bilo mogoče naložiti.</p>
                          ) : list.length === 0 ? (
                            <p className={styles.muted}>Ni obiskov.</p>
                          ) : (
                            <ul className={styles.visitList}>
                              {list.map((ms, i) => (
                                <Fragment key={`${ms}-${i}`}>
                                  <li>{fmt(ms)}</li>
                                </Fragment>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                </tbody>
              );
            })}
          </table>
        </div>
      )}
    </main>
  );
}
