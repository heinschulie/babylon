import { a as attr, e as ensure_array_like } from "../../../chunks/index2.js";
import { r as resolve } from "../../../chunks/utils2.js";
import { p as page, g as goto } from "../../../chunks/index4.js";
import { a as api } from "../../../chunks/api.js";
import { B as Button } from "../../../chunks/button.js";
import { C as Card } from "../../../chunks/card.js";
import { C as Card_content } from "../../../chunks/card-content.js";
import { C as Card_header, a as Card_title, b as Card_description } from "../../../chunks/card-title.js";
import { C as Card_footer } from "../../../chunks/card-footer.js";
import "clsx";
import "../../../chunks/auth.js";
import { u as useConvexClient, a as useQuery } from "../../../chunks/client.svelte.js";
import { $ as escape_html } from "../../../chunks/context.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const client = useConvexClient();
    const allPhrases = useQuery(api.phrases.listAllByUser, {});
    const practiceSessions = useQuery(api.practiceSessions.list, {});
    const activePracticeSessionId = page.url.searchParams.get("run") ?? null;
    const activePracticeSession = useQuery(api.practiceSessions.get, () => activePracticeSessionId ? { practiceSessionId: activePracticeSessionId } : "skip");
    let starting = false;
    useQuery(api.attempts.listByPhrase, () => "skip");
    async function startPracticeSession() {
      starting = true;
      try {
        const practiceSessionId = await client.mutation(api.practiceSessions.start, {});
        const practiceUrl = new URL(resolve("/practice"), window.location.origin);
        practiceUrl.searchParams.set("run", practiceSessionId);
        await goto(`${practiceUrl.pathname}${practiceUrl.search}`);
      } finally {
        starting = false;
      }
    }
    if (!activePracticeSessionId) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="page-shell page-shell--narrow page-stack"><header class="page-stack"><div><p class="info-kicker">On-the-Go Mode</p> <h1 class="text-5xl sm:text-6xl">Practice Sessions</h1> <p class="meta-text mt-3">Start a short run now, review details later. Primary action first, history second.</p></div> <!---->`);
      Card?.($$renderer2, {
        class: "border border-border/60 bg-background/85 backdrop-blur-sm",
        children: ($$renderer3) => {
          $$renderer3.push(`<!---->`);
          Card_content?.($$renderer3, {
            children: ($$renderer4) => {
              $$renderer4.push(`<div class="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end"><div class="space-y-2"><p class="info-kicker">Quick Start</p> <p class="text-xl font-semibold">${escape_html(allPhrases.data?.length ?? 0)} phrases ready to train</p> <p class="meta-text">Best results come from 5-10 minute daily sessions.</p></div> `);
              Button($$renderer4, {
                onclick: startPracticeSession,
                disabled: starting || !allPhrases.data || allPhrases.data.length === 0,
                size: "lg",
                class: "w-full sm:w-auto",
                children: ($$renderer5) => {
                  $$renderer5.push(`<!---->${escape_html(starting ? "Starting..." : "Start Session")}`);
                },
                $$slots: { default: true }
              });
              $$renderer4.push(`<!----></div>`);
            },
            $$slots: { default: true }
          });
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      });
      $$renderer2.push(`<!----></header> `);
      if (!allPhrases.data || allPhrases.data.length === 0) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<!---->`);
        Card?.($$renderer2, {
          class: "border border-border/60 bg-background/85 backdrop-blur-sm",
          children: ($$renderer3) => {
            $$renderer3.push(`<!---->`);
            Card_header?.($$renderer3, {
              children: ($$renderer4) => {
                $$renderer4.push(`<!---->`);
                Card_title?.($$renderer4, {
                  children: ($$renderer5) => {
                    $$renderer5.push(`<!---->No phrases yet`);
                  },
                  $$slots: { default: true }
                });
                $$renderer4.push(`<!----> <!---->`);
                Card_description?.($$renderer4, {
                  children: ($$renderer5) => {
                    $$renderer5.push(`<!---->Add phrases first, then come back to start practicing.`);
                  },
                  $$slots: { default: true }
                });
                $$renderer4.push(`<!---->`);
              },
              $$slots: { default: true }
            });
            $$renderer3.push(`<!----> <!---->`);
            Card_footer?.($$renderer3, {
              children: ($$renderer4) => {
                $$renderer4.push(`<a${attr("href", resolve("/"))} class="meta-text underline">Go to Phrase Library</a>`);
              },
              $$slots: { default: true }
            });
            $$renderer3.push(`<!---->`);
          },
          $$slots: { default: true }
        });
        $$renderer2.push(`<!---->`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> <!---->`);
      Card?.($$renderer2, {
        class: "border border-border/60 bg-background/85 backdrop-blur-sm",
        children: ($$renderer3) => {
          $$renderer3.push(`<!---->`);
          Card_header?.($$renderer3, {
            children: ($$renderer4) => {
              $$renderer4.push(`<!---->`);
              Card_title?.($$renderer4, {
                children: ($$renderer5) => {
                  $$renderer5.push(`<!---->Recent Sessions`);
                },
                $$slots: { default: true }
              });
              $$renderer4.push(`<!----> <!---->`);
              Card_description?.($$renderer4, {
                children: ($$renderer5) => {
                  $$renderer5.push(`<!---->Open prior sessions to replay attempts and review corrections.`);
                },
                $$slots: { default: true }
              });
              $$renderer4.push(`<!---->`);
            },
            $$slots: { default: true }
          });
          $$renderer3.push(`<!----> <!---->`);
          Card_content?.($$renderer3, {
            children: ($$renderer4) => {
              if (practiceSessions.isLoading) {
                $$renderer4.push("<!--[-->");
                $$renderer4.push(`<p class="meta-text">Loading sessions...</p>`);
              } else {
                $$renderer4.push("<!--[!-->");
                if (!practiceSessions.data || practiceSessions.data.length === 0) {
                  $$renderer4.push("<!--[-->");
                  $$renderer4.push(`<p class="meta-text">No practice sessions yet.</p>`);
                } else {
                  $$renderer4.push("<!--[!-->");
                  $$renderer4.push(`<ul class="space-y-3"><!--[-->`);
                  const each_array = ensure_array_like(practiceSessions.data);
                  for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
                    let session = each_array[$$index];
                    $$renderer4.push(`<li class="border border-border/60 bg-background/70 p-4"><div class="flex flex-wrap items-center justify-between gap-3"><div class="space-y-1"><p class="font-semibold">${escape_html(new Date(session.startedAt).toLocaleString())}</p> <p class="meta-text">Attempts: ${escape_html(session.attemptCount)} • Phrases: ${escape_html(session.phraseCount)}</p></div> <a${attr("href", resolve(`/practice/session/${session._id}`))} class="info-kicker text-primary underline">Open</a></div></li>`);
                  }
                  $$renderer4.push(`<!--]--></ul>`);
                }
                $$renderer4.push(`<!--]-->`);
              }
              $$renderer4.push(`<!--]-->`);
            },
            $$slots: { default: true }
          });
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      });
      $$renderer2.push(`<!----></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="page-shell page-shell--compact flex min-h-[80vh] flex-col items-center justify-center">`);
      if (allPhrases.isLoading || activePracticeSession.isLoading) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<p class="meta-text">Loading session...</p>`);
      } else {
        $$renderer2.push("<!--[!-->");
        if (!allPhrases.data || allPhrases.data.length === 0) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<!---->`);
          Card?.($$renderer2, {
            class: "w-full border border-border/60 bg-background/85 backdrop-blur-sm",
            children: ($$renderer3) => {
              $$renderer3.push(`<!---->`);
              Card_header?.($$renderer3, {
                class: "text-center",
                children: ($$renderer4) => {
                  $$renderer4.push(`<!---->`);
                  Card_title?.($$renderer4, {
                    class: "text-2xl",
                    children: ($$renderer5) => {
                      $$renderer5.push(`<!---->No Phrases Yet`);
                    },
                    $$slots: { default: true }
                  });
                  $$renderer4.push(`<!----> <!---->`);
                  Card_description?.($$renderer4, {
                    children: ($$renderer5) => {
                      $$renderer5.push(`<!---->Add phrases in your phrase library first.`);
                    },
                    $$slots: { default: true }
                  });
                  $$renderer4.push(`<!---->`);
                },
                $$slots: { default: true }
              });
              $$renderer3.push(`<!----> <!---->`);
              Card_footer?.($$renderer3, {
                class: "justify-center",
                children: ($$renderer4) => {
                  $$renderer4.push(`<a${attr("href", resolve("/"))} class="meta-text underline">Back to Phrase Library</a>`);
                },
                $$slots: { default: true }
              });
              $$renderer3.push(`<!---->`);
            },
            $$slots: { default: true }
          });
          $$renderer2.push(`<!---->`);
        } else {
          $$renderer2.push("<!--[!-->");
          {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]-->`);
        }
        $$renderer2.push(`<!--]-->`);
      }
      $$renderer2.push(`<!--]--></div>`);
    }
    $$renderer2.push(`<!--]-->`);
  });
}
export {
  _page as default
};
