import { a as attr, c as attr_class } from "../../../chunks/index2.js";
import { r as resolve } from "../../../chunks/utils2.js";
import { a as api } from "../../../chunks/api.js";
import { B as Button } from "../../../chunks/button.js";
import { C as Card } from "../../../chunks/card.js";
import { C as Card_content } from "../../../chunks/card-content.js";
import { C as Card_header, a as Card_title, b as Card_description } from "../../../chunks/card-title.js";
import { C as Card_footer } from "../../../chunks/card-footer.js";
import "clsx";
import { L as Label, I as Input } from "../../../chunks/label.js";
import { u as useConvexClient, a as useQuery } from "../../../chunks/client.svelte.js";
import { $ as escape_html } from "../../../chunks/context.js";
const VAPID_PUBLIC_KEY = "BAMUxEusHpgEXQMQFOYWAly4QkhiClgY9P6YpYa9vQo4ZdpUvLFD0MRvuD-4MO8sIpbEoF4gWMjOhc-BjKdHF2g";
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
async function requestNotificationPermission() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.warn("Push notifications not supported");
    return null;
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    console.warn("Notification permission denied");
    return null;
  }
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const existingSubscription = await registration.pushManager.getSubscription();
  if (existingSubscription) {
    await existingSubscription.unsubscribe();
  }
  const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey.buffer
  });
  return subscription;
}
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const client = useConvexClient();
    const preferences = useQuery(api.preferences.get, {});
    const billing = useQuery(api.billing.getStatus, {});
    let quietStart = 22;
    let quietEnd = 8;
    let perPhrase = 3;
    let timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    let saving = false;
    let saved = false;
    let enabling = false;
    let testing = false;
    let testResult = null;
    let billingLoading = false;
    let billingError = null;
    let devTierLoading = false;
    let devTierError = null;
    let devTierMessage = null;
    let notificationsEnabled = !!preferences.data?.pushSubscription;
    async function handleSave() {
      saving = true;
      saved = false;
      try {
        await updatePreferences();
        saved = true;
        setTimeout(() => saved = false, 2e3);
      } catch (e) {
        console.error("Failed to save preferences:", e);
      } finally {
        saving = false;
      }
    }
    async function updatePreferences() {
      await client.mutation(api.preferences.upsert, {
        quietHoursStart: quietStart,
        quietHoursEnd: quietEnd,
        notificationsPerPhrase: perPhrase,
        timeZone
      });
    }
    async function enableNotifications() {
      enabling = true;
      try {
        const subscription = await requestNotificationPermission();
        if (subscription) {
          await client.mutation(api.preferences.upsert, { pushSubscription: JSON.stringify(subscription.toJSON()) });
        }
      } catch (e) {
        console.error("Failed to enable notifications:", e);
      } finally {
        enabling = false;
      }
    }
    async function sendTestNotification() {
      testing = true;
      testResult = null;
      try {
        await client.action(api.notificationsNode.sendTest, {});
        testResult = { success: true, message: "Test notification sent!" };
      } catch (e) {
        testResult = {
          success: false,
          message: e instanceof Error ? e.message : "Failed to send test notification"
        };
      } finally {
        testing = false;
        setTimeout(() => testResult = null, 5e3);
      }
    }
    async function startCheckout(plan) {
      billingLoading = true;
      billingError = null;
      try {
        const checkout = await client.mutation(api.billing.createPayfastCheckout, { plan });
        const form = document.createElement("form");
        form.method = "POST";
        form.action = checkout.endpointUrl;
        const fields = checkout.fields;
        Object.entries(fields).forEach(([key, value]) => {
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = key;
          input.value = value;
          form.appendChild(input);
        });
        document.body.appendChild(form);
        form.submit();
        form.remove();
      } catch (e) {
        billingError = e instanceof Error ? e.message : "Failed to start checkout";
      } finally {
        billingLoading = false;
      }
    }
    async function setDevTier(tier) {
      devTierLoading = true;
      devTierError = null;
      devTierMessage = null;
      try {
        await client.mutation(api.billing.setMyTierForDev, { tier, resetDailyUsage: true });
        devTierMessage = `Switched to ${tier} tier (dev mode).`;
      } catch (e) {
        devTierError = e instanceof Error ? e.message : "Failed to switch dev tier";
      } finally {
        devTierLoading = false;
      }
    }
    let $$settled = true;
    let $$inner_renderer;
    function $$render_inner($$renderer3) {
      $$renderer3.push(`<div class="page-shell page-shell--narrow page-stack"><div class="page-stack"><a${attr("href", resolve("/"))} class="meta-text underline">← Back to phrase library</a> <p class="info-kicker">Keep Sessions Sustainable</p> <h1 class="text-5xl sm:text-6xl">Settings</h1></div> <!---->`);
      Card?.($$renderer3, {
        class: "border border-border/60 bg-background/85 backdrop-blur-sm",
        children: ($$renderer4) => {
          $$renderer4.push(`<!---->`);
          Card_header?.($$renderer4, {
            children: ($$renderer5) => {
              $$renderer5.push(`<!---->`);
              Card_title?.($$renderer5, {
                children: ($$renderer6) => {
                  $$renderer6.push(`<!---->Push Notifications`);
                },
                $$slots: { default: true }
              });
              $$renderer5.push(`<!----> <!---->`);
              Card_description?.($$renderer5, {
                children: ($$renderer6) => {
                  $$renderer6.push(`<!---->Enable push notifications to receive vocabulary reminders.`);
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
              if (notificationsEnabled) {
                $$renderer5.push("<!--[-->");
                $$renderer5.push(`<p class="text-green-600">Notifications are enabled!</p> <div class="flex items-center gap-4 flex-wrap">`);
                Button($$renderer5, {
                  onclick: sendTestNotification,
                  disabled: testing,
                  variant: "outline",
                  children: ($$renderer6) => {
                    $$renderer6.push(`<!---->${escape_html(testing ? "Sending..." : "Test Notification")}`);
                  },
                  $$slots: { default: true }
                });
                $$renderer5.push(`<!----> `);
                Button($$renderer5, {
                  onclick: enableNotifications,
                  disabled: enabling,
                  variant: "ghost",
                  size: "sm",
                  children: ($$renderer6) => {
                    $$renderer6.push(`<!---->${escape_html(enabling ? "Refreshing..." : "Refresh Subscription")}`);
                  },
                  $$slots: { default: true }
                });
                $$renderer5.push(`<!----> `);
                if (testResult) {
                  $$renderer5.push("<!--[-->");
                  $$renderer5.push(`<span${attr_class(testResult.success ? "text-green-600" : "text-destructive")}>${escape_html(testResult.message)}</span>`);
                } else {
                  $$renderer5.push("<!--[!-->");
                }
                $$renderer5.push(`<!--]--></div>`);
              } else {
                $$renderer5.push("<!--[!-->");
                Button($$renderer5, {
                  onclick: enableNotifications,
                  disabled: enabling,
                  children: ($$renderer6) => {
                    $$renderer6.push(`<!---->${escape_html(enabling ? "Enabling..." : "Enable Notifications")}`);
                  },
                  $$slots: { default: true }
                });
              }
              $$renderer5.push(`<!--]-->`);
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
                  $$renderer6.push(`<!---->Notification Preferences`);
                },
                $$slots: { default: true }
              });
              $$renderer5.push(`<!----> <!---->`);
              Card_description?.($$renderer5, {
                children: ($$renderer6) => {
                  $$renderer6.push(`<!---->Configure when and how you receive reminders.`);
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
              if (preferences.isLoading) {
                $$renderer5.push("<!--[-->");
                $$renderer5.push(`<p class="text-muted-foreground">Loading preferences...</p>`);
              } else {
                $$renderer5.push("<!--[!-->");
                if (preferences.error) {
                  $$renderer5.push("<!--[-->");
                  $$renderer5.push(`<p class="text-destructive">Error loading preferences</p>`);
                } else {
                  $$renderer5.push("<!--[!-->");
                  $$renderer5.push(`<div class="grid grid-cols-2 gap-4"><div class="space-y-2">`);
                  Label($$renderer5, {
                    for: "quietStart",
                    children: ($$renderer6) => {
                      $$renderer6.push(`<!---->Quiet Hours Start`);
                    },
                    $$slots: { default: true }
                  });
                  $$renderer5.push(`<!----> `);
                  Input($$renderer5, {
                    id: "quietStart",
                    type: "number",
                    min: "0",
                    max: "23",
                    placeholder: "22",
                    get value() {
                      return quietStart;
                    },
                    set value($$value) {
                      quietStart = $$value;
                      $$settled = false;
                    }
                  });
                  $$renderer5.push(`<!----> <p class="meta-text">Hour (0-23) when quiet hours begin</p></div> <div class="space-y-2">`);
                  Label($$renderer5, {
                    for: "quietEnd",
                    children: ($$renderer6) => {
                      $$renderer6.push(`<!---->Quiet Hours End`);
                    },
                    $$slots: { default: true }
                  });
                  $$renderer5.push(`<!----> `);
                  Input($$renderer5, {
                    id: "quietEnd",
                    type: "number",
                    min: "0",
                    max: "23",
                    placeholder: "8",
                    get value() {
                      return quietEnd;
                    },
                    set value($$value) {
                      quietEnd = $$value;
                      $$settled = false;
                    }
                  });
                  $$renderer5.push(`<!----> <p class="meta-text">Hour (0-23) when quiet hours end</p></div></div> <div class="space-y-2">`);
                  Label($$renderer5, {
                    for: "perPhrase",
                    children: ($$renderer6) => {
                      $$renderer6.push(`<!---->Notifications Per Phrase`);
                    },
                    $$slots: { default: true }
                  });
                  $$renderer5.push(`<!----> `);
                  Input($$renderer5, {
                    id: "perPhrase",
                    type: "number",
                    min: "1",
                    max: "10",
                    placeholder: "3",
                    get value() {
                      return perPhrase;
                    },
                    set value($$value) {
                      perPhrase = $$value;
                      $$settled = false;
                    }
                  });
                  $$renderer5.push(`<!----> <p class="meta-text">Number of reminder notifications per phrase per day</p></div>`);
                }
                $$renderer5.push(`<!--]-->`);
              }
              $$renderer5.push(`<!--]-->`);
            },
            $$slots: { default: true }
          });
          $$renderer4.push(`<!----> <!---->`);
          Card_footer?.($$renderer4, {
            class: "flex items-center gap-4",
            children: ($$renderer5) => {
              Button($$renderer5, {
                onclick: handleSave,
                disabled: preferences.isLoading || saving,
                children: ($$renderer6) => {
                  $$renderer6.push(`<!---->${escape_html(saving ? "Saving..." : "Save Settings")}`);
                },
                $$slots: { default: true }
              });
              $$renderer5.push(`<!----> `);
              if (saved) {
                $$renderer5.push("<!--[-->");
                $$renderer5.push(`<span class="text-green-600">Saved!</span>`);
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
                  $$renderer6.push(`<!---->Subscription`);
                },
                $$slots: { default: true }
              });
              $$renderer5.push(`<!----> <!---->`);
              Card_description?.($$renderer5, {
                children: ($$renderer6) => {
                  $$renderer6.push(`<!---->Manage your plan and daily recording minutes.`);
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
              if (billing.isLoading) {
                $$renderer5.push("<!--[-->");
                $$renderer5.push(`<p class="text-muted-foreground">Loading subscription...</p>`);
              } else {
                $$renderer5.push("<!--[!-->");
                if (billing.error) {
                  $$renderer5.push("<!--[-->");
                  $$renderer5.push(`<p class="text-destructive">Error loading subscription</p>`);
                } else {
                  $$renderer5.push("<!--[!-->");
                  $$renderer5.push(`<div class="flex flex-col gap-2"><p>Current tier: <span class="font-semibold capitalize">${escape_html(billing.data?.tier ?? "free")}</span></p> <p class="meta-text">Status: ${escape_html(billing.data?.status ?? "unknown")}</p> <p class="meta-text">Minutes used today: ${escape_html(billing.data?.minutesUsed?.toFixed(1) ?? "0.0")} / 
						${escape_html(billing.data?.minutesLimit ?? 0)}</p></div> <div class="flex flex-wrap gap-3">`);
                  Button($$renderer5, {
                    onclick: () => startCheckout("ai"),
                    disabled: billingLoading,
                    children: ($$renderer6) => {
                      $$renderer6.push(`<!---->${escape_html(billingLoading ? "Redirecting..." : "Upgrade to AI (R150/mo)")}`);
                    },
                    $$slots: { default: true }
                  });
                  $$renderer5.push(`<!----> `);
                  Button($$renderer5, {
                    onclick: () => startCheckout("pro"),
                    disabled: billingLoading,
                    variant: "outline",
                    children: ($$renderer6) => {
                      $$renderer6.push(`<!---->${escape_html(billingLoading ? "Redirecting..." : "Upgrade to Pro (R500/mo)")}`);
                    },
                    $$slots: { default: true }
                  });
                  $$renderer5.push(`<!----></div> `);
                  if (billingError) {
                    $$renderer5.push("<!--[-->");
                    $$renderer5.push(`<p class="text-destructive">${escape_html(billingError)}</p>`);
                  } else {
                    $$renderer5.push("<!--[!-->");
                  }
                  $$renderer5.push(`<!--]--> <div class="mt-4 border border-border/60 bg-muted/40 p-4"><p class="info-kicker">Dev Tier Switch</p> <p class="meta-text mt-2">Instantly switch your current user between \`free\`, \`ai\`, and \`pro\` without checkout.</p> `);
                  if (billing.data?.devToggleEnabled === false) {
                    $$renderer5.push("<!--[-->");
                    $$renderer5.push(`<p class="meta-text mt-2 text-orange-600">Backend toggle is currently disabled. Enable \`BILLING_DEV_TOGGLE=true\` in Convex env.</p>`);
                  } else {
                    $$renderer5.push("<!--[!-->");
                  }
                  $$renderer5.push(`<!--]--> <div class="mt-3 flex flex-wrap gap-2">`);
                  Button($$renderer5, {
                    size: "sm",
                    variant: billing.data?.tier === "free" ? "default" : "outline",
                    disabled: devTierLoading,
                    onclick: () => setDevTier("free"),
                    children: ($$renderer6) => {
                      $$renderer6.push(`<!---->Free`);
                    },
                    $$slots: { default: true }
                  });
                  $$renderer5.push(`<!----> `);
                  Button($$renderer5, {
                    size: "sm",
                    variant: billing.data?.tier === "ai" ? "default" : "outline",
                    disabled: devTierLoading,
                    onclick: () => setDevTier("ai"),
                    children: ($$renderer6) => {
                      $$renderer6.push(`<!---->AI`);
                    },
                    $$slots: { default: true }
                  });
                  $$renderer5.push(`<!----> `);
                  Button($$renderer5, {
                    size: "sm",
                    variant: billing.data?.tier === "pro" ? "default" : "outline",
                    disabled: devTierLoading,
                    onclick: () => setDevTier("pro"),
                    children: ($$renderer6) => {
                      $$renderer6.push(`<!---->Pro`);
                    },
                    $$slots: { default: true }
                  });
                  $$renderer5.push(`<!----></div> `);
                  if (devTierMessage) {
                    $$renderer5.push("<!--[-->");
                    $$renderer5.push(`<p class="meta-text mt-2 text-green-600">${escape_html(devTierMessage)}</p>`);
                  } else {
                    $$renderer5.push("<!--[!-->");
                  }
                  $$renderer5.push(`<!--]--> `);
                  if (devTierError) {
                    $$renderer5.push("<!--[-->");
                    $$renderer5.push(`<p class="meta-text mt-2 text-destructive">${escape_html(devTierError)}</p>`);
                  } else {
                    $$renderer5.push("<!--[!-->");
                  }
                  $$renderer5.push(`<!--]--></div>`);
                }
                $$renderer5.push(`<!--]-->`);
              }
              $$renderer5.push(`<!--]-->`);
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
