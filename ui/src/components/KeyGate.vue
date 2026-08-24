<script setup lang="ts">
import { ref } from "vue";
import { coreUrl, listProjects, rememberKey } from "../api";
import NolagMark from "./NolagMark.vue";
import TopicAddress from "./TopicAddress.vue";

/**
 * The first screen, so it says what this is before it asks for anything.
 *
 * The sample address is the thesis: core exists to decide who may reach an
 * address like that one. Showing it here means the colour language is already
 * familiar by the time the first project loads.
 */
const emit = defineEmits<{ (e: "unlocked"): void }>();

const key = ref("");
const checking = ref(false);
const problem = ref("");

async function unlock() {
  if (!key.value.trim()) return;

  checking.value = true;
  problem.value = "";
  rememberKey(key.value.trim());

  try {
    await listProjects();
    emit("unlocked");
  } catch (error) {
    problem.value =
      error instanceof Error ? error.message : "Something went wrong.";
  } finally {
    checking.value = false;
  }
}
</script>

<template>
  <div class="gate">
    <div class="column">
      <section class="thesis">
        <span class="brand">
          <NolagMark :size="22" />
          <span class="eyebrow">nolag-core</span>
        </span>
        <h1 class="claim">May this actor reach this topic?</h1>
        <div class="sample">
          <TopicAddress app="chat" scope="acme" room="general" topic="messages" />
        </div>
        <p class="lede subtle">
          That is the whole job. Core holds the apps, rooms, tenants and actors,
          and answers the broker every time someone connects or subscribes.
        </p>
      </section>

      <form class="card panel" @submit.prevent="unlock">
        <label class="eyebrow" for="system-key">System key</label>
        <input
          id="system-key"
          v-model="key"
          type="password"
          autocomplete="off"
          spellcheck="false"
          placeholder="nlg_system_…"
        />
        <p class="hint faint">
          <code>NOLAG_SYSTEM_KEY</code> in your <code>.env</code>. It stays in
          this tab and is forgotten when you close it.
        </p>

        <p v-if="problem" class="problem" role="alert">{{ problem }}</p>

        <div class="actions">
          <span class="target faint">{{ coreUrl }}</span>
          <button class="primary" type="submit" :disabled="checking || !key">
            {{ checking ? "Checking…" : "Unlock" }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.gate {
  min-height: 100%;
  display: grid;
  place-items: center;
  padding: 32px 24px;
}

.column {
  width: min(560px, 100%);
}

.thesis {
  margin-bottom: 26px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 9px;
}

.claim {
  font-family: var(--sans);
  font-size: clamp(24px, 4.4vw, 33px);
  font-weight: 620;
  letter-spacing: -0.025em;
  line-height: 1.15;
  margin: 10px 0 20px;
  max-width: 18ch;
}

.sample {
  font-size: clamp(15px, 2.6vw, 19px);
  padding: 12px 0 14px;
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
  overflow-x: auto;
}

.lede {
  font-family: var(--sans);
  font-size: 13px;
  margin: 16px 0 0;
  max-width: 54ch;
}

.card {
  padding: 18px;
}

.card > .eyebrow {
  display: block;
  margin-bottom: 8px;
}

.hint {
  font-family: var(--sans);
  font-size: 12px;
  margin: 8px 0 0;
}

code {
  font-family: var(--mono);
  font-size: 11.5px;
  color: var(--muted);
}

.problem {
  font-family: var(--sans);
  font-size: 12px;
  color: var(--danger);
  margin: 10px 0 0;
  white-space: pre-line;
}

.actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
}

.target {
  font-size: 11px;
  word-break: break-all;
}
</style>
