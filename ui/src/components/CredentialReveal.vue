<script setup lang="ts">
import { ref } from "vue";
import type { ImportedCredentials } from "../api";

/**
 * The one moment in this interface that cannot be repeated.
 *
 * Core stores hashes, so these secrets exist here and nowhere else. The panel
 * is deliberately loud and deliberately hard to dismiss by accident: there is
 * no close button in the corner, only a button that says what dismissing means.
 */
const props = defineProps<{ credentials: ImportedCredentials }>();
defineEmits<{ (e: "done"): void }>();

const copied = ref("");

async function copy(label: string, value: string) {
  try {
    await navigator.clipboard.writeText(value);
    copied.value = label;
    setTimeout(() => {
      if (copied.value === label) copied.value = "";
    }, 1600);
  } catch {
    copied.value = "";
  }
}

function copyAll() {
  const lines = [
    ...props.credentials.actors.map((a) => `${a.ref}=${a.accessToken}`),
    ...props.credentials.signingKeys.map((k) => `${k.ref}=${k.signingKey}`),
  ];
  void copy("all", lines.join("\n"));
}
</script>

<template>
  <div class="reveal">
    <div class="head">
      <div>
        <span class="eyebrow">Shown once</span>
        <h2 class="title">Save these credentials now</h2>
        <p class="lede">
          Core keeps only their hashes. Close this and they are gone for good;
          the only way back is to import the project again, which mints new
          ones.
        </p>
      </div>
      <button class="ghost" @click="copyAll">
        {{ copied === "all" ? "Copied" : "Copy all" }}
      </button>
    </div>

    <div class="group" v-if="credentials.actors.length">
      <span class="eyebrow">Actor access tokens</span>
      <div
        v-for="actor in credentials.actors"
        :key="actor.keyId"
        class="credential"
      >
        <span class="ref">{{ actor.ref }}</span>
        <code class="secret">{{ actor.accessToken }}</code>
        <button class="ghost" @click="copy(actor.ref, actor.accessToken)">
          {{ copied === actor.ref ? "Copied" : "Copy" }}
        </button>
      </div>
    </div>

    <div class="group" v-if="credentials.signingKeys.length">
      <span class="eyebrow">Signing keys, for browser client tokens</span>
      <div
        v-for="key in credentials.signingKeys"
        :key="key.keyId"
        class="credential"
      >
        <span class="ref">{{ key.ref }}</span>
        <code class="secret">{{ key.signingKey }}</code>
        <button class="ghost" @click="copy(key.ref, key.signingKey)">
          {{ copied === key.ref ? "Copied" : "Copy" }}
        </button>
      </div>
    </div>

    <button class="primary confirm" @click="$emit('done')">
      I have saved them
    </button>
  </div>
</template>

<style scoped>
.reveal {
  background: var(--panel-2);
  border: 1px solid var(--seg-scope);
  border-radius: 4px;
  padding: 20px;
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.title {
  margin: 8px 0 8px;
}

.lede {
  font-family: var(--sans);
  font-size: 13px;
  color: var(--muted);
  margin: 0;
  max-width: 60ch;
}

.group {
  margin-bottom: 18px;
}

.group > .eyebrow {
  display: block;
  margin-bottom: 8px;
}

.credential {
  display: grid;
  grid-template-columns: minmax(90px, auto) 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 7px 0;
  border-top: 1px solid var(--rule-soft);
}

.ref {
  color: var(--muted);
}

.secret {
  font-family: var(--mono);
  font-size: 12px;
  word-break: break-all;
  user-select: all;
}

.confirm {
  width: 100%;
}

@media (max-width: 640px) {
  .credential {
    grid-template-columns: 1fr auto;
  }

  .secret {
    grid-column: 1 / -1;
  }
}
</style>
