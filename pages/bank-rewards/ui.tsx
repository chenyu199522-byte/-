import React, { type ReactNode } from "react";
import { X, AlertCircle } from "lucide-react";
import ModalPortal from "../../components/ModalPortal";
import DatePicker from "../../components/DatePicker";
export const currencies = [
  "USD",
  "EUR",
  "CNY",
  "GBP",
  "JPY",
  "CHF",
  "CAD",
  "AUD",
];
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="br-field">
      <span>{label}</span>
      {React.isValidElement(children) && typeof children.type === "string"
        ? React.cloneElement(
            children as React.ReactElement<{ "aria-label"?: string }>,
            { "aria-label": label },
          )
        : children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <Field label={label}>
      <DatePicker
        value={value || ""}
        onChange={(v) => onChange(v || null)}
        lang="zh"
        popoverZIndex={180}
        placeholder="选择日期"
        inputClassName="br-date"
      />
    </Field>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  money = false,
  min = 0,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  money?: boolean;
  min?: number;
}) {
  return (
    <Field label={label}>
      <input
        aria-label={label}
        type="number"
        min={min}
        step={money ? "0.01" : "1"}
        value={value === null ? "" : money ? value / 100 : value}
        onChange={(e) =>
          onChange(
            e.target.value === ""
              ? null
              : money
                ? Math.round(Number(e.target.value) * 100)
                : Number(e.target.value),
          )
        }
      />
    </Field>
  );
}
export function Badge({
  tone = "muted",
  children,
}: {
  tone?: string;
  children: ReactNode;
}) {
  return (
    <span className={`br-badge tone-${tone}`}>
      <i />
      {children}
    </span>
  );
}
export function Progress({
  value,
  tone = "teal",
}: {
  value: number;
  tone?: string;
}) {
  return (
    <div className="br-progress">
      <span
        className={`tone-${tone}`}
        style={{
          width: `${Math.round(Math.max(0, Math.min(value, 1)) * 100)}%`,
        }}
      />
    </div>
  );
}
export function ErrorNote({ error }: { error: string }) {
  return error ? (
    <div role="alert" className="br-error">
      <AlertCircle size={16} />
      {error}
    </div>
  ) : null;
}
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <ModalPortal>
      <div
        className="br-modal-backdrop"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={`br-modal ${wide ? "br-modal-wide" : ""}`}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              onClose();
            }
          }}
        >
          <header>
            <h2>{title}</h2>
            <button
              className="br-icon-button"
              aria-label="关闭对话框"
              onClick={onClose}
            >
              <X size={19} />
            </button>
          </header>
          {children}
        </section>
      </div>
    </ModalPortal>
  );
}
export const bankColors = [
  "#2275dd",
  "#a33a9d",
  "#c84855",
  "#7750c9",
  "#0f9182",
  "#967337",
];
export function BankMark({ name }: { name: string }) {
  let n = 0;
  for (const c of name) n += c.charCodeAt(0);
  return (
    <span
      className="br-bank-mark"
      style={{
        background: `linear-gradient(140deg, ${bankColors[n % bankColors.length]}, #101d34)`,
      }}
    >
      {name.trim().slice(0, 2).toUpperCase() || "银"}
    </span>
  );
}
