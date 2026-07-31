<script lang="ts">
  // Static markup, but the block is required for svelte-check to type this component.
</script>

<header class="hero reveal">
  <div>
    <span class="eyebrow">3-week plan · slice → straight</span>
    <h1>Kill the <span class="swap">over-the-top</span>. Own your path.</h1>
    <p>Your fault is sequencing, not your hands — and you've already proven it. When you step into the shot, the slice vanishes. This plan rebuilds that same feeling with your feet planted, then locks it in before the trip.</p>
  </div>
  <svg class="flight" viewBox="0 0 340 400" role="img" aria-label="Ball-flight trace comparing the current slice with the target straight ball">
    <!-- target line -->
    <line x1="170" y1="356" x2="170" y2="46" stroke="#294A3A" stroke-width="1.5" stroke-dasharray="4 7"/>
    <!-- slice trace -->
    <path class="trace" style="--len:430" d="M170,356 C168,270 176,190 300,86" stroke="#E0533B" stroke-width="3"/>
    <!-- goal trace -->
    <path class="trace" style="--len:330" d="M170,356 C170,250 176,150 150,58" stroke="#EFC64B" stroke-width="3"/>
    <!-- tee ball -->
    <circle cx="170" cy="356" r="6" fill="#F4F2E9"/>
    <!-- labels -->
    <text x="300" y="78" fill="#E0533B" font-family="'Space Mono',monospace" font-size="12" text-anchor="middle">−6°/−10°</text>
    <text x="150" y="48" fill="#EFC64B" font-family="'Space Mono',monospace" font-size="12" text-anchor="middle">−2°/+2°</text>
    <text x="132" y="378" fill="#A9BEB0" font-family="'Space Mono',monospace" font-size="10.5">now</text>
    <text x="196" y="70" fill="#A9BEB0" font-family="'Space Mono',monospace" font-size="10.5">goal</text>
  </svg>
</header>

<style>
  .hero{
    display:grid;grid-template-columns:1.35fr .95fr;gap:40px;align-items:center;
    padding-bottom:56px;border-bottom:1px solid var(--line);
  }
  .hero h1{
    font-size:clamp(2.7rem,7vw,4.7rem);font-weight:800;margin:18px 0 22px;
  }
  .hero h1 .swap{color:var(--ball)}
  .hero p{color:var(--dim);font-size:1.08rem;max-width:46ch}
  .flight{width:100%;height:auto;display:block}
  .flight .trace{stroke-linecap:round;fill:none}

  @media (max-width:760px){
    .hero{grid-template-columns:1fr;gap:8px}
    .flight{max-width:300px;margin:8px auto 0}
  }
</style>
