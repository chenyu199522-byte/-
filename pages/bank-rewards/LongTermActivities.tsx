import SettingsSelect from "../../components/SettingsSelect";
import React, { useEffect, useRef, useState } from "react";
import type { User } from "../../types";
import type {
  ActivityEntry,
  EntryKind,
  RewardOffer,
  RewardState,
} from "../../services/bank-rewards/types";
import {
  activityTotals,
  money,
  todayISO,
} from "../../services/bank-rewards/logic";
import { rewardRepository } from "../../services/bank-rewards/repository";
import {
  Badge,
  BankMark,
  currencies,
  DateField,
  ErrorNote,
  Field,
  Modal,
  NumberField,
} from "./ui";

const kinds: Record<EntryKind, string> = {
  earning: "收益",
  deposit: "存入",
  withdrawal: "提取",
};
export default function LongTermActivities({
  user,
  state,
  today,
  focus,
  onFocusHandled,
  onSaved,
  onEdit,
  onDelete,
}: {
  user: User;
  state: RewardState;
  today: string;
  focus?: { offerId?: string; nonce: number };
  onFocusHandled?: () => void;
  onSaved: (s: RewardState) => void;
  onEdit: (o: RewardOffer) => void;
  onDelete: (o: RewardOffer) => void;
}) {
  const [currency, setCurrency] = useState("USD"),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<string | null>(null),
    [entry, setEntry] = useState<ActivityEntry | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const target = state.offers.find(o => o.id === focus?.offerId && o.activityType === "long_term");
    if (!target) return;
    setCurrency(target.currency);
    setSelected(target.id);
    onFocusHandled?.();
  }, [focus]);
  const all = state.offers.filter(
    (o) => o.activityType === "long_term" && o.currency === currency,
  );
  const offers = all
    .filter(
      (o) =>
        (status === "all" || (o.activityStatus || "active") === status) &&
        `${o.bankName} ${o.productName} ${o.notes}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const totals = activityTotals(
      state,
      all.map((o) => o.id),
      today,
    ),
    offer = all.find((o) => o.id === selected);
  const details = offer ? activityTotals(state, [offer.id], today) : null;
  const rows = (state.entries || [])
    .filter((e) => e.offerId === selected)
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.createdAt.localeCompare(a.createdAt) ||
        a.id.localeCompare(b.id),
    );
  const add = (o: RewardOffer, kind: EntryKind) => {
    setError("");
    setEntry({
      id: crypto.randomUUID(),
      userId: user.id,
      offerId: o.id,
      kind,
      date: todayISO(),
      amountCents: 0,
      title: "",
      notes: "",
      createdAt: "",
      updatedAt: "",
    });
  };
  const metrics = (values: ReturnType<typeof activityTotals>) => (
    <div className="br-long-metrics">
      {(
        [
          ["累计收益", values.total],
          ["本月收益", values.month],
          ["累计存入", values.deposits],
          ["累计提取", values.withdrawals],
        ] as const
      ).map(([label, value], i) => (
        <div key={label}>
          <span>{label}</span>
          <strong
            className={
              i < 2 ? (value < 0 ? "br-text-red" : "br-text-teal") : ""
            }
          >
            {money(value, currency)}
          </strong>
        </div>
      ))}
    </div>
  );
  return (
    <section className="br-long-section">
      <h2>全部长期活动 · {currency}</h2>
      {metrics(totals)}
      <div className="br-toolbar">
        <Field label="搜索长期活动">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="平台、活动或备注"
          />
        </Field>
        <Field label="长期活动状态">
          <SettingsSelect value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">全部状态</option>
            <option value="active">持续中</option>
            <option value="paused">已暂停</option>
            <option value="ended">已结束</option>
          </SettingsSelect>
        </Field>
        <Field label="长期活动币种">
          <SettingsSelect
            value={currency}
            onChange={(e) => {
              setCurrency(e.target.value);
              setSelected(null);
            }}
          >
            {currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </SettingsSelect>
        </Field>
      </div>
      <div className="br-long-list">
        {!offers.length && (
          <p className="br-inline-empty">
            暂无长期活动，点击“新增奖励活动”开始记录。
          </p>
        )}
        {offers.map((o) => {
          const t = activityTotals(state, [o.id], today);
          return (
            <article className="br-long-card" key={o.id}>
              <div className="br-section-title">
                <BankMark name={o.bankName} />
                <div>
                  <h2>
                    {o.bankName}
                    {o.productName ? ` · ${o.productName}` : ""}
                  </h2>
                  <p className="br-hint">
                    最近记录：{t.lastDate || "暂无"} · {t.count} 笔收益
                  </p>
                </div>
                <Badge tone="teal">
                  {
                    { active: "持续中", paused: "已暂停", ended: "已结束" }[
                      o.activityStatus || "active"
                    ]
                  }
                </Badge>
              </div>
              {metrics(t)}
              <div className="br-actions br-long-actions br-long-card-actions">
                <button
                  className="br-primary"
                  onClick={() => add(o, "earning")}
                >
                  新增收益
                </button>
                <button onClick={() => setSelected(o.id)}>查看明细</button>
              </div>
            </article>
          );
        })}
      </div>
      {offer && details && (
        <Modal title="长期活动明细" wide onClose={() => setSelected(null)}>
          <h3>
            {offer.bankName} · {offer.productName}
          </h3>
          {metrics(details)}
          <p className="br-hint">
            收益只累计“收益”明细。存入和提取单独统计，不代表盈利，也不改变财务余额。
          </p>
          <div className="br-actions br-long-actions">
            <button
              className="br-primary"
              onClick={() => add(offer, "earning")}
            >
              新增收益
            </button>
            <button onClick={() => add(offer, "deposit")}>记录存入</button>
            <button onClick={() => add(offer, "withdrawal")}>记录提取</button>
            <button onClick={() => onEdit(offer)}>编辑活动</button>
            <button className="br-danger" onClick={() => onDelete(offer)}>删除活动</button>
          </div>
          {!rows.length && <p className="br-inline-empty">尚无记录</p>}
          {rows.map((e) => (
            <article className="br-long-entry" key={e.id}>
              <div>
                <strong>{e.title || kinds[e.kind]}</strong>
                <p>
                  {e.date} · {kinds[e.kind]}
                  {e.notes ? ` · ${e.notes}` : ""}
                </p>
              </div>
              <strong
                className={
                  e.kind === "earning"
                    ? e.amountCents < 0
                      ? "br-text-red"
                      : "br-text-teal"
                    : ""
                }
              >
                {money(e.amountCents, currency)}
              </strong>
              <button
                aria-label={`编辑记录：${e.title || kinds[e.kind]}`}
                onClick={() => setEntry(e)}
              >
                编辑
              </button>
              <button
                className="br-danger"
                aria-label={`删除记录：${e.title || kinds[e.kind]}`}
                onClick={() => {
                  setError("");
                  setDeleteId(e.id);
                }}
              >
                删除
              </button>
            </article>
          ))}
        </Modal>
      )}
      {entry && (
        <div key={entry.id}>
          <EntryDialog
            entry={entry}
            currency={currency}
            onClose={() => setEntry(null)}
            onSaved={(s) => {
              onSaved(s);
              setEntry(null);
            }}
          />
        </div>
      )}
      {deleteId && (
        <Modal title="删除活动明细" onClose={() => setDeleteId(null)}>
          <p>删除这笔记录后会重新计算活动统计，财务账目保持不变。</p>
          <ErrorNote error={error} />
          <footer className="br-modal-footer">
            <button onClick={() => setDeleteId(null)}>取消</button>
            <button
              className="br-danger-button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  onSaved(
                    await rewardRepository.deleteEntry(user.id, deleteId),
                  );
                  setDeleteId(null);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              确认删除
            </button>
          </footer>
        </Modal>
      )}
    </section>
  );
}

function EntryDialog({
  entry,
  currency,
  onClose,
  onSaved,
}: {
  entry: ActivityEntry;
  currency: string;
  onClose: () => void;
  onSaved: (s: RewardState) => void;
}) {
  const [value, setValue] = useState({ ...entry }),
    [amount, setAmount] = useState<number | null>(entry.amountCents || null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  return (
    <Modal
      title={entry.createdAt ? "编辑活动记录" : `新增${kinds[entry.kind]}`}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (submitting.current) return;
          submitting.current = true;
          setBusy(true);
          setError("");
          try {
            onSaved(
              await rewardRepository.saveEntry(entry.userId, {
                ...value,
                amountCents: amount ?? 0,
              }),
            );
          } catch (err) {
            setError((err as Error).message);
          } finally {
            submitting.current = false;
            setBusy(false);
          }
        }}
      >
        <ErrorNote error={error} />
        <div className="br-form-grid">
          <Field label="记录类型">
            <SettingsSelect
              value={value.kind}
              onChange={(e) =>
                setValue({ ...value, kind: e.target.value as EntryKind })
              }
            >
              {Object.entries(kinds).map(([key, label]) => (
                <option value={key} key={key}>
                  {label}
                </option>
              ))}
            </SettingsSelect>
          </Field>
          <DateField
            label="记录日期"
            value={value.date}
            onChange={(date) => setValue({ ...value, date: date || "" })}
          />
          <NumberField
            label={`金额（${currency}）`}
            value={amount}
            onChange={setAmount}
            money
            min={value.kind === "earning" ? -Number.MAX_SAFE_INTEGER : 0.01}
          />
          <Field label="活动 / 记录名称">
            <input
              value={value.title}
              onChange={(e) => setValue({ ...value, title: e.target.value })}
            />
          </Field>
          <Field label="记录备注">
            <textarea
              value={value.notes}
              onChange={(e) => setValue({ ...value, notes: e.target.value })}
            />
          </Field>
        </div>
        <p className="br-hint">
          {value.kind === "earning"
            ? "每次填写本笔收益，亏损或收益冲正填负数。"
            : "填写本次存入或提取的金额，不会计入收益。"}
        </p>
        <footer className="br-modal-footer">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button className="br-primary" disabled={busy}>
            {busy ? "保存中…" : "保存记录"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
