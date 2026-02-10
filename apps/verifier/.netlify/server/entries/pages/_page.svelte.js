import { e as ensure_array_like, a as attr } from "../../chunks/index2.js";
import "@sveltejs/kit/internal";
import "../../chunks/exports.js";
import "../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../chunks/state.svelte.js";
import { componentsGeneric, anyApi } from "convex/server";
import { u as useConvexClient, a as useQuery } from "../../chunks/auth.js";
import { B as Button } from "../../chunks/button.js";
import { C as Card, a as Card_content, b as Card_header, c as Card_title, L as Label, d as Card_description, I as Input } from "../../chunks/label.js";
import "clsx";
import { $ as escape_html } from "../../chunks/context.js";
const api = anyApi;
componentsGeneric();
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const client = useConvexClient();
    const supportedLanguages = useQuery(api.verifierAccess.listSupportedLanguages, {});
    const verifierState = useQuery(api.verifierAccess.getMyVerifierState, {});
    let selectedLanguage = "xh-ZA";
    let onboardingFirstName = "";
    let onboardingImageUrl = "";
    let onboardingSaving = false;
    let queueMessage = null;
    let queueError = null;
    let claimTick = Date.now();
    let lastAutoClaimSignal = "";
    let claiming = false;
    let releasing = false;
    let submitting = false;
    let scores = { soundAccuracy: 3, rhythmIntonation: 3, phraseAccuracy: 3 };
    let recorder = null;
    let recording = false;
    let audioChunks = [];
    let exemplarAudioBlob = null;
    let exemplarAudioUrl = null;
    let exemplarDurationMs = 0;
    let recorderError = "";
    const currentClaim = useQuery(api.humanReviews.getCurrentClaim, () => ({ languageCode: selectedLanguage }));
    const queueSignal = useQuery(api.humanReviews.getQueueSignal, () => ({ languageCode: selectedLanguage }));
    const escalated = useQuery(api.humanReviews.listEscalated, () => ({ languageCode: selectedLanguage }));
    const canReviewLanguage = !!verifierState.data?.languages.find((language) => language.languageCode === selectedLanguage && language.active);
    const activeClaim = currentClaim.data ?? null;
    const remainingMs = activeClaim?.claimDeadlineAt ? Math.max(activeClaim.claimDeadlineAt - claimTick, 0) : 0;
    const pendingCount = queueSignal.data?.pendingCount ?? 0;
    function formatTimer(ms) {
      const totalSeconds = Math.floor(ms / 1e3);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    }
    const recorderMimeCandidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus"
    ];
    function getPreferredRecorderMimeType() {
      if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
        return "";
      }
      return recorderMimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
    }
    const timerText = formatTimer(remainingMs);
    async function saveOnboarding() {
      if (!onboardingFirstName.trim()) {
        queueError = "Please enter a first name.";
        return;
      }
      onboardingSaving = true;
      queueError = null;
      try {
        await client.mutation(api.verifierAccess.upsertMyProfile, {
          firstName: onboardingFirstName.trim(),
          profileImageUrl: onboardingImageUrl.trim() || void 0
        });
        await client.mutation(api.verifierAccess.setMyLanguageActive, { languageCode: selectedLanguage, active: true });
        queueMessage = "Verifier profile activated.";
      } catch (error) {
        queueError = error instanceof Error ? error.message : "Failed to activate verifier profile.";
      } finally {
        onboardingSaving = false;
      }
    }
    async function claimNext(silent = false) {
      claiming = true;
      if (!silent) {
        queueMessage = null;
        queueError = null;
      }
      try {
        const assignment = await client.mutation(api.humanReviews.claimNext, { languageCode: selectedLanguage });
        if (assignment) {
          lastAutoClaimSignal = "";
        }
        if (!assignment && !silent) {
          queueMessage = "No pending learner attempts right now.";
        }
      } catch (error) {
        if (!silent) {
          queueError = error instanceof Error ? error.message : "Unable to claim next request.";
        }
      } finally {
        claiming = false;
      }
    }
    async function releaseClaim() {
      if (!activeClaim) return;
      releasing = true;
      queueError = null;
      try {
        await client.mutation(api.humanReviews.releaseClaim, { requestId: activeClaim.requestId });
        lastAutoClaimSignal = "";
        discardRecording();
        queueMessage = "Claim released back to the top of queue.";
      } catch (error) {
        queueError = error instanceof Error ? error.message : "Failed to release claim.";
      } finally {
        releasing = false;
      }
    }
    async function startRecording() {
      recorderError = "";
      audioChunks = [];
      exemplarAudioBlob = null;
      exemplarAudioUrl = null;
      exemplarDurationMs = 0;
      if (!navigator.mediaDevices?.getUserMedia) {
        recorderError = "Audio recording not supported in this browser.";
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const preferredMimeType = getPreferredRecorderMimeType();
        const mediaRecorder = preferredMimeType ? new MediaRecorder(stream, { mimeType: preferredMimeType }) : new MediaRecorder(stream);
        recorder = mediaRecorder;
        const startTime = Date.now();
        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            audioChunks = [...audioChunks, event.data];
          }
        };
        mediaRecorder.onstop = () => {
          const blobMimeType = mediaRecorder.mimeType || audioChunks[0]?.type || "audio/webm";
          const blob = new Blob(audioChunks, { type: blobMimeType });
          exemplarAudioBlob = blob;
          exemplarAudioUrl = URL.createObjectURL(blob);
          exemplarDurationMs = Date.now() - startTime;
          stream.getTracks().forEach((track) => track.stop());
        };
        mediaRecorder.start();
        recording = true;
      } catch (error) {
        recorderError = error instanceof Error ? error.message : "Failed to start recording.";
      }
    }
    function stopRecording() {
      if (!recorder || recorder.state !== "recording") {
        return;
      }
      recorder.stop();
      recording = false;
    }
    function discardRecording() {
      audioChunks = [];
      exemplarAudioBlob = null;
      exemplarAudioUrl = null;
      exemplarDurationMs = 0;
    }
    async function submitReview() {
      if (!activeClaim || !exemplarAudioBlob) {
        return;
      }
      submitting = true;
      queueError = null;
      queueMessage = null;
      try {
        const uploadUrl = await client.mutation(api.audioUploads.generateUploadUrlForVerifier, {});
        const uploadResponse = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": exemplarAudioBlob.type || "audio/webm" },
          body: exemplarAudioBlob
        });
        if (!uploadResponse.ok) {
          throw new Error("Failed to upload exemplar audio.");
        }
        const uploadResult = await uploadResponse.json();
        const storageId = uploadResult.storageId;
        const exemplarAudioAssetId = await client.mutation(api.audioAssets.create, {
          storageKey: storageId,
          contentType: exemplarAudioBlob.type || "audio/webm",
          attemptId: activeClaim.attemptId,
          durationMs: exemplarDurationMs
        });
        await client.mutation(api.humanReviews.submitReview, {
          requestId: activeClaim.requestId,
          soundAccuracy: scores.soundAccuracy,
          rhythmIntonation: scores.rhythmIntonation,
          phraseAccuracy: scores.phraseAccuracy,
          exemplarAudioAssetId
        });
        queueMessage = "Review submitted.";
        discardRecording();
        await claimNext();
      } catch (error) {
        queueError = error instanceof Error ? error.message : "Failed to submit review.";
      } finally {
        submitting = false;
      }
    }
    let $$settled = true;
    let $$inner_renderer;
    function $$render_inner($$renderer3) {
      $$renderer3.push(`<div class="page-shell page-shell--compact page-stack"><header class="page-stack"><div><p class="info-kicker">Two-Minute Review Cycles</p> <h1 class="text-5xl sm:text-6xl">Verifier Queue</h1> <p class="meta-text mt-3">Claim quickly, score clearly, and keep learner feedback moving.</p></div></header> `);
      if (queueError) {
        $$renderer3.push("<!--[-->");
        $$renderer3.push(`<div class="border border-destructive/50 bg-destructive/10 p-3 text-destructive">${escape_html(queueError)}</div>`);
      } else {
        $$renderer3.push("<!--[!-->");
      }
      $$renderer3.push(`<!--]--> `);
      if (queueMessage) {
        $$renderer3.push("<!--[-->");
        $$renderer3.push(`<div class="border border-primary/40 bg-primary/10 p-3 text-primary">${escape_html(queueMessage)}</div>`);
      } else {
        $$renderer3.push("<!--[!-->");
      }
      $$renderer3.push(`<!--]--> <!---->`);
      Card?.($$renderer3, {
        class: "border border-border/60 bg-background/85 backdrop-blur-sm",
        children: ($$renderer4) => {
          $$renderer4.push(`<!---->`);
          Card_content?.($$renderer4, {
            children: ($$renderer5) => {
              $$renderer5.push(`<div class="grid gap-4 sm:grid-cols-3"><div><p class="info-kicker">Pending</p> <p class="mt-2 text-4xl font-display">${escape_html(pendingCount)}</p></div> <div><p class="info-kicker">Escalated</p> <p class="mt-2 text-4xl font-display">${escape_html(escalated.data?.length ?? 0)}</p></div> <div><p class="info-kicker">Current Claim</p> <p class="mt-2 text-lg font-semibold">${escape_html(activeClaim ? timerText : "Idle")}</p> <p class="meta-text mt-1">${escape_html(activeClaim ? "Time remaining" : "Ready for auto-assign")}</p></div></div>`);
            },
            $$slots: { default: true }
          });
          $$renderer4.push(`<!---->`);
        },
        $$slots: { default: true }
      });
      $$renderer3.push(`<!----> <!---->`);
      Card?.($$renderer3, {
        class: "border border-border/60 bg-background/85 backdrop-blur-sm",
        children: ($$renderer4) => {
          $$renderer4.push(`<!---->`);
          Card_header?.($$renderer4, {
            children: ($$renderer5) => {
              $$renderer5.push(`<!---->`);
              Card_title?.($$renderer5, {
                children: ($$renderer6) => {
                  $$renderer6.push(`<!---->Language Team`);
                },
                $$slots: { default: true }
              });
              $$renderer5.push(`<!---->`);
            },
            $$slots: { default: true }
          });
          $$renderer4.push(`<!----> <!---->`);
          Card_content?.($$renderer4, {
            class: "space-y-3",
            children: ($$renderer5) => {
              $$renderer5.push(`<div class="space-y-2">`);
              Label($$renderer5, {
                for: "languageCode",
                children: ($$renderer6) => {
                  $$renderer6.push(`<!---->Language`);
                },
                $$slots: { default: true }
              });
              $$renderer5.push(`<!----> `);
              $$renderer5.select(
                {
                  id: "languageCode",
                  class: "w-full border border-input bg-background px-3 py-2.5 text-base",
                  value: selectedLanguage
                },
                ($$renderer6) => {
                  if (supportedLanguages.data) {
                    $$renderer6.push("<!--[-->");
                    $$renderer6.push(`<!--[-->`);
                    const each_array = ensure_array_like(supportedLanguages.data.filter((language) => language.code === "xh-ZA"));
                    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
                      let language = each_array[$$index];
                      $$renderer6.option({ value: language.code }, ($$renderer7) => {
                        $$renderer7.push(`${escape_html(language.displayName)} (${escape_html(language.code)})`);
                      });
                    }
                    $$renderer6.push(`<!--]-->`);
                  } else {
                    $$renderer6.push("<!--[!-->");
                  }
                  $$renderer6.push(`<!--]-->`);
                }
              );
              $$renderer5.push(`</div> `);
              if (verifierState.data?.profile) {
                $$renderer5.push("<!--[-->");
                $$renderer5.push(`<p class="meta-text">Active verifier: ${escape_html(verifierState.data.profile.firstName)}</p>`);
              } else {
                $$renderer5.push("<!--[!-->");
              }
              $$renderer5.push(`<!--]-->`);
            },
            $$slots: { default: true }
          });
          $$renderer4.push(`<!---->`);
        },
        $$slots: { default: true }
      });
      $$renderer3.push(`<!----> `);
      if (!verifierState.data?.profile || !canReviewLanguage) {
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
                    $$renderer6.push(`<!---->Activate Verifier Access`);
                  },
                  $$slots: { default: true }
                });
                $$renderer5.push(`<!----> <!---->`);
                Card_description?.($$renderer5, {
                  children: ($$renderer6) => {
                    $$renderer6.push(`<!---->Set your visible identity and join this language team.`);
                  },
                  $$slots: { default: true }
                });
                $$renderer5.push(`<!---->`);
              },
              $$slots: { default: true }
            });
            $$renderer4.push(`<!----> <!---->`);
            Card_content?.($$renderer4, {
              class: "space-y-3",
              children: ($$renderer5) => {
                $$renderer5.push(`<div class="space-y-2">`);
                Label($$renderer5, {
                  for: "firstName",
                  children: ($$renderer6) => {
                    $$renderer6.push(`<!---->First Name`);
                  },
                  $$slots: { default: true }
                });
                $$renderer5.push(`<!----> `);
                Input($$renderer5, {
                  id: "firstName",
                  placeholder: "e.g. Lwazi",
                  get value() {
                    return onboardingFirstName;
                  },
                  set value($$value) {
                    onboardingFirstName = $$value;
                    $$settled = false;
                  }
                });
                $$renderer5.push(`<!----></div> <div class="space-y-2">`);
                Label($$renderer5, {
                  for: "profileImage",
                  children: ($$renderer6) => {
                    $$renderer6.push(`<!---->Profile Image URL (optional)`);
                  },
                  $$slots: { default: true }
                });
                $$renderer5.push(`<!----> `);
                Input($$renderer5, {
                  id: "profileImage",
                  placeholder: "https://...",
                  get value() {
                    return onboardingImageUrl;
                  },
                  set value($$value) {
                    onboardingImageUrl = $$value;
                    $$settled = false;
                  }
                });
                $$renderer5.push(`<!----></div> `);
                Button($$renderer5, {
                  class: "w-full",
                  onclick: saveOnboarding,
                  disabled: onboardingSaving,
                  children: ($$renderer6) => {
                    $$renderer6.push(`<!---->${escape_html(onboardingSaving ? "Saving..." : "Activate")}`);
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
                    $$renderer6.push(`<!---->Queue Control`);
                  },
                  $$slots: { default: true }
                });
                $$renderer5.push(`<!----> <!---->`);
                Card_description?.($$renderer5, {
                  children: ($$renderer6) => {
                    $$renderer6.push(`<!---->Auto-assign the next learner attempt when you are ready.`);
                  },
                  $$slots: { default: true }
                });
                $$renderer5.push(`<!---->`);
              },
              $$slots: { default: true }
            });
            $$renderer4.push(`<!----> <!---->`);
            Card_content?.($$renderer4, {
              class: "space-y-3",
              children: ($$renderer5) => {
                Button($$renderer5, {
                  class: "w-full",
                  onclick: () => claimNext(false),
                  disabled: claiming || !!activeClaim,
                  size: "lg",
                  children: ($$renderer6) => {
                    $$renderer6.push(`<!---->${escape_html(claiming ? "Claiming..." : activeClaim ? "Claim Active" : "Auto-Assign Next")}`);
                  },
                  $$slots: { default: true }
                });
                $$renderer5.push(`<!----> `);
                if (activeClaim) {
                  $$renderer5.push("<!--[-->");
                  $$renderer5.push(`<div class="border border-orange-500/50 bg-orange-500/10 p-3 text-orange-700">Timer: ${escape_html(timerText)}</div>`);
                } else {
                  $$renderer5.push("<!--[!-->");
                }
                $$renderer5.push(`<!--]-->`);
              },
              $$slots: { default: true }
            });
            $$renderer4.push(`<!---->`);
          },
          $$slots: { default: true }
        });
        $$renderer3.push(`<!----> `);
        if (activeClaim) {
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
                      $$renderer6.push(`<!---->${escape_html(activeClaim.phase === "dispute" ? "Dispute Review" : "Learner Attempt")}`);
                    },
                    $$slots: { default: true }
                  });
                  $$renderer5.push(`<!----> <!---->`);
                  Card_description?.($$renderer5, {
                    children: ($$renderer6) => {
                      $$renderer6.push(`<!---->Claim ID: ${escape_html(activeClaim.requestId)}`);
                    },
                    $$slots: { default: true }
                  });
                  $$renderer5.push(`<!---->`);
                },
                $$slots: { default: true }
              });
              $$renderer4.push(`<!----> <!---->`);
              Card_content?.($$renderer4, {
                class: "space-y-4",
                children: ($$renderer5) => {
                  $$renderer5.push(`<div class="border border-border/50 bg-muted/40 p-3"><p class="info-kicker">Phrase</p> <p class="mt-1 font-semibold">${escape_html(activeClaim.phrase?.english)}</p> <p class="meta-text text-primary">${escape_html(activeClaim.phrase?.translation)}</p></div> `);
                  if (activeClaim.learnerAttempt.audioUrl) {
                    $$renderer5.push("<!--[-->");
                    $$renderer5.push(`<div class="border border-border/50 bg-muted/30 p-3"><p class="info-kicker mb-2">Learner Audio</p> <audio controls${attr("src", activeClaim.learnerAttempt.audioUrl)} class="audio-playback w-full"></audio></div>`);
                  } else {
                    $$renderer5.push("<!--[!-->");
                  }
                  $$renderer5.push(`<!--]--> `);
                  if (activeClaim.phase === "dispute" && activeClaim.originalReview) {
                    $$renderer5.push("<!--[-->");
                    $$renderer5.push(`<div class="border border-border/50 bg-background/70 p-3"><p class="info-kicker">Original Review</p> <p class="mt-1 font-semibold">${escape_html(activeClaim.originalReview.verifierFirstName)}</p> <p class="meta-text">Sound ${escape_html(activeClaim.originalReview.soundAccuracy)}/5
								• Rhythm ${escape_html(activeClaim.originalReview.rhythmIntonation)}/5
								• Phrase ${escape_html(activeClaim.originalReview.phraseAccuracy)}/5</p> <p class="meta-text mt-2">Additional checks complete: ${escape_html(activeClaim.disputeProgress?.completed ?? 0)}/2</p></div>`);
                  } else {
                    $$renderer5.push("<!--[!-->");
                  }
                  $$renderer5.push(`<!--]--> <div class="grid grid-cols-1 gap-3"><div class="space-y-2">`);
                  Label($$renderer5, {
                    for: "scoreSound",
                    children: ($$renderer6) => {
                      $$renderer6.push(`<!---->Sound Accuracy (1-5)`);
                    },
                    $$slots: { default: true }
                  });
                  $$renderer5.push(`<!----> `);
                  Input($$renderer5, {
                    id: "scoreSound",
                    type: "number",
                    min: "1",
                    max: "5",
                    get value() {
                      return scores.soundAccuracy;
                    },
                    set value($$value) {
                      scores.soundAccuracy = $$value;
                      $$settled = false;
                    }
                  });
                  $$renderer5.push(`<!----></div> <div class="space-y-2">`);
                  Label($$renderer5, {
                    for: "scoreRhythm",
                    children: ($$renderer6) => {
                      $$renderer6.push(`<!---->Rhythm &amp; Intonation (1-5)`);
                    },
                    $$slots: { default: true }
                  });
                  $$renderer5.push(`<!----> `);
                  Input($$renderer5, {
                    id: "scoreRhythm",
                    type: "number",
                    min: "1",
                    max: "5",
                    get value() {
                      return scores.rhythmIntonation;
                    },
                    set value($$value) {
                      scores.rhythmIntonation = $$value;
                      $$settled = false;
                    }
                  });
                  $$renderer5.push(`<!----></div> <div class="space-y-2">`);
                  Label($$renderer5, {
                    for: "scorePhrase",
                    children: ($$renderer6) => {
                      $$renderer6.push(`<!---->Phrase Accuracy (1-5)`);
                    },
                    $$slots: { default: true }
                  });
                  $$renderer5.push(`<!----> `);
                  Input($$renderer5, {
                    id: "scorePhrase",
                    type: "number",
                    min: "1",
                    max: "5",
                    get value() {
                      return scores.phraseAccuracy;
                    },
                    set value($$value) {
                      scores.phraseAccuracy = $$value;
                      $$settled = false;
                    }
                  });
                  $$renderer5.push(`<!----></div></div> <div class="border border-dashed p-3"><p class="meta-text">Record exemplar pronunciation</p> <div class="mt-3 flex flex-wrap gap-2">`);
                  if (!recording) {
                    $$renderer5.push("<!--[-->");
                    Button($$renderer5, {
                      size: "sm",
                      onclick: startRecording,
                      children: ($$renderer6) => {
                        $$renderer6.push(`<!---->Start Recording`);
                      },
                      $$slots: { default: true }
                    });
                  } else {
                    $$renderer5.push("<!--[!-->");
                    Button($$renderer5, {
                      size: "sm",
                      variant: "destructive",
                      onclick: stopRecording,
                      children: ($$renderer6) => {
                        $$renderer6.push(`<!---->Stop Recording`);
                      },
                      $$slots: { default: true }
                    });
                  }
                  $$renderer5.push(`<!--]--> `);
                  if (exemplarAudioUrl) {
                    $$renderer5.push("<!--[-->");
                    Button($$renderer5, {
                      size: "sm",
                      variant: "outline",
                      onclick: discardRecording,
                      children: ($$renderer6) => {
                        $$renderer6.push(`<!---->Discard`);
                      },
                      $$slots: { default: true }
                    });
                  } else {
                    $$renderer5.push("<!--[!-->");
                  }
                  $$renderer5.push(`<!--]--></div> `);
                  if (recorderError) {
                    $$renderer5.push("<!--[-->");
                    $$renderer5.push(`<p class="mt-2 text-destructive">${escape_html(recorderError)}</p>`);
                  } else {
                    $$renderer5.push("<!--[!-->");
                  }
                  $$renderer5.push(`<!--]--> `);
                  if (exemplarAudioUrl) {
                    $$renderer5.push("<!--[-->");
                    $$renderer5.push(`<div class="mt-3 space-y-2"><p class="meta-text">Duration: ${escape_html(Math.floor(exemplarDurationMs / 1e3))}s</p> <audio controls${attr("src", exemplarAudioUrl)} class="audio-playback w-full"></audio></div>`);
                  } else {
                    $$renderer5.push("<!--[!-->");
                  }
                  $$renderer5.push(`<!--]--></div> <div class="grid grid-cols-2 gap-2">`);
                  Button($$renderer5, {
                    variant: "outline",
                    onclick: releaseClaim,
                    disabled: releasing || submitting,
                    children: ($$renderer6) => {
                      $$renderer6.push(`<!---->${escape_html(releasing ? "Releasing..." : "Release")}`);
                    },
                    $$slots: { default: true }
                  });
                  $$renderer5.push(`<!----> `);
                  Button($$renderer5, {
                    onclick: submitReview,
                    disabled: submitting || !exemplarAudioBlob || remainingMs <= 0,
                    children: ($$renderer6) => {
                      $$renderer6.push(`<!---->${escape_html(submitting ? "Submitting..." : "Submit Review")}`);
                    },
                    $$slots: { default: true }
                  });
                  $$renderer5.push(`<!----></div>`);
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
        }
        $$renderer3.push(`<!--]-->`);
      }
      $$renderer3.push(`<!--]--></div>`);
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
