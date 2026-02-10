import { a as attr, b as spread_props, e as ensure_array_like, c as attr_class, d as stringify } from "../../../../chunks/index2.js";
import { p as page } from "../../../../chunks/index4.js";
import { r as resolve } from "../../../../chunks/utils2.js";
import { a as api } from "../../../../chunks/api.js";
import { B as Button } from "../../../../chunks/button.js";
import { C as Card } from "../../../../chunks/card.js";
import "clsx";
import { C as Card_header, a as Card_title, b as Card_description } from "../../../../chunks/card-title.js";
import { D as Dialog, a as Dialog_trigger, b as Dialog_content, c as Dialog_header, d as Dialog_title, e as Dialog_description, f as Dialog_footer } from "../../../../chunks/dialog-trigger.js";
import { L as Label, I as Input } from "../../../../chunks/label.js";
import { u as useConvexClient, a as useQuery } from "../../../../chunks/client.svelte.js";
import { $ as escape_html } from "../../../../chunks/context.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const client = useConvexClient();
    const sessionId = page.params.id;
    const sessionData = useQuery(api.phrases.listBySession, () => ({ sessionId }));
    const session = sessionData.data?.session;
    const phrases = sessionData.data?.phrases;
    let dialogOpen = false;
    let english = "";
    let translation = "";
    let creating = false;
    let verifying = false;
    let error = "";
    let verificationResult = null;
    let showVerification = false;
    async function verifyTranslation() {
      if (!english.trim() || !translation.trim()) {
        error = "Please enter both English and translation";
        return;
      }
      if (!session?.targetLanguage) {
        error = "Session language not found";
        return;
      }
      verifying = true;
      error = "";
      verificationResult = null;
      try {
        const result = await client.action(api.translateNode.verifyTranslation, {
          english: english.trim(),
          userTranslation: translation.trim(),
          targetLanguage: session.targetLanguageCode ?? session.targetLanguage
        });
        verificationResult = result;
        showVerification = true;
      } catch (e) {
        error = e instanceof Error ? e.message : "Failed to verify translation";
      } finally {
        verifying = false;
      }
    }
    async function createPhrase() {
      if (!english.trim() || !translation.trim()) {
        error = "Please enter both English and translation";
        return;
      }
      creating = true;
      error = "";
      try {
        await client.mutation(api.phrases.create, {
          sessionId,
          english: english.trim(),
          translation: translation.trim()
        });
        dialogOpen = false;
        resetForm();
      } catch (e) {
        error = e instanceof Error ? e.message : "Failed to create phrase";
      } finally {
        creating = false;
      }
    }
    function useSuggestion() {
      if (verificationResult?.suggestedTranslation) {
        translation = verificationResult.suggestedTranslation;
        showVerification = false;
        verificationResult = null;
      }
    }
    function keepOriginal() {
      showVerification = false;
    }
    function resetForm() {
      english = "";
      translation = "";
      verificationResult = null;
      showVerification = false;
      error = "";
    }
    async function removePhrase(phraseId) {
      if (!confirm("Are you sure you want to delete this phrase?")) {
        return;
      }
      try {
        await client.mutation(api.phrases.remove, { id: phraseId });
      } catch (e) {
        console.error("Failed to delete phrase:", e);
      }
    }
    let $$settled = true;
    let $$inner_renderer;
    function $$render_inner($$renderer3) {
      $$renderer3.push(`<div class="page-shell page-shell--narrow page-stack"><div class="flex flex-wrap items-start justify-between gap-3"><div><a${attr("href", resolve("/"))} class="meta-text underline">← Back to sessions</a> <h1 class="mt-2 text-5xl sm:text-6xl">`);
      if (session) {
        $$renderer3.push("<!--[-->");
        $$renderer3.push(`${escape_html(session.targetLanguage)} Session`);
      } else {
        $$renderer3.push("<!--[!-->");
        $$renderer3.push(`Session Details`);
      }
      $$renderer3.push(`<!--]--></h1> `);
      if (session) {
        $$renderer3.push("<!--[-->");
        $$renderer3.push(`<p class="meta-text">${escape_html(session.date)}</p>`);
      } else {
        $$renderer3.push("<!--[!-->");
      }
      $$renderer3.push(`<!--]--></div> <!---->`);
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
                      $$renderer7.push(`<!---->Add New Phrase`);
                    },
                    $$slots: { default: true }
                  });
                  $$renderer6.push(`<!----> <!---->`);
                  Dialog_description?.($$renderer6, {
                    children: ($$renderer7) => {
                      $$renderer7.push(`<!---->Enter an English phrase and your ${escape_html(session?.targetLanguage || "target language")} translation.`);
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
                  $$renderer6.push(`<!---->English`);
                },
                $$slots: { default: true }
              });
              $$renderer5.push(`<!----> `);
              Input($$renderer5, {
                id: "english",
                placeholder: "Enter English phrase",
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
                  $$renderer6.push(`<!---->Your Translation (${escape_html(session?.targetLanguage || "target")})`);
                },
                $$slots: { default: true }
              });
              $$renderer5.push(`<!----> `);
              Input($$renderer5, {
                id: "translation",
                placeholder: "Enter your translation",
                get value() {
                  return translation;
                },
                set value($$value) {
                  translation = $$value;
                  $$settled = false;
                }
              });
              $$renderer5.push(`<!----></div> `);
              if (showVerification && verificationResult) {
                $$renderer5.push("<!--[-->");
                $$renderer5.push(`<div${attr_class(`rounded-lg border p-4 ${stringify(verificationResult.verified ? "border-green-500 bg-green-50 dark:bg-green-950" : "border-orange-500 bg-orange-50 dark:bg-orange-950")}`)}><p${attr_class(`text-sm font-medium ${stringify(verificationResult.verified ? "text-green-700 dark:text-green-300" : "text-orange-700 dark:text-orange-300")}`)}>${escape_html(verificationResult.message)}</p> `);
                if (verificationResult.similarity !== void 0) {
                  $$renderer5.push("<!--[-->");
                  $$renderer5.push(`<p class="mt-1 text-xs text-muted-foreground">Similarity: ${escape_html(verificationResult.similarity)}%</p>`);
                } else {
                  $$renderer5.push("<!--[!-->");
                }
                $$renderer5.push(`<!--]--> `);
                if (!verificationResult.verified && verificationResult.suggestedTranslation) {
                  $$renderer5.push("<!--[-->");
                  $$renderer5.push(`<div class="mt-3 flex gap-2">`);
                  Button($$renderer5, {
                    size: "sm",
                    variant: "outline",
                    onclick: useSuggestion,
                    children: ($$renderer6) => {
                      $$renderer6.push(`<!---->Use Suggestion`);
                    },
                    $$slots: { default: true }
                  });
                  $$renderer5.push(`<!----> `);
                  Button($$renderer5, {
                    size: "sm",
                    variant: "ghost",
                    onclick: keepOriginal,
                    children: ($$renderer6) => {
                      $$renderer6.push(`<!---->Keep Mine`);
                    },
                    $$slots: { default: true }
                  });
                  $$renderer5.push(`<!----></div>`);
                } else {
                  $$renderer5.push("<!--[!-->");
                }
                $$renderer5.push(`<!--]--></div>`);
              } else {
                $$renderer5.push("<!--[!-->");
              }
              $$renderer5.push(`<!--]--> `);
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
                    onclick: () => {
                      dialogOpen = false;
                      resetForm();
                    },
                    children: ($$renderer7) => {
                      $$renderer7.push(`<!---->Cancel`);
                    },
                    $$slots: { default: true }
                  });
                  $$renderer6.push(`<!----> `);
                  if (!showVerification) {
                    $$renderer6.push("<!--[-->");
                    Button($$renderer6, {
                      variant: "secondary",
                      onclick: verifyTranslation,
                      disabled: verifying || !english.trim() || !translation.trim(),
                      children: ($$renderer7) => {
                        $$renderer7.push(`<!---->${escape_html(verifying ? "Checking..." : "Check Spelling")}`);
                      },
                      $$slots: { default: true }
                    });
                  } else {
                    $$renderer6.push("<!--[!-->");
                  }
                  $$renderer6.push(`<!--]--> `);
                  Button($$renderer6, {
                    onclick: createPhrase,
                    disabled: creating || !english.trim() || !translation.trim(),
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
      $$renderer3.push(`<!----></div> <div><h2 class="text-4xl sm:text-5xl">Phrases</h2></div> <div class="space-y-4">`);
      if (sessionData.isLoading) {
        $$renderer3.push("<!--[-->");
        $$renderer3.push(`<p class="text-muted-foreground">Loading phrases...</p>`);
      } else {
        $$renderer3.push("<!--[!-->");
        if (sessionData.error) {
          $$renderer3.push("<!--[-->");
          $$renderer3.push(`<p class="text-destructive">Error loading phrases: ${escape_html(sessionData.error.message)}</p>`);
        } else {
          $$renderer3.push("<!--[!-->");
          if (!phrases || phrases.length === 0) {
            $$renderer3.push("<!--[-->");
            $$renderer3.push(`<p class="text-muted-foreground">No phrases yet. Add your first phrase!</p>`);
          } else {
            $$renderer3.push("<!--[!-->");
            $$renderer3.push(`<!--[-->`);
            const each_array = ensure_array_like(phrases);
            for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
              let phrase = each_array[$$index];
              $$renderer3.push(`<!---->`);
              Card?.($$renderer3, {
                class: "border border-border/60 bg-background/85 backdrop-blur-sm",
                children: ($$renderer4) => {
                  $$renderer4.push(`<!---->`);
                  Card_header?.($$renderer4, {
                    class: "flex flex-row items-start justify-between gap-3",
                    children: ($$renderer5) => {
                      $$renderer5.push(`<div><!---->`);
                      Card_title?.($$renderer5, {
                        children: ($$renderer6) => {
                          $$renderer6.push(`<!---->${escape_html(phrase.english)}`);
                        },
                        $$slots: { default: true }
                      });
                      $$renderer5.push(`<!----> <!---->`);
                      Card_description?.($$renderer5, {
                        class: "text-primary",
                        children: ($$renderer6) => {
                          $$renderer6.push(`<!---->${escape_html(phrase.translation)}`);
                        },
                        $$slots: { default: true }
                      });
                      $$renderer5.push(`<!----></div> `);
                      Button($$renderer5, {
                        variant: "ghost",
                        size: "sm",
                        class: "text-destructive hover:text-destructive",
                        onclick: () => removePhrase(phrase._id),
                        children: ($$renderer6) => {
                          $$renderer6.push(`<!---->Delete`);
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
            }
            $$renderer3.push(`<!--]-->`);
          }
          $$renderer3.push(`<!--]-->`);
        }
        $$renderer3.push(`<!--]-->`);
      }
      $$renderer3.push(`<!--]--></div></div>`);
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
