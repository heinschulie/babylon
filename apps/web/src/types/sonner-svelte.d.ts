declare module 'sonner-svelte' {
  import { SvelteComponent } from 'svelte';

  export const toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
    warning: (message: string) => void;
  };

  export class Toaster extends SvelteComponent<{}, {}, {}> {}
}