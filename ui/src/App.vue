<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  deleteProject,
  exportProject,
  forgetKey,
  keyLabel,
  listProjects,
  storedKey,
  type ImportedCredentials,
  type ProjectDoc,
  type ProjectSummary,
} from "./api";
import CredentialReveal from "./components/CredentialReveal.vue";
import ImportPanel from "./components/ImportPanel.vue";
import KeyGate from "./components/KeyGate.vue";
import ProjectDetail from "./components/ProjectDetail.vue";

type View = "project" | "import";

const unlocked = ref(false);
const projects = ref<ProjectSummary[]>([]);
const selectedId = ref<string | null>(null);
const doc = ref<ProjectDoc | null>(null);
const view = ref<View>("project");
const credentials = ref<ImportedCredentials | null>(null);
const problem = ref("");
const busy = ref(false);

const selected = computed(
  () => projects.value.find((p) => p.projectId === selectedId.value) ?? null,
);

onMounted(() => {
  if (storedKey()) {
    void unlock();
  }
});

async function unlock() {
  unlocked.value = true;
  await refresh();
}

async function refresh() {
  problem.value = "";
  try {
    projects.value = await listProjects();
    if (!selectedId.value && projects.value.length) {
      await select(projects.value[0].projectId);
    }
  } catch (error) {
    problem.value = error instanceof Error ? error.message : "Cannot list.";
  }
}

async function select(projectId: string) {
  selectedId.value = projectId;
  view.value = "project";
  doc.value = null;
  problem.value = "";

  try {
    doc.value = await exportProject(projectId);
  } catch (error) {
    problem.value = error instanceof Error ? error.message : "Cannot load.";
  }
}

async function removeSelected() {
  const project = selected.value;
  if (!project) return;

  const confirmed = window.confirm(
    `Delete "${project.name}" and everything in it?\n\n` +
      `Every app, room, tenant, actor and signing key goes with it, and any ` +
      `client holding one of its tokens stops connecting. This cannot be ` +
      `undone.`,
  );
  if (!confirmed) return;

  busy.value = true;
  try {
    await deleteProject(project.projectId);
    selectedId.value = null;
    doc.value = null;
    await refresh();
  } catch (error) {
    problem.value = error instanceof Error ? error.message : "Cannot delete.";
  } finally {
    busy.value = false;
  }
}

async function onImported(minted: ImportedCredentials) {
  credentials.value = minted;
  await refresh();
  await select(minted.projectId);
}

function lock() {
  forgetKey();
  unlocked.value = false;
  projects.value = [];
  selectedId.value = null;
  doc.value = null;
  credentials.value = null;
}
</script>

<template>
  <KeyGate v-if="!unlocked" @unlocked="unlock" />

  <div v-else class="shell">
    <header class="bar">
      <span class="brand">
        <span class="mark">nolag</span><span class="faint">-core</span>
      </span>
      <span class="eyebrow center">self-hosted</span>
      <span class="inline">
        <span class="keyid faint">{{ keyLabel(storedKey()) }}</span>
        <button class="ghost" @click="lock">Lock</button>
      </span>
    </header>

    <div class="body">
      <nav class="rail">
        <div class="rail-head">
          <span class="eyebrow">Projects</span>
          <span class="eyebrow">{{ projects.length }}</span>
        </div>

        <p v-if="!projects.length" class="empty">
          Nothing here yet. Import a project to get started.
        </p>

        <button
          v-for="project in projects"
          :key="project.projectId"
          class="entry"
          :class="{ active: project.projectId === selectedId && view === 'project' }"
          @click="select(project.projectId)"
        >
          <span class="entry-name">{{ project.name }}</span>
          <span class="entry-id">{{ project.projectId.slice(0, 8) }}</span>
        </button>

        <button
          class="entry new"
          :class="{ active: view === 'import' }"
          @click="view = 'import'"
        >
          New project
        </button>
      </nav>

      <main class="content">
        <p v-if="problem" class="problem" role="alert">{{ problem }}</p>

        <div v-if="credentials" class="reveal-wrap">
          <CredentialReveal
            :credentials="credentials"
            @done="credentials = null"
          />
        </div>

        <ImportPanel
          v-if="view === 'import'"
          @imported="onImported"
          @cancel="view = 'project'"
        />

        <ProjectDetail
          v-else-if="selected && doc"
          :summary="selected"
          :doc="doc"
          :busy="busy"
          @delete="removeSelected"
        />

        <div v-else-if="!projects.length" class="blank">
          <h1 class="title">No projects yet</h1>
          <p class="subtle">
            A project holds the apps, rooms and actors this deployment will
            authorize. Import one to start.
          </p>
          <button class="primary" @click="view = 'import'">New project</button>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.bar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 16px;
  padding: 9px 16px;
  border-bottom: 1px solid var(--rule);
  background: var(--panel);
}

.brand {
  font-family: var(--sans);
  font-size: 13px;
  font-weight: 640;
  letter-spacing: -0.01em;
}

.mark {
  color: var(--accent);
}

.center {
  text-align: center;
}

.bar .inline {
  justify-content: flex-end;
}

.keyid {
  font-size: 11px;
}

.body {
  display: grid;
  grid-template-columns: 232px 1fr;
  flex: 1;
  min-height: 0;
}

.rail {
  border-right: 1px solid var(--rule);
  background: var(--panel);
  overflow-y: auto;
  padding-bottom: 16px;
}

.rail-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 12px 14px 8px;
}

.entry {
  display: block;
  width: 100%;
  text-align: left;
  background: transparent;
  border: 0;
  border-left: 2px solid transparent;
  border-radius: 0;
  padding: 7px 14px;
  font-family: var(--mono);
  font-size: 13px;
  font-weight: 400;
  color: var(--muted);
}

.entry:hover {
  color: var(--text);
  background: var(--panel-2);
}

.entry.active {
  color: var(--text);
  border-left-color: var(--accent);
  background: var(--panel-2);
}

.entry-name {
  display: block;
}

.entry-id {
  display: block;
  font-size: 11px;
  color: var(--faint);
}

.entry.new {
  margin-top: 10px;
  font-family: var(--sans);
  font-size: 12px;
  font-weight: 560;
  color: var(--accent);
}

.content {
  overflow-y: auto;
  min-width: 0;
}

.problem {
  font-family: var(--sans);
  font-size: 12px;
  color: var(--danger);
  margin: 0;
  padding: 14px 24px 0;
  white-space: pre-line;
}

.reveal-wrap {
  padding: 22px 24px 0;
  max-width: 900px;
}

.blank {
  padding: 60px 24px;
  max-width: 46ch;
}

.blank p {
  font-family: var(--sans);
  font-size: 13px;
  margin: 10px 0 20px;
}

@media (max-width: 720px) {
  .body {
    grid-template-columns: 1fr;
  }

  .rail {
    border-right: 0;
    border-bottom: 1px solid var(--rule);
    max-height: 190px;
  }
}
</style>
