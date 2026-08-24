<script lang="ts">
  import { DESTINATION_TAGS } from '../domain/destinations'
  import type { DestinationStatus } from '../domain/types'

  let { status }: { status: DestinationStatus } = $props()

  // Wording comes from `destinations.ts`, never restated here — the same rule that keeps drill
  // copy and the access labels out of markup. Rendered only when a mark exists: "no opinion" is
  // an absent key, so it has nothing to say and draws nothing.
</script>

<span class="mark" data-status={status}>{DESTINATION_TAGS[status]}</span>

<style>
  /* Colour is never the only signal — the tag always spells the mark out. See design.md §6.
     Nothing here is a fault, so `--flag` appears nowhere: `--ball` is the goal, and a course you
     intend to play is exactly that; `--home` is the one green that carries meaning rather than
     depth, which is what a round already behind you is. */
  .mark{
    font-family:'Space Mono',monospace;font-size:.58rem;letter-spacing:.12em;
    text-transform:uppercase;white-space:nowrap;
    padding:3px 8px;border-radius:100px;border:1px solid currentColor;
  }
  .mark[data-status='want']{color:var(--ball)}
  .mark[data-status='played']{color:var(--home)}
</style>
