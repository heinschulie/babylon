import { a as attr, e as ensure_array_like } from "../../../../../chunks/index2.js";
import { r as resolve } from "../../../../../chunks/utils2.js";
import { p as page } from "../../../../../chunks/index4.js";
import { a as api } from "../../../../../chunks/api.js";
import { C as Card } from "../../../../../chunks/card.js";
import { C as Card_content } from "../../../../../chunks/card-content.js";
import "clsx";
import { a as useQuery } from "../../../../../chunks/client.svelte.js";
import { $ as escape_html } from "../../../../../chunks/context.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const practiceSessionId = page.params.id;
    const sessionData = useQuery(api.attempts.listByPracticeSession, () => ({ practiceSessionId }));
    $$renderer2.push(`<div class="page-shell page-shell--narrow page-stack"><div class="page-stack"><a${attr("href", resolve("/practice"))} class="meta-text underline">← Back to Practice Sessions</a> <h1 class="text-5xl sm:text-6xl">Practice Session Detail</h1></div> `);
    if (sessionData.isLoading) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<p class="text-muted-foreground">Loading session...</p>`);
    } else {
      $$renderer2.push("<!--[!-->");
      if (sessionData.error) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<p class="text-destructive">${escape_html(sessionData.error.message)}</p>`);
      } else {
        $$renderer2.push("<!--[!-->");
        if (!sessionData.data) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<p class="text-muted-foreground">Session not found.</p>`);
        } else {
          $$renderer2.push("<!--[!-->");
          $$renderer2.push(`<!---->`);
          Card?.($$renderer2, {
            class: "border border-border/60 bg-background/85 backdrop-blur-sm",
            children: ($$renderer3) => {
              $$renderer3.push(`<!---->`);
              Card_content?.($$renderer3, {
                children: ($$renderer4) => {
                  $$renderer4.push(`<p class="text-sm">Started: ${escape_html(new Date(sessionData.data.practiceSession.startedAt).toLocaleString())}</p> <p class="meta-text">Ended:
					${escape_html(sessionData.data.practiceSession.endedAt ? new Date(sessionData.data.practiceSession.endedAt).toLocaleString() : "Still active")}</p> <p class="meta-text">Total attempts: ${escape_html(sessionData.data.attempts.length)}</p>`);
                },
                $$slots: { default: true }
              });
              $$renderer3.push(`<!---->`);
            },
            $$slots: { default: true }
          });
          $$renderer2.push(`<!----> <ul class="space-y-3"><!--[-->`);
          const each_array = ensure_array_like(sessionData.data.attempts);
          for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
            let attempt = each_array[$$index];
            $$renderer2.push(`<li class="border border-border/60 bg-background/70 p-4"><p class="meta-text">${escape_html(new Date(attempt.createdAt).toLocaleString())}</p> <p class="mt-1 font-semibold">${escape_html(attempt.phraseEnglish)}</p> <p class="meta-text text-primary">${escape_html(attempt.phraseTranslation)}</p> `);
            if (attempt.audioUrl) {
              $$renderer2.push("<!--[-->");
              $$renderer2.push(`<div class="mt-2"><p class="info-kicker mb-1">Learner Audio</p> <audio controls${attr("src", attempt.audioUrl)} class="audio-playback w-full"></audio></div>`);
            } else {
              $$renderer2.push("<!--[!-->");
            }
            $$renderer2.push(`<!--]--> `);
            if (attempt.feedbackText) {
              $$renderer2.push("<!--[-->");
              $$renderer2.push(`<p class="meta-text mt-2">${escape_html(attempt.feedbackText)}</p>`);
            } else {
              $$renderer2.push("<!--[!-->");
            }
            $$renderer2.push(`<!--]--> `);
            if (attempt.humanReview?.initialReview) {
              $$renderer2.push("<!--[-->");
              $$renderer2.push(`<div class="mt-3 border border-border/50 bg-muted/40 p-3 text-sm"><p class="font-semibold">Verifier: ${escape_html(attempt.humanReview.initialReview.verifierFirstName)}</p> <p class="meta-text mt-1">Sound ${escape_html(attempt.humanReview.initialReview.soundAccuracy)}/5 • Rhythm
								${escape_html(attempt.humanReview.initialReview.rhythmIntonation)}/5 • Phrase
								${escape_html(attempt.humanReview.initialReview.phraseAccuracy)}/5</p> `);
              if (attempt.humanReview.initialReview.audioUrl) {
                $$renderer2.push("<!--[-->");
                $$renderer2.push(`<div class="mt-2"><p class="info-kicker mb-1">Verifier Example</p> <audio controls${attr("src", attempt.humanReview.initialReview.audioUrl)} class="audio-playback w-full"></audio></div>`);
              } else {
                $$renderer2.push("<!--[!-->");
              }
              $$renderer2.push(`<!--]--></div>`);
            } else {
              $$renderer2.push("<!--[!-->");
            }
            $$renderer2.push(`<!--]--></li>`);
          }
          $$renderer2.push(`<!--]--></ul>`);
        }
        $$renderer2.push(`<!--]-->`);
      }
      $$renderer2.push(`<!--]-->`);
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
export {
  _page as default
};
