<script setup lang="ts">
import { computed, ref } from "vue";
import type { ProjectDoc, ProjectSummary } from "../api";
import { KRAKEN_URL } from "../api";
import AddressAnatomy from "./AddressAnatomy.vue";
import TopicAddress from "./TopicAddress.vue";

const props = defineProps<{
  summary: ProjectSummary;
  doc: ProjectDoc;
  busy?: boolean;
}>();

defineEmits<{ (e: "delete"): void }>();

const showRaw = ref(false);

const scopes = computed(() => props.doc.accessScopes ?? []);
const apps = computed(() => props.doc.apps ?? []);
const actors = computed(() => props.doc.actors ?? []);

/**
 * The address shown in the hero, taken from the first room of the first app.
 *
 * Topics come from the app and never from the room. A room may carry a topic
 * list, but authorization does not read it, so showing it here would advertise
 * addresses that do not resolve.
 */
const heroAddress = computed(() => {
  for (const app of apps.value) {
    const room = app.rooms?.[0];
    const topic = app.topics?.[0];
    if (room && topic) {
      return { app: app.slug, room: room.slug, topic };
    }
  }
  return null;
});

function addressesFor(app: (typeof apps.value)[number]) {
  const out: { room: string; topic: string }[] = [];
  for (const room of app.rooms ?? []) {
    for (const topic of app.topics ?? []) {
      out.push({ room: room.slug, topic });
    }
  }
  return out;
}

/**
 * The grants stored on an actor, app-wide ones first.
 *
 * These are only the explicit grants. Access to an open app is synthesised
 * during resolution and never stored, so an actor with no grants here can
 * still reach plenty; the empty state says so rather than implying the actor
 * can reach nothing.
 */
function grantsFor(actor: (typeof actors.value)[number]) {
  return [
    ...(actor.appAccess ?? []).map((g) => ({
      appSlug: g.appSlug,
      roomSlug: null as string | null,
      permission: g.permission,
    })),
    ...(actor.roomAccess ?? []).map((g) => ({
      appSlug: g.appSlug,
      roomSlug: g.roomSlug,
      permission: g.permission,
    })),
  ];
}

function privateTo(room: { typeGrants?: { actorType: string }[] }) {
  const grants = room.typeGrants ?? [];
  return grants.length ? grants.map((g) => g.actorType).join(", ") : null;
}

const rawJson = computed(() => JSON.stringify(props.doc, null, 2));

const copiedRaw = ref(false);
async function copyRaw() {
  try {
    await navigator.clipboard.writeText(rawJson.value);
    copiedRaw.value = true;
    setTimeout(() => (copiedRaw.value = false), 1600);
  } catch {
    copiedRaw.value = false;
  }
}
</script>

<template>
  <div class="stack detail">
    <header class="head">
      <div>
        <h1 class="title">{{ doc.project.name }}</h1>
        <p class="id">{{ summary.projectId }}</p>
        <p v-if="doc.project.description" class="desc subtle">
          {{ doc.project.description }}
        </p>
      </div>
      <button class="danger" :disabled="busy" @click="$emit('delete')">
        Delete project
      </button>
    </header>

    <AddressAnatomy
      v-if="heroAddress"
      :app="heroAddress.app"
      :room="heroAddress.room"
      :topic="heroAddress.topic"
      :scope="scopes[0]?.slug ?? null"
    />

    <!-- Apps -->
    <section v-for="app in apps" :key="app.slug" class="panel">
      <div class="panel-head">
        <span class="inline">
          <span class="seg-app app-name">{{ app.slug }}</span>
          <span class="faint">{{ app.name }}</span>
        </span>
        <span class="eyebrow">{{
          app.accessMode === "restricted"
            ? "Needs a grant"
            : "Open to every actor"
        }}</span>
      </div>

      <div v-if="!addressesFor(app).length" class="empty">
        No rooms yet, so nothing here can be addressed.
      </div>

      <div
        v-for="room in app.rooms ?? []"
        :key="room.slug"
        class="room row"
        :style="{ gridTemplateColumns: '1fr auto' }"
      >
        <div class="addresses">
          <div v-for="topic in app.topics" :key="topic" class="addr">
            <TopicAddress :app="app.slug" :room="room.slug" :topic="topic" />
          </div>
        </div>
        <span v-if="privateTo(room)" class="restricted eyebrow">
          {{ privateTo(room) }} only
        </span>
      </div>
    </section>

    <!-- Scopes -->
    <section v-if="scopes.length" class="panel">
      <div class="panel-head">
        <span class="eyebrow">Tenants</span>
        <span class="eyebrow">{{ scopes.length }}</span>
      </div>
      <div
        v-for="scope in scopes"
        :key="scope.slug"
        class="row"
        :style="{ gridTemplateColumns: 'minmax(120px, auto) 1fr' }"
      >
        <span class="seg-scope">{{ scope.slug }}</span>
        <span class="subtle sans">{{ scope.name }}</span>
      </div>
    </section>

    <!-- Actors -->
    <section class="panel">
      <div class="panel-head">
        <span class="eyebrow">Actors</span>
        <span class="eyebrow">{{ actors.length }}</span>
      </div>

      <div v-if="!actors.length" class="empty">
        No actors yet. Nothing can connect until one exists.
      </div>

      <div v-for="actor in actors" :key="actor.name" class="actor">
        <div class="actor-head">
          <span>{{ actor.name }}</span>
          <span class="inline">
            <span class="faint">{{ actor.actorType }}</span>
            <span v-if="actor.scopeSlug" class="seg-scope">{{
              actor.scopeSlug
            }}</span>
            <span v-else class="faint">no scope</span>
          </span>
        </div>

        <div v-if="grantsFor(actor).length" class="grants">
          <span
            v-for="(grant, i) in grantsFor(actor)"
            :key="i"
            class="grant"
          >
            <span class="seg-app">{{ grant.appSlug }}</span
            ><template v-if="grant.roomSlug"
              ><span class="slash">/</span
              ><span class="seg-room">{{ grant.roomSlug }}</span></template
            >
            <span class="permission faint">{{ grant.permission }}</span>
          </span>
        </div>
        <p v-else class="grants none faint">
          Reaches only what open apps allow
        </p>
      </div>
    </section>

    <!-- Connect -->
    <section class="panel">
      <div class="panel-head">
        <span class="eyebrow">Connect</span>
      </div>
      <div class="connect">
        <p class="sans subtle">
          Point a client at the broker with an actor's access token. Tokens are
          shown once, when the project is imported.
        </p>
        <pre><code>import &#123; NoLag &#125; from "@nolag/js-sdk";

const client = NoLag(accessToken, &#123; url: "{{ KRAKEN_URL }}" &#125;);
await client.connect();<template v-if="heroAddress">
client.subscribe("{{ heroAddress.app }}/{{ heroAddress.room }}/{{
            heroAddress.topic
          }}");</template></code></pre>
      </div>
    </section>

    <!-- Raw document -->
    <section class="panel">
      <div class="panel-head">
        <button class="ghost" @click="showRaw = !showRaw">
          {{ showRaw ? "Hide" : "Show" }} configuration document
        </button>
        <button v-if="showRaw" class="ghost" @click="copyRaw">
          {{ copiedRaw ? "Copied" : "Copy" }}
        </button>
      </div>
      <div v-if="showRaw" class="raw">
        <p class="sans subtle note">
          This is the whole project as one document, with no secrets in it. Keep
          it in version control, and import it anywhere to rebuild the project.
        </p>
        <pre><code>{{ rawJson }}</code></pre>
      </div>
    </section>
  </div>
</template>

<style scoped>
.detail {
  padding: 22px 24px 60px;
  max-width: 900px;
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.head .id {
  margin: 4px 0 0;
}

.desc {
  font-family: var(--sans);
  font-size: 13px;
  margin: 8px 0 0;
  max-width: 60ch;
}

.app-name {
  font-size: 14px;
}

.addresses {
  display: flex;
  flex-direction: column;
  gap: 3px;
  overflow-x: auto;
}

.restricted {
  color: var(--seg-scope);
  white-space: nowrap;
}

.sans {
  font-family: var(--sans);
  font-size: 12px;
}

.actor {
  padding: 9px 14px;
  border-bottom: 1px solid var(--rule-soft);
}

.actor:last-child {
  border-bottom: 0;
}

.actor-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
}

.grants {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin: 5px 0 0;
  font-size: 12px;
}

.grants.none {
  font-family: var(--sans);
  font-size: 12px;
}

.grant {
  display: inline-flex;
  align-items: baseline;
  gap: 7px;
}

.permission {
  font-family: var(--sans);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.connect {
  padding: 14px;
}

.connect p {
  margin: 0 0 12px;
  max-width: 62ch;
}

pre {
  margin: 0;
  padding: 12px;
  background: var(--ink);
  border: 1px solid var(--rule-soft);
  border-radius: 3px;
  overflow-x: auto;
  font-size: 12px;
  line-height: 1.6;
}

.raw {
  padding: 14px;
}

.raw .note {
  margin: 0 0 12px;
  max-width: 62ch;
}

.raw pre {
  max-height: 460px;
  overflow-y: auto;
}

@media (max-width: 720px) {
  .detail {
    padding: 18px 14px 48px;
  }

  .head {
    flex-direction: column;
  }
}
</style>
