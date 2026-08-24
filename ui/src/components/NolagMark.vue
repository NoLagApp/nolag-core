<script setup lang="ts">
/**
 * The NoLag isotype.
 *
 * Inlined rather than fetched: the page ships under a strict CSP with no
 * external hosts, and a self-hosted admin surface should render the same
 * offline and on an airgapped network as it does anywhere else.
 *
 * The gradient id is namespaced because an SVG gradient id is global to the
 * document, and this mark appears more than once on some screens.
 */
withDefaults(defineProps<{ size?: number }>(), { size: 20 });
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 685 685"
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
    <path
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M342.5 685C531.658 685 685 531.658 685 342.5C685 153.342 531.658 0 342.5 0C153.342 0 0 153.342 0 342.5C0 377.768 5.33071 411.792 15.2303 443.808L129.544 329.495C125.813 322.538 123.697 314.586 123.697 306.14C123.697 278.807 145.855 256.649 173.188 256.649C200.521 256.649 222.679 278.807 222.679 306.14C222.679 333.473 200.521 355.631 173.188 355.631C164.911 355.631 157.108 353.599 150.252 350.006L26.1841 474.074C41.6234 511.149 63.3909 544.928 90.1379 574.062L381.446 282.754C370.932 267.997 364.748 249.942 364.748 230.443C364.748 180.6 405.153 140.194 454.996 140.194C504.839 140.194 545.244 180.6 545.244 230.443C545.244 280.285 504.839 320.691 454.996 320.691C435.101 320.691 416.71 314.253 401.792 303.348L110.594 594.546C139.736 621.373 173.542 643.211 210.658 658.704L382.883 486.479C376.942 476.907 373.512 465.613 373.512 453.519C373.512 418.95 401.535 390.927 436.104 390.927C470.672 390.927 498.695 418.95 498.695 453.519C498.695 488.087 470.672 516.11 436.104 516.11C424.191 516.11 413.055 512.782 403.576 507.005L240.902 669.68C273.003 679.637 307.125 685 342.5 685Z"
      fill="url(#nolag-mark-gradient)"
    />
    <defs>
      <linearGradient
        id="nolag-mark-gradient"
        x1="573.5"
        y1="89"
        x2="93.5"
        y2="570.5"
        gradientUnits="userSpaceOnUse"
      >
        <stop stop-color="#FFCB45" />
        <stop offset="1" stop-color="#FF5C00" />
      </linearGradient>
    </defs>
  </svg>
</template>
