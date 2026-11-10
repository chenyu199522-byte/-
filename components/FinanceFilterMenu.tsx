import React, {useEffect, useId, useLayoutEffect, useRef, useState} from "react";
import {Check, ChevronDown, Search} from "lucide-react";
import {createPortal} from "react-dom";
import "./finance-filter-menu.css";
import {useSurfacePresence} from "./motion";

export interface FinanceFilterOption {value: string; label: string; group?: string; disabled?: boolean; icon?: React.ReactNode}

/** Transaction filters share one anchored, keyboard-accessible selection menu. */
export default function FinanceFilterMenu({label, value, options, onChange, searchable = false, anchor, expanded, onExpandedChange, disabled = false, buttonClassName = "", placeholder = "请选择"}: {
  label: string; value: string; options: FinanceFilterOption[];
  onChange: (value: string) => void; searchable?: boolean;
  anchor?: React.RefObject<HTMLSelectElement>; expanded?: boolean; onExpandedChange?: (open: boolean) => void;
  disabled?: boolean; buttonClassName?: string; placeholder?: string;
}) {
  const [localOpen, setLocalOpen] = useState(false), [query, setQuery] = useState("");
  const open = !disabled && (expanded ?? localOpen);
  const setOpen = (next: boolean) => {setLocalOpen(next); onExpandedChange?.(next);};
  const [position, setPosition] = useState<React.CSSProperties>({});
  const trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const typeahead = useRef({text:"", at:0});
  const id = useId();
  const visible = options.filter(o => o.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const getTrigger = () => anchor?.current || trigger.current;
  const close = (restore = true) => {setOpen(false); if (restore) getTrigger()?.focus({preventScroll:true});};
  const choose = (next: string) => {if (options.find(o=>o.value===next)?.disabled) return; onChange(next); close();};
  const optionNodes = () => Array.from<HTMLButtonElement>(panel.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') || []);

  useLayoutEffect(() => {
    if (!open || !getTrigger()) return;
    setQuery("");
    const r = getTrigger()!.getBoundingClientRect();
    const width = Math.min(Math.max(r.width, 248), window.innerWidth - 16);
    const below = window.innerHeight - r.bottom - 16, above = r.top - 16;
    const up = below < 260 && above > below;
    setPosition({
      left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), width,
      ...(up ? {bottom:window.innerHeight - r.top + 6} : {top:r.bottom + 6}),
      maxHeight:Math.max(80, Math.min(380, up ? above : below)),
      fontSize:Math.max(13, parseFloat(getComputedStyle(getTrigger()!).fontSize) || 13),
      transformOrigin:`${Math.max(0, Math.min(width, r.left + r.width / 2 - Math.max(8, Math.min(r.left, window.innerWidth - width - 8))))}px ${up ? "bottom" : "top"}`,
    });
    if (searchable) search.current?.focus();
    else {
      const nodes = optionNodes();
      const node = nodes.find(n => n.getAttribute("aria-selected") === "true") || nodes[0];
      node?.focus({preventScroll:true});
      if (node?.parentElement) node.parentElement.scrollTop = node.offsetTop - node.parentElement.offsetTop;
    }
  }, [open, searchable]);
  const present = useSurfacePresence(open, panel, "menu");

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node) && !getTrigger()?.contains(e.target as Node)) close(false);
    };
    const dismiss = () => close(false);
    const scroll = (e: Event) => {if (!panel.current?.contains(e.target as Node)) dismiss();};
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [open]);

  const keyboard = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    // Candidate selection belongs to the input method, not to this menu.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Escape") {e.preventDefault(); close(); return;}
    if (e.key === "Tab") {close(); return;}
    const nodes = optionNodes();
    const index = nodes.indexOf(document.activeElement as HTMLButtonElement);
    let next = -1;
    if (e.key === "ArrowDown") next = (index + 1) % nodes.length;
    if (e.key === "ArrowUp") next = index <= 0 ? nodes.length - 1 : index - 1;
    if (document.activeElement !== search.current) {
      if (e.key === "Home") next = 0;
      if (e.key === "End") next = nodes.length - 1;
      if (e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const now = Date.now();
        typeahead.current = {text:(now - typeahead.current.at < 700 ? typeahead.current.text : "") + e.key.toLocaleLowerCase(), at:now};
        next = nodes.findIndex(n => n.textContent?.toLocaleLowerCase().trim().startsWith(typeahead.current.text));
      }
    } else if (e.key === "Enter" && nodes.length) {e.preventDefault(); nodes[0].click(); return;}
    if (next >= 0 && nodes[next]) {e.preventDefault(); nodes[next].focus(); nodes[next].scrollIntoView({block:"nearest"});}
  };

  return <>
    {!anchor && <button ref={trigger} type="button" disabled={disabled} className={`finance-filter-trigger ${buttonClassName}`} aria-label={label}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => {setQuery(""); setOpen(!open);}}
      onKeyDown={e => {if (["ArrowDown","ArrowUp"].includes(e.key)) {e.preventDefault(); setQuery(""); setOpen(true);}}}>
      <span className="settings-select-value">{options.find(o=>o.value===value)?.icon}{options.find(o => o.value === value)?.label || placeholder}</span><ChevronDown size={14} aria-hidden="true"/>
    </button>}
    {present && createPortal(<div ref={panel} id={id} role="dialog" aria-label={label}
      inert={!open} aria-hidden={!open || undefined}
      className="finance-filter-menu" style={{...position, pointerEvents:open ? undefined : "none"}} onKeyDown={keyboard} onClick={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()}>
      <div className="finance-filter-menu-heading">{label}</div>
      {searchable && <div className="finance-filter-menu-search"><Search size={15} aria-hidden="true"/>
        <input ref={search} aria-label={`搜索${label}`} placeholder="搜索选项…" value={query} onChange={e => setQuery(e.target.value)}/>
      </div>}
      <div className="finance-filter-menu-options" role="listbox" aria-label={label}>
        {visible.map((o,i) => <React.Fragment key={o.value}>
          {o.group && o.group !== visible[i-1]?.group && <div className="finance-filter-menu-group" role="presentation">{o.group}</div>}
          <button type="button" role="option" aria-selected={o.value === value} disabled={o.disabled} tabIndex={-1}
            onClick={() => choose(o.value)}>
            <span className="finance-filter-menu-check" aria-hidden="true">{o.value === value && <Check size={16}/>}</span>
            <span className="settings-select-value">{o.icon}{o.label}</span>
          </button>
        </React.Fragment>)}
        {!visible.length && <p className="finance-filter-menu-empty" role="status">没有匹配的选项</p>}
      </div>
    </div>, getTrigger()?.closest("dialog[open]") || document.body)}
  </>;
}
