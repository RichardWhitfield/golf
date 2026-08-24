<script lang="ts">
  import type { Access } from '../domain/courses'
  import { ACCESS_LABELS } from '../domain/destinations'

  let { access }: { access: Access } = $props()

  // Wording comes from `destinations.ts`, never restated here — the same rule that keeps drill
  // copy out of markup. `unknown` is a real answer and must never round to members-only.
</script>

<span class="access" class:unknown={access === 'unknown'} data-access={access}>
  {ACCESS_LABELS[access]}
</span>

<style>
  .access{
    font-family:'Space Mono',monospace;font-size:.62rem;letter-spacing:.08em;
    text-transform:uppercase;white-space:nowrap;
    padding:4px 10px;border-radius:100px;border:1px solid currentColor;
  }
  /* Colour is never the only signal — the label always spells the state out. See design.md §6. */
  .access[data-access='public']{color:var(--access-public)}
  .access[data-access='limited']{color:var(--access-limited)}
  .access[data-access='members']{color:var(--access-members)}
  /* Off the ramp on purpose. Dashed and dim reads as "not established", not as a fourth grade. */
  .access.unknown{color:var(--dim);border-style:dashed}
</style>
