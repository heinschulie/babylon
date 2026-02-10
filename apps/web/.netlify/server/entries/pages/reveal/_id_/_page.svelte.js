import { c as attr_class, a as attr, d as stringify } from "../../../../chunks/index2.js";
import { p as page } from "../../../../chunks/index4.js";
import { r as resolve } from "../../../../chunks/utils2.js";
import { a as api } from "../../../../chunks/api.js";
import { B as Button } from "../../../../chunks/button.js";
import { C as Card } from "../../../../chunks/card.js";
import { C as Card_content } from "../../../../chunks/card-content.js";
import { C as Card_header, a as Card_title, b as Card_description } from "../../../../chunks/card-title.js";
import { C as Card_footer } from "../../../../chunks/card-footer.js";
import "clsx";
import { L as Label, I as Input } from "../../../../chunks/label.js";
import { a as useQuery } from "../../../../chunks/client.svelte.js";
import { $ as escape_html } from "../../../../chunks/context.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const phraseId = page.params.id;
    const phrase = useQuery(api.phrases.get, () => ({ id: phraseId }));
    let userAttempt = "";
    let submitted = false;
    let revealed = false;
    function handleSubmit() {
      submitted = true;
    }
    function handleReveal() {
      revealed = true;
    }
    function normalizeText(text) {
      return text.toLowerCase().trim().replace(/[.,!?;:'"]/g, "");
    }
    const isCorrect = phrase.data && submitted ? normalizeText(userAttempt) === normalizeText(phrase.data.translation) : false;
    let $$settled = true;
    let $$inner_renderer;
    function $$render_inner($$renderer3) {
      $$renderer3.push(`<div class="page-shell page-shell--compact flex min-h-[80vh] flex-col items-center justify-center"><!---->`);
      Card?.($$renderer3, {
        class: "w-full border border-border/60 bg-background/85 backdrop-blur-sm",
        children: ($$renderer4) => {
          $$renderer4.push(`<!---->`);
          Card_header?.($$renderer4, {
            class: "text-center",
            children: ($$renderer5) => {
              $$renderer5.push(`<!---->`);
              Card_title?.($$renderer5, {
                class: "text-2xl",
                children: ($$renderer6) => {
                  $$renderer6.push(`<!---->Time to Recall!`);
                },
                $$slots: { default: true }
              });
              $$renderer5.push(`<!----> <!---->`);
              Card_description?.($$renderer5, {
                children: ($$renderer6) => {
                  $$renderer6.push(`<!---->Can you remember the translation?`);
                },
                $$slots: { default: true }
              });
              $$renderer5.push(`<!---->`);
            },
            $$slots: { default: true }
          });
          $$renderer4.push(`<!----> <!---->`);
          Card_content?.($$renderer4, {
            class: "space-y-6 text-center",
            children: ($$renderer5) => {
              if (phrase.isLoading) {
                $$renderer5.push("<!--[-->");
                $$renderer5.push(`<p class="text-muted-foreground">Loading...</p>`);
              } else {
                $$renderer5.push("<!--[!-->");
                if (phrase.error || !phrase.data) {
                  $$renderer5.push("<!--[-->");
                  $$renderer5.push(`<p class="text-destructive">Phrase not found</p>`);
                } else {
                  $$renderer5.push("<!--[!-->");
                  $$renderer5.push(`<div class="border border-border/60 bg-muted/60 p-6"><p class="info-kicker">English</p> <p class="mt-2 text-xl font-semibold">${escape_html(phrase.data.english)}</p></div> `);
                  if (!submitted) {
                    $$renderer5.push("<!--[-->");
                    $$renderer5.push(`<div class="space-y-4 text-left"><div class="space-y-2">`);
                    Label($$renderer5, {
                      for: "attempt",
                      children: ($$renderer6) => {
                        $$renderer6.push(`<!---->Your Translation`);
                      },
                      $$slots: { default: true }
                    });
                    $$renderer5.push(`<!----> `);
                    Input($$renderer5, {
                      id: "attempt",
                      placeholder: "Type your translation...",
                      onkeydown: (e) => e.key === "Enter" && userAttempt.trim() && handleSubmit(),
                      get value() {
                        return userAttempt;
                      },
                      set value($$value) {
                        userAttempt = $$value;
                        $$settled = false;
                      }
                    });
                    $$renderer5.push(`<!----></div> <div class="flex gap-2">`);
                    Button($$renderer5, {
                      onclick: handleSubmit,
                      class: "flex-1",
                      size: "lg",
                      disabled: !userAttempt.trim(),
                      children: ($$renderer6) => {
                        $$renderer6.push(`<!---->Check Answer`);
                      },
                      $$slots: { default: true }
                    });
                    $$renderer5.push(`<!----> `);
                    Button($$renderer5, {
                      onclick: () => {
                        submitted = true;
                        revealed = true;
                      },
                      variant: "outline",
                      size: "lg",
                      children: ($$renderer6) => {
                        $$renderer6.push(`<!---->Skip`);
                      },
                      $$slots: { default: true }
                    });
                    $$renderer5.push(`<!----></div></div>`);
                  } else {
                    $$renderer5.push("<!--[!-->");
                    if (!revealed) {
                      $$renderer5.push("<!--[-->");
                      $$renderer5.push(`<div class="space-y-4"><div${attr_class(`border-2 p-6 ${stringify(isCorrect ? "border-green-500 bg-green-50 dark:bg-green-950" : "border-orange-500 bg-orange-50 dark:bg-orange-950")}`)}><p class="info-kicker">Your Answer</p> <p class="mt-2 text-xl font-semibold">${escape_html(userAttempt || "(skipped)")}</p> `);
                      if (isCorrect) {
                        $$renderer5.push("<!--[-->");
                        $$renderer5.push(`<p class="mt-2 text-sm font-medium text-green-600 dark:text-green-400">Correct!</p>`);
                      } else {
                        $$renderer5.push("<!--[!-->");
                        $$renderer5.push(`<p class="mt-2 text-sm text-orange-600 dark:text-orange-400">Let's see the correct answer...</p>`);
                      }
                      $$renderer5.push(`<!--]--></div> `);
                      Button($$renderer5, {
                        onclick: handleReveal,
                        class: "w-full",
                        size: "lg",
                        children: ($$renderer6) => {
                          $$renderer6.push(`<!---->${escape_html(isCorrect ? "See Translation" : "Reveal Correct Answer")}`);
                        },
                        $$slots: { default: true }
                      });
                      $$renderer5.push(`<!----></div>`);
                    } else {
                      $$renderer5.push("<!--[!-->");
                      $$renderer5.push(`<div class="space-y-4">`);
                      if (userAttempt) {
                        $$renderer5.push("<!--[-->");
                        $$renderer5.push(`<div${attr_class(`rounded-lg border-2 p-6 ${stringify(isCorrect ? "border-green-500 bg-green-50 dark:bg-green-950" : "border-orange-500 bg-orange-50 dark:bg-orange-950")}`)}><p class="info-kicker">Your Answer</p> <p class="mt-2 text-xl font-semibold">${escape_html(userAttempt)}</p> `);
                        if (isCorrect) {
                          $$renderer5.push("<!--[-->");
                          $$renderer5.push(`<p class="mt-2 text-sm font-medium text-green-600 dark:text-green-400">Correct!</p>`);
                        } else {
                          $$renderer5.push("<!--[!-->");
                        }
                        $$renderer5.push(`<!--]--></div>`);
                      } else {
                        $$renderer5.push("<!--[!-->");
                      }
                      $$renderer5.push(`<!--]--> <div class="border-2 border-primary bg-primary/5 p-6"><p class="info-kicker">Correct Translation</p> <p class="mt-2 text-xl font-semibold text-primary">${escape_html(phrase.data.translation)}</p></div></div>`);
                    }
                    $$renderer5.push(`<!--]-->`);
                  }
                  $$renderer5.push(`<!--]-->`);
                }
                $$renderer5.push(`<!--]-->`);
              }
              $$renderer5.push(`<!--]-->`);
            },
            $$slots: { default: true }
          });
          $$renderer4.push(`<!----> <!---->`);
          Card_footer?.($$renderer4, {
            class: "justify-center",
            children: ($$renderer5) => {
              $$renderer5.push(`<a${attr("href", resolve("/"))} class="meta-text underline">Back to Sessions</a>`);
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
