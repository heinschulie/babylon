import { b as attributes, c as clsx, d as bind_props } from "./index2.js";
import { c as cn } from "./button.js";
function Card_footer($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let {
      ref = null,
      class: className,
      children,
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    $$renderer2.push(`<div${attributes({
      "data-slot": "card-footer",
      class: clsx(cn("flex items-center px-5 sm:px-6 [.border-t]:pt-6", className)),
      ...restProps
    })}>`);
    children?.($$renderer2);
    $$renderer2.push(`<!----></div>`);
    bind_props($$props, { ref });
  });
}
export {
  Card_footer as C
};
