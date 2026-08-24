<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  coreUrl,
  deleteProject,
  exportProject,
  listProjects,
  type ImportedCredentials,
  type ProjectDoc,
  type ProjectSummary,
} from "./api";
import CredentialReveal from "./components/CredentialReveal.vue";
import ImportPanel from "./components/ImportPanel.vue";
import NolagMark from "./components/NolagMark.vue";
import ProjectDetail from "./components/ProjectDetail.vue";
import TopicAddress from "./components/TopicAddress.vue";

type View = "project" | "import";

const projects = ref<ProjectSummary[]>([]);
const selectedId = ref<string | null>(null);
const doc = ref<ProjectDoc | null>(null);
const view = ref<View>("project");
const credentials = ref<ImportedCredentials | null>(null);
const problem = ref("");
const busy = ref(false);
const loaded = ref(false);

const selected = computed(
  () => projects.value.find((p) => p.projectId === selectedId.value) ?? null,
);

onMounted(() => void refresh());

async function refresh() {
  problem.value = "";
  try {
    projects.value = await listProjects();
    if (!selectedId.value && projects.value.length) {
      await select(projects.value[0].projectId);
    }
  } catch (error) {
    problem.value = error instanceof Error ? error.message : "Cannot list.";
  } finally {
    loaded.value = true;
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
</script>

<template>
  <div class="shell">
    <header class="bar">
      <span class="brand">
        <NolagMark :size="17" />
        <span class="wordmark">nolag<span class="faint">-core</span></span>
      </span>
      <span class="eyebrow center">self-hosted</span>
      <span class="target faint">{{ coreUrl }}</span>
    </header>

    <div class="body">
      <nav class="rail">
        <div class="rail-head">
          <span class="eyebrow">Projects</span>
          <span class="eyebrow">{{ projects.length }}</span>
        </div>

        <p v-if="loaded && !projects.length" class="empty">
          Nothing here yet. Import a project to get started.
        </p>

        <button
          v-for="project in projects"
          :key="project.projectId"
          class="entry"
          :class="{
            active: project.projectId === selectedId && view === 'project',
          }"
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

        <!--
          The empty state carries the thesis, because it is the first thing a
          first-time reader sees and the address is what everything else here
          is about.
        -->
        <div v-else-if="loaded && !projects.length" class="blank">
          <h1 class="claim">May this actor reach this topic?</h1>
          <div class="sample">
            <TopicAddress
              app="chat"
              scope="acme"
              room="general"
              topic="messages"
            />
          </div>
          <p class="lede subtle">
            That is the whole job. Core holds the apps, rooms, tenants and
            actors, and answers the broker every time someone connects or
            subscribes.
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
  display: flex;
  align-items: center;
  gap: 8px;
}

/* The mark is the brand; the word is not orange as well. Saying "nolag-core"
 * rather than "NoLag" is deliberate: this is the authorization core, not the
 * hosted product, and the header should not imply otherwise. */
.wordmark {
  font-family: var(--sans);
  font-size: 13px;
  font-weight: 640;
  letter-spacing: -0.01em;
  color: var(--text);
}

.center {
  text-align: center;
}

.target {
  font-size: 11px;
  text-align: right;
  word-break: break-all;
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
  padding: 56px 24px;
  max-width: 560px;
}

.claim {
  font-family: var(--sans);
  font-size: clamp(24px, 4.4vw, 31px);
  font-weight: 620;
  letter-spacing: -0.025em;
  line-height: 1.15;
  margin: 0 0 20px;
  max-width: 18ch;
}

.sample {
  font-size: clamp(15px, 2.6vw, 18px);
  padding: 12px 0 14px;
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
  overflow-x: auto;
}

.lede {
  font-family: var(--sans);
  font-size: 13px;
  margin: 16px 0 22px;
  max-width: 54ch;
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

  .bar {
    grid-template-columns: 1fr auto;
  }

  .target {
    display: none;
  }
}
</style>
