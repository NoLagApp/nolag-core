<script setup lang="ts">
import TopicAddress from "./TopicAddress.vue";

/**
 * The hero of a project page.
 *
 * Rather than counting things, it shows the one concrete address this project
 * makes available and names each segment underneath. A person who reads this
 * once can parse every other address in the interface, including the fact that
 * a scoped address has an extra part.
 */
defineProps<{
  app: string;
  scope?: string | null;
  room: string;
  topic: string;
}>();
</script>

<template>
  <div class="anatomy panel">
    <div class="panel-head">
      <span class="eyebrow">Address</span>
      <span class="eyebrow">What the broker matches on</span>
    </div>

    <div class="body">
      <div class="line">
        <TopicAddress
          :app="app"
          :scope="scope"
          :room="room"
          :topic="topic"
          :scope-placeholder="!!scope"
        />
      </div>

      <dl class="legend">
        <div class="item">
          <dt class="seg-app">app</dt>
          <dd>Which application</dd>
        </div>
        <div v-if="scope" class="item">
          <dt class="seg-scope">scope</dt>
          <dd>Which tenant, for actors bound to one</dd>
        </div>
        <div class="item">
          <dt class="seg-room">room</dt>
          <dd>Which conversation</dd>
        </div>
        <div class="item">
          <dt class="seg-topic">topic</dt>
          <dd>Which kind of message</dd>
        </div>
      </dl>

      <p v-if="scope" class="note subtle">
        Actors without a scope address the same room in three parts, with no
        scope segment. Two tenants using the same room name never meet.
      </p>
    </div>
  </div>
</template>

<style scoped>
.body {
  padding: 18px 14px 14px;
}

.line {
  font-size: 21px;
  letter-spacing: -0.01em;
  overflow-x: auto;
  padding-bottom: 6px;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 26px;
  margin: 14px 0 0;
}

.item {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

dt {
  font-family: var(--sans);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

dd {
  margin: 0;
  font-family: var(--sans);
  font-size: 12px;
  color: var(--muted);
}

.note {
  font-family: var(--sans);
  font-size: 12px;
  margin: 14px 0 0;
  max-width: 62ch;
}
</style>
