<script setup lang="ts">
/**
 * One topic address, segment by segment.
 *
 * This is the string the broker matches on and the thing the whole product
 * exists to compute, so it gets its own component and its own colour language.
 * A scope segment sits between the app and the room, which is why a scoped
 * address is four parts and an unscoped one is three.
 */
defineProps<{
  app: string;
  scope?: string | null;
  room: string;
  topic: string;
  /** Render the scope as a placeholder, for an address no actor holds yet. */
  scopePlaceholder?: boolean;
}>();
</script>

<template>
  <span class="address">
    <span class="seg-app">{{ app }}</span
    ><span class="slash">/</span
    ><template v-if="scope || scopePlaceholder"
      ><span class="seg-scope" :class="{ placeholder: scopePlaceholder }">{{
        scopePlaceholder ? "{scope}" : scope
      }}</span
      ><span class="slash">/</span></template
    ><span class="seg-room">{{ room }}</span
    ><span class="slash">/</span
    ><span class="seg-topic">{{ topic }}</span>
  </span>
</template>

<style scoped>
.address {
  font-family: var(--mono);
  white-space: nowrap;
}

.placeholder {
  opacity: 0.65;
  font-style: italic;
}
</style>
