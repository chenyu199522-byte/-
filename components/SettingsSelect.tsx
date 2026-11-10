import React, {forwardRef, useEffect, useImperativeHandle, useRef, useState} from "react";
import FinanceFilterMenu, {FinanceFilterOption} from "./FinanceFilterMenu";
import "./settings-controls.css";

/** Retain native labels, validation and change events; replace only the popup. */
const SettingsSelect = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function SettingsSelect({children, className = "", onMouseDown, onClick, onKeyDown, ...props}, forwardedRef) {
    const native = useRef<HTMLSelectElement>(null);
    useImperativeHandle(forwardedRef, () => native.current!);
    const [open, setOpen] = useState(false);
    useEffect(() => {if (props.disabled) setOpen(false);}, [props.disabled]);
    const [menu, setMenu] = useState<{label:string; value:string; options:FinanceFilterOption[]}>({label:"选择选项",value:"",options:[]});
    const show = () => {
      const element = native.current;
      if (!element || element.matches(":disabled")) return;
      const copy = element.labels?.[0]?.cloneNode(true) as HTMLElement | undefined;
      copy?.querySelectorAll("select,button,input,textarea").forEach(n=>n.remove());
      const label = props["aria-label"] || props.title || copy?.textContent?.trim() || props.name || "选择选项";
      const options = Array.from<HTMLOptionElement>(element.options).filter(o=>!o.hidden).map(o=>({
        value:o.value, label:o.label,
        disabled:o.disabled || (o.parentElement instanceof HTMLOptGroupElement && o.parentElement.disabled),
        group:o.parentElement instanceof HTMLOptGroupElement ? o.parentElement.label : undefined,
      }));
      setMenu({label,value:element.value,options}); setOpen(true);
    };
    return <>
      <select {...props} ref={native} className={`settings-select ${className}`}
        aria-haspopup="dialog" aria-expanded={open}
        onMouseDown={event => {onMouseDown?.(event); event.preventDefault();}}
        onClick={event => {onClick?.(event); event.preventDefault(); native.current?.focus({preventScroll:true}); if (open) setOpen(false); else show();}}
        onKeyDown={event => {
          onKeyDown?.(event);
          if (!event.defaultPrevented && ["ArrowDown","ArrowUp","Enter"," ","F4"].includes(event.key)) {
            event.preventDefault(); show();
          }
        }}>{children}</select>
      <FinanceFilterMenu anchor={native} expanded={open} onExpandedChange={setOpen}
        disabled={props.disabled} label={menu.label} value={menu.value} options={menu.options}
        searchable={menu.options.length > 10}
        onChange={value => {
          const element = native.current;
          if (!element || element.matches(":disabled")) return;
          const option = Array.from<HTMLOptionElement>(element.options).find(o=>o.value===value);
          if (!option || option.disabled || option.hidden ||
            (option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled)) return;
          if (element.value !== value) {
            element.value = value;
            element.dispatchEvent(new Event("change", {bubbles:true}));
          }
        }}/>
    </>;
  },
);
export default SettingsSelect;
