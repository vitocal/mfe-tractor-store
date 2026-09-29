import register from "preact-custom-element";
import { ComponentChildren, JSX, FunctionalComponent } from "preact";
import "./button.css";

export type Variant = "primary" | "secondary" | string;

export interface Props {
  href?: string;
  type?: JSX.IntrinsicElements["button"]["type"];
  value?: string;
  disabled?: boolean;
  rounded?: boolean;
  className?: string;
  children?: ComponentChildren;
  dataId?: string;
  variant?: Variant;
}

const Button: FunctionalComponent<Props> = ({
  href,
  type,
  value,
  disabled = false,
  rounded = false,
  className = "",
  children,
  dataId,
  variant = "secondary",
}) => {
  const Tag = href ? "a" : "button";

  const classNames = [
    "e_Button",
    `e_Button--${variant}`,
    className,
    rounded ? "e_Button--rounded" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag
      disabled={href ? undefined : disabled}
      href={href || undefined}
      type={href ? undefined : type}
      value={value || undefined}
      data-id={dataId || undefined}
      class={classNames}
    >
      <div class="e_Button__inner">
        <slot>{children}</slot>
      </div>
    </Tag>
  );
};

// Register as a Custom Element: <ds-button>
register(Button, "ds-button", [
  "href",
  "type",
  "value",
  "disabled",
  "rounded",
  "className",
  "dataId",
  "variant",
]);

export default Button;