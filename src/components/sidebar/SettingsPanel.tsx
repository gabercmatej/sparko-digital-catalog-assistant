"use client";
import { useState } from "react";
import { deleteUserConversations, resetSelection, setSpPlus, showToast, useStore } from "@/lib/store/store";
import type { SpPlusSetting } from "@/lib/types";
import { Icon } from "../ui/Icon";
import styles from "./Sidebar.module.css";

const SP_OPTIONS: { value: SpPlusSetting; label: string }[] = [
  { value: "yes", label: "Da" },
  { value: "no", label: "Ne" },
  { value: "unset", label: "Ni izbrano" },
];

export function SettingsPanel({ onBack }: { onBack: () => void }) {
  const { settings, saved, conversations } = useStore();
  const [confirm, setConfirm] = useState<null | "selection" | "conversations">(null);

  return (
    <>
      <div className={styles.top}>
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Nazaj na meni" data-autofocus>
          <Icon name="chevron-left" size={22} />
        </button>
        <h2 className={styles.settingsTitle}>Nastavitve</h2>
        <span style={{ width: 44 }} aria-hidden="true" />
      </div>
      <div className={`${styles.scroll} ${styles.settings}`}>
        <fieldset className={styles.fieldset}>
          <legend className={styles.sectionTitle}>Imam kartico SPAR plus</legend>
          <div className={styles.segmented}>
            {SP_OPTIONS.map((o) => (
              <label key={o.value} className={styles.segment} data-checked={settings.spPlus === o.value || undefined}>
                <input type="radio" name="spplus" value={o.value} checked={settings.spPlus === o.value} onChange={() => setSpPlus(o.value)} className="sr-only" />
                {o.label}
              </label>
            ))}
          </div>
          <p className={styles.help}>Sparko pri cenah s kartico SPAR plus to upošteva pri izračunih.</p>
        </fieldset>

        <section className={styles.infoBlock}>
          <h3 className={styles.sectionTitle}>O demo katalogu</h3>
          <p className={styles.help}>
            Demo katalog SPAR 40/26 z dne 30. 9. 2026. Cene in datumi so iz tega kataloga, ne aktualne cene v trgovini.
          </p>
        </section>

        <section className={styles.infoBlock}>
          <h3 className={styles.sectionTitle}>Kako Sparko ocenjuje?</h3>
          <dl className={styles.defs}>
            <dt>Izrazit popust</dt>
            <dd>Vsaj 20 % popusta, ki je potrjen v letaku.</dd>
            <dt>Dobra izbira zate</dt>
            <dd>Ista linija ali kategorija kot izdelki v tvojem Mojem katalogu.</dd>
            <dt>V tvojem proračunu</dt>
            <dd>Izračun s cenami celih pakiranj je znotraj proračuna.</dd>
          </dl>
          <p className={styles.help}>Sparko ne uporablja zvezdic ali točk.</p>
        </section>

        <section className={styles.danger} aria-label="Ponastavitev">
          <ResetRow
            label="Ponastavi Moj katalog"
            help={`Odstrani shranjene izdelke (${saved.length}). Pogovori ostanejo.`}
            confirming={confirm === "selection"}
            onAsk={() => setConfirm("selection")}
            onCancel={() => setConfirm(null)}
            onConfirm={() => {
              resetSelection();
              setConfirm(null);
              showToast("Moj katalog je ponastavljen.");
            }}
            disabled={saved.length === 0}
          />
          <ResetRow
            label="Izbriši moje pogovore"
            help={`Izbriše tvoje pogovore (${conversations.length}). Moj katalog in primeri ostanejo.`}
            confirming={confirm === "conversations"}
            onAsk={() => setConfirm("conversations")}
            onCancel={() => setConfirm(null)}
            onConfirm={() => {
              deleteUserConversations();
              setConfirm(null);
              showToast("Tvoji pogovori so izbrisani.");
            }}
            disabled={conversations.length === 0}
          />
        </section>
      </div>
    </>
  );
}

function ResetRow({
  label,
  help,
  confirming,
  onAsk,
  onCancel,
  onConfirm,
  disabled,
}: {
  label: string;
  help: string;
  confirming: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  disabled: boolean;
}) {
  return (
    <div className={styles.resetRow}>
      {confirming ? (
        <div className={styles.confirm} role="group" aria-label={`Potrdi: ${label}`}>
          <p className={styles.confirmText}>{label}? Tega ni mogoče razveljaviti.</p>
          <div className={styles.confirmActions}>
            <button type="button" className={`btn btn-sm ${styles.dangerBtn}`} onClick={onConfirm}>
              Da, nadaljuj
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
              Prekliči
            </button>
          </div>
        </div>
      ) : (
        <>
          <button type="button" className={`btn btn-sm ${styles.resetBtn}`} onClick={onAsk} disabled={disabled}>
            <Icon name="trash" size={16} />
            {label}
          </button>
          <p className={styles.help}>{help}</p>
        </>
      )}
    </div>
  );
}
