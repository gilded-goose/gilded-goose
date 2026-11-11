// One button vocabulary for the whole site. `paypal` is only for the step that opens PayPal (Approve), in PayPal's blue;
// `gold` is rare; `ink` is the ordinary primary; `line` is secondary; `quiet` sits inside text. Links that look like buttons
// use ButtonLink, so they stay real links.
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import "./ui.css";

export type ButtonTone = "gold" | "paypal" | "ink" | "line" | "quiet";
export type ButtonSize = "m" | "s";

type Own = { tone?: ButtonTone; size?: ButtonSize; children: ReactNode };

export function Button({ tone = "ink", size = "m", className, children, ...rest }: Own & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...rest} className={`btn${className ? ` ${className}` : ""}`} data-tone={tone} data-size={size}>
      {children}
    </button>
  );
}

export function ButtonLink({ tone = "ink", size = "m", className, children, ...rest }: Own & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a {...rest} className={`btn${className ? ` ${className}` : ""}`} data-tone={tone} data-size={size}>
      {children}
    </a>
  );
}
