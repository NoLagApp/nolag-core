<script setup lang="ts">
import { ref } from "vue";
import { importProject, type ImportedCredentials } from "../api";
import { STARTER_DOCUMENT } from "../starter";

/**
 * Creating a project means importing a document.
 *
 * Core has no partial-edit endpoint: import always creates, and never merges
 * into an existing project. The copy says so plainly rather than implying an
 * edit flow that does not exist.
 */
const emit = defineEmits<{
  (e: "imported", credentials: ImportedCredentials): void;
  (e: "cancel"): void;
}>();

const text = ref(JSON.stringify(STARTER_DOCUMENT, null, 2));
const problem = ref("");
const working = ref(false);

async function submit() {
  problem.value = "";

  let doc: unknown;
  try {
    doc = JSON.parse(text.value);
  } catch (error) {
    problem.value = `That is not valid JSON. ${
      error instanceof Error ? error.message : ""
    }`.trim();
    return;
  }

  working.value = true;
  try {
    emit("imported", await importProject(doc));
  } catch (error) {
    problem.value =
      error instanceof Error ? error.message : "Something went wrong.";
  } finally {
    working.value = false;
  }
}

function reset() {
  text.value = JSON.stringify(STARTER_DOCUMENT, null, 2);
  problem.value = "";
}
</script>

<template>
  <div class="stack import">
    <header>
      <h1 class="title">New project</h1>
      <p class="lede subtle">
        A project is one document: its apps, rooms, tenants and actors. Import
        always creates a new project, so this never overwrites an existing one.
        Editing an existing project means exporting it, changing it, and
        importing the result.
      </p>
    </header>

    <div class="panel">
      <div class="panel-head">
        <span class="eyebrow">Configuration document</span>
        <button class="ghost" @click="reset">Reset to the starter</button>
      </div>
      <div class="editor">
        <textarea
          v-model="text"
          rows="26"
          spellcheck="false"
          aria-label="Configuration document"
        ></textarea>
      </div>
    </div>

    <p v-if="problem" class="problem" role="alert">{{ problem }}</p>

    <div class="actions">
      <button class="ghost" @click="$emit('cancel')">Cancel</button>
      <button class="primary" :disabled="working" @click="submit">
        {{ working ? "Creating…" : "Create project" }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.import {
  padding: 22px 24px 60px;
  max-width: 900px;
}

.lede {
  font-family: var(--sans);
  font-size: 13px;
  margin: 10px 0 0;
  max-width: 66ch;
}

.editor {
  padding: 12px;
}

textarea {
  font-size: 12px;
  line-height: 1.6;
}

.problem {
  font-family: var(--sans);
  font-size: 12px;
  color: var(--danger);
  margin: 0;
  white-space: pre-line;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 720px) {
  .import {
    padding: 18px 14px 48px;
  }
}
</style>
