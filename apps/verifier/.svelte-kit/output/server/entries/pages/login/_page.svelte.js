import { a as attr } from "../../../chunks/index2.js";
import { $ as escape_html } from "../../../chunks/context.js";
import "@sveltejs/kit/internal";
import "../../../chunks/exports.js";
import "../../../chunks/utils.js";
import { r as resolve } from "../../../chunks/server2.js";
import "../../../chunks/state.svelte.js";
import { B as Button } from "../../../chunks/button.js";
import { C as Card, b as Card_header, c as Card_title, d as Card_description, a as Card_content, L as Label, I as Input } from "../../../chunks/label.js";
import { C as Card_footer } from "../../../chunks/card-footer.js";
import "clsx";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let email = "";
    let password = "";
    let loading = false;
    let $$settled = true;
    let $$inner_renderer;
    function $$render_inner($$renderer3) {
      $$renderer3.push(`<div class="page-shell page-shell--compact flex min-h-[calc(100svh-9rem)] items-center justify-center"><!---->`);
      Card?.($$renderer3, {
        class: "w-full border border-border/60 bg-background/88 backdrop-blur-sm",
        children: ($$renderer4) => {
          $$renderer4.push(`<!---->`);
          Card_header?.($$renderer4, {
            children: ($$renderer5) => {
              $$renderer5.push(`<p class="info-kicker">Fast Return</p> <!---->`);
              Card_title?.($$renderer5, {
                children: ($$renderer6) => {
                  $$renderer6.push(`<!---->Welcome Back`);
                },
                $$slots: { default: true }
              });
              $$renderer5.push(`<!----> <!---->`);
              Card_description?.($$renderer5, {
                children: ($$renderer6) => {
                  $$renderer6.push(`<!---->Sign in and jump directly into your next queue review.`);
                },
                $$slots: { default: true }
              });
              $$renderer5.push(`<!---->`);
            },
            $$slots: { default: true }
          });
          $$renderer4.push(`<!----> <!---->`);
          Card_content?.($$renderer4, {
            children: ($$renderer5) => {
              $$renderer5.push(`<form class="space-y-5"><div class="space-y-2">`);
              Label($$renderer5, {
                for: "email",
                children: ($$renderer6) => {
                  $$renderer6.push(`<!---->Email`);
                },
                $$slots: { default: true }
              });
              $$renderer5.push(`<!----> `);
              Input($$renderer5, {
                id: "email",
                type: "email",
                required: true,
                get value() {
                  return email;
                },
                set value($$value) {
                  email = $$value;
                  $$settled = false;
                }
              });
              $$renderer5.push(`<!----></div> <div class="space-y-2">`);
              Label($$renderer5, {
                for: "password",
                children: ($$renderer6) => {
                  $$renderer6.push(`<!---->Password`);
                },
                $$slots: { default: true }
              });
              $$renderer5.push(`<!----> `);
              Input($$renderer5, {
                id: "password",
                type: "password",
                required: true,
                get value() {
                  return password;
                },
                set value($$value) {
                  password = $$value;
                  $$settled = false;
                }
              });
              $$renderer5.push(`<!----></div> `);
              {
                $$renderer5.push("<!--[!-->");
              }
              $$renderer5.push(`<!--]--> `);
              Button($$renderer5, {
                type: "submit",
                class: "w-full",
                disabled: loading,
                children: ($$renderer6) => {
                  $$renderer6.push(`<!---->${escape_html("Sign In")}`);
                },
                $$slots: { default: true }
              });
              $$renderer5.push(`<!----></form>`);
            },
            $$slots: { default: true }
          });
          $$renderer4.push(`<!----> <!---->`);
          Card_footer?.($$renderer4, {
            class: "justify-center",
            children: ($$renderer5) => {
              $$renderer5.push(`<p class="meta-text">Don't have an account? <a${attr("href", resolve("/register"))} class="text-primary underline">Register</a></p>`);
            },
            $$slots: { default: true }
          });
          $$renderer4.push(`<!---->`);
        },
        $$slots: { default: true }
      });
      $$renderer3.push(`<!----></div>`);
    }
    do {
      $$settled = true;
      $$inner_renderer = $$renderer2.copy();
      $$render_inner($$inner_renderer);
    } while (!$$settled);
    $$renderer2.subsume($$inner_renderer);
  });
}
export {
  _page as default
};
