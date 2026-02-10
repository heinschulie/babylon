import { a as attr, b as spread_props, e as ensure_array_like } from "../../chunks/index2.js";
import { r as resolve } from "../../chunks/utils2.js";
import "@sveltejs/kit/internal";
import "../../chunks/exports.js";
import "../../chunks/utils.js";
import "../../chunks/state.svelte.js";
import { a as api } from "../../chunks/api.js";
import { B as Button } from "../../chunks/button.js";
import { C as Card } from "../../chunks/card.js";
import { C as Card_content } from "../../chunks/card-content.js";
import { C as Card_header, a as Card_title, b as Card_description } from "../../chunks/card-title.js";
import "clsx";
import { D as Dialog, a as Dialog_trigger, b as Dialog_content, c as Dialog_header, d as Dialog_title, e as Dialog_description, f as Dialog_footer } from "../../chunks/dialog-trigger.js";
import { L as Label, I as Input } from "../../chunks/label.js";
import "../../chunks/auth.js";
import { u as useConvexClient, a as useQuery } from "../../chunks/client.svelte.js";
import { $ as escape_html } from "../../chunks/context.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const client = useConvexClient();
    const phraseGroups = useQuery(api.phrases.listGroupedByCategory, {});
    let dialogOpen = false;
    let english = "";
    let translation = "";
    let creating = false;
    let error = "";
    const totalPhraseCount = phraseGroups.data?.reduce((sum, group) => sum + group.phrases.length, 0) ?? 0;
    const categoryCount = phraseGroups.data?.length ?? 0;
    async function createPhrase() {
      if (!english.trim() || !translation.trim()) {
        error = "Please enter both English and translation.";
        return;
      }
      creating = true;
      error = "";
      try {
        await client.mutation(api.phrases.createDirect, {
          english: english.trim(),
          translation: translation.trim(),
          languageCode: "xh-ZA"
        });
        dialogOpen = false;
        english = "";
        translation = "";
      } catch (e) {
        error = e instanceof Error ? e.message : "Failed to add phrase";
      } finally {
        creating = false;
      }
    }
    let $$settled = true;
    let $$inner_renderer;
    function $$render_inner($$renderer3) {
      $$renderer3.push(`<div class="page-shell page-shell--narrow page-stack"><header class="page-stack"><div><p class="info-kicker">Daily Practice Setup</p> <h1 class="text-5xl sm:text-6xl">Phrase Library</h1> <p class="meta-text mt-3 max-w-2xl">Store phrases once, then train in short bursts when you have a spare minute.</p></div> <div class="grid gap-3 sm:grid-cols-2"><a${attr("href", resolve("/practice"))} class="block">`);
      Button($$renderer3, {
        class: "w-full",
        size: "lg",
        children: ($$renderer4) => {
          $$renderer4.push(`<!---->Start Practice`);
        },
        $$slots: { default: true }
      });
      $$renderer3.push(`<!----></a> <!---->`);
      Dialog?.($$renderer3, {
        get open() {
          return dialogOpen;
        },
        set open($$value) {
          dialogOpen = $$value;
          $$settled = false;
        },
        children: ($$renderer4) => {
          $$renderer4.push(`<!---->`);
          {
            let child = function($$renderer5, { props }) {
              Button($$renderer5, spread_props([
                props,
                {
                  variant: "outline",
                  class: "w-full",
                  size: "lg",
                  children: ($$renderer6) => {
                    $$renderer6.push(`<!---->Add Phrase`);
                  },
                  $$slots: { default: true }
                }
              ]));
            };
            Dialog_trigger?.($$renderer4, { child, $$slots: { child: true } });
          }
          $$renderer4.push(`<!----> <!---->`);
          Dialog_content?.($$renderer4, {
            children: ($$renderer5) => {
              $$renderer5.push(`<!---->`);
              Dialog_header?.($$renderer5, {
                children: ($$renderer6) => {
                  $$renderer6.push(`<!---->`);
                  Dialog_title?.($$renderer6, {
                    children: ($$renderer7) => {
                      $$renderer7.push(`<!---->Add Phrase`);
                    },
                    $$slots: { default: true }
                  });
                  $$renderer6.push(`<!----> <!---->`);
                  Dialog_description?.($$renderer6, {
                    children: ($$renderer7) => {
                      $$renderer7.push(`<!---->Target language: Xhosa (\`xh-ZA\`).`);
                    },
                    $$slots: { default: true }
                  });
                  $$renderer6.push(`<!---->`);
                },
                $$slots: { default: true }
              });
              $$renderer5.push(`<!----> <div class="space-y-4 py-4"><div class="space-y-2">`);
              Label($$renderer5, {
                for: "english",
                children: ($$renderer6) => {
                  $$renderer6.push(`<!---->English phrase`);
                },
                $$slots: { default: true }
              });
              $$renderer5.push(`<!----> `);
              Input($$renderer5, {
                id: "english",
                placeholder: "e.g. Where is the taxi rank?",
                get value() {
                  return english;
                },
                set value($$value) {
                  english = $$value;
                  $$settled = false;
                }
              });
              $$renderer5.push(`<!----></div> <div class="space-y-2">`);
              Label($$renderer5, {
                for: "translation",
                children: ($$renderer6) => {
                  $$renderer6.push(`<!---->Your Xhosa phrase`);
                },
                $$slots: { default: true }
              });
              $$renderer5.push(`<!----> `);
              Input($$renderer5, {
                id: "translation",
                placeholder: "Type your phrase...",
                get value() {
                  return translation;
                },
                set value($$value) {
                  translation = $$value;
                  $$settled = false;
                }
              });
              $$renderer5.push(`<!----></div> `);
              if (error) {
                $$renderer5.push("<!--[-->");
                $$renderer5.push(`<p class="text-sm text-destructive">${escape_html(error)}</p>`);
              } else {
                $$renderer5.push("<!--[!-->");
              }
              $$renderer5.push(`<!--]--></div> <!---->`);
              Dialog_footer?.($$renderer5, {
                children: ($$renderer6) => {
                  Button($$renderer6, {
                    variant: "outline",
                    onclick: () => dialogOpen = false,
                    children: ($$renderer7) => {
                      $$renderer7.push(`<!---->Cancel`);
                    },
                    $$slots: { default: true }
                  });
                  $$renderer6.push(`<!----> `);
                  Button($$renderer6, {
                    onclick: createPhrase,
                    disabled: creating,
                    children: ($$renderer7) => {
                      $$renderer7.push(`<!---->${escape_html(creating ? "Adding..." : "Add Phrase")}`);
                    },
                    $$slots: { default: true }
                  });
                  $$renderer6.push(`<!---->`);
                },
                $$slots: { default: true }
              });
              $$renderer5.push(`<!---->`);
            },
            $$slots: { default: true }
          });
          $$renderer4.push(`<!---->`);
        },
        $$slots: { default: true }
      });
      $$renderer3.push(`<!----></div></header> <!---->`);
      Card?.($$renderer3, {
        class: "border border-border/60 bg-background/85 backdrop-blur-sm",
        children: ($$renderer4) => {
          $$renderer4.push(`<!---->`);
          Card_content?.($$renderer4, {
            children: ($$renderer5) => {
              $$renderer5.push(`<div class="grid gap-4 sm:grid-cols-3"><div><p class="info-kicker">Saved Phrases</p> <p class="mt-2 text-4xl font-display">${escape_html(totalPhraseCount)}</p></div> <div><p class="info-kicker">Categories</p> <p class="mt-2 text-4xl font-display">${escape_html(categoryCount)}</p></div> <div><p class="info-kicker">Suggested Session</p> <p class="mt-2 text-lg font-semibold">5-10 minutes</p> <p class="meta-text mt-1">Perfect for commute gaps and quick breaks.</p></div></div>`);
            },
            $$slots: { default: true }
          });
          $$renderer4.push(`<!---->`);
        },
        $$slots: { default: true }
      });
      $$renderer3.push(`<!----> <section class="page-stack"><h2 class="text-4xl sm:text-5xl">Your Phrase Groups</h2> `);
      if (phraseGroups.isLoading) {
        $$renderer3.push("<!--[-->");
        $$renderer3.push(`<p class="meta-text">Loading phrases...</p>`);
      } else {
        $$renderer3.push("<!--[!-->");
        if (phraseGroups.error) {
          $$renderer3.push("<!--[-->");
          $$renderer3.push(`<p class="text-destructive">Error loading phrases: ${escape_html(phraseGroups.error.message)}</p>`);
        } else {
          $$renderer3.push("<!--[!-->");
          if (!phraseGroups.data || phraseGroups.data.length === 0) {
            $$renderer3.push("<!--[-->");
            $$renderer3.push(`<!---->`);
            Card?.($$renderer3, {
              class: "border border-border/60 bg-background/85 backdrop-blur-sm",
              children: ($$renderer4) => {
                $$renderer4.push(`<!---->`);
                Card_header?.($$renderer4, {
                  children: ($$renderer5) => {
                    $$renderer5.push(`<!---->`);
                    Card_title?.($$renderer5, {
                      children: ($$renderer6) => {
                        $$renderer6.push(`<!---->No phrases yet`);
                      },
                      $$slots: { default: true }
                    });
                    $$renderer5.push(`<!----> <!---->`);
                    Card_description?.($$renderer5, {
                      children: ($$renderer6) => {
                        $$renderer6.push(`<!---->Add your first phrase to start building your library.`);
                      },
                      $$slots: { default: true }
                    });
                    $$renderer5.push(`<!---->`);
                  },
                  $$slots: { default: true }
                });
                $$renderer4.push(`<!---->`);
              },
              $$slots: { default: true }
            });
            $$renderer3.push(`<!---->`);
          } else {
            $$renderer3.push("<!--[!-->");
            $$renderer3.push(`<div class="space-y-4"><!--[-->`);
            const each_array = ensure_array_like(phraseGroups.data);
            for (let $$index_1 = 0, $$length = each_array.length; $$index_1 < $$length; $$index_1++) {
              let group = each_array[$$index_1];
              $$renderer3.push(`<!---->`);
              Card?.($$renderer3, {
                class: "border border-border/60 bg-background/85 backdrop-blur-sm",
                children: ($$renderer4) => {
                  $$renderer4.push(`<!---->`);
                  Card_header?.($$renderer4, {
                    class: "border-b border-border/50 pb-4",
                    children: ($$renderer5) => {
                      $$renderer5.push(`<!---->`);
                      Card_title?.($$renderer5, {
                        class: "text-3xl sm:text-4xl",
                        children: ($$renderer6) => {
                          $$renderer6.push(`<!---->${escape_html(group.label)}`);
                        },
                        $$slots: { default: true }
                      });
                      $$renderer5.push(`<!----> <!---->`);
                      Card_description?.($$renderer5, {
                        children: ($$renderer6) => {
                          $$renderer6.push(`<!---->${escape_html(group.phrases.length)} phrase(s)`);
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
                      $$renderer5.push(`<ul class="space-y-3"><!--[-->`);
                      const each_array_1 = ensure_array_like(group.phrases);
                      for (let $$index = 0, $$length2 = each_array_1.length; $$index < $$length2; $$index++) {
                        let phrase = each_array_1[$$index];
                        $$renderer5.push(`<li class="phrase-card border border-border/60 bg-background/70 p-4 sm:p-5"><p class="info-kicker">English</p> <p class="mt-2 text-xl font-semibold leading-tight sm:text-2xl">${escape_html(phrase.english)}</p> <p class="info-kicker mt-5">Xhosa</p> <p class="xhosa-phrase mt-2 font-black">${escape_html(phrase.translation)}</p></li>`);
                      }
                      $$renderer5.push(`<!--]--></ul>`);
                    },
                    $$slots: { default: true }
                  });
                  $$renderer4.push(`<!---->`);
                },
                $$slots: { default: true }
              });
              $$renderer3.push(`<!---->`);
            }
            $$renderer3.push(`<!--]--></div>`);
          }
          $$renderer3.push(`<!--]-->`);
        }
        $$renderer3.push(`<!--]-->`);
      }
      $$renderer3.push(`<!--]--></section></div>`);
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
