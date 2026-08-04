<script lang="ts">
  import AidsSection from '../lib/components/AidsSection.svelte'
  import ArcSection from '../lib/components/ArcSection.svelte'
  import DrillsSection from '../lib/components/DrillsSection.svelte'
  import Hero from '../lib/components/Hero.svelte'
  import KpiBand from '../lib/components/KpiBand.svelte'
  import OneIdea from '../lib/components/OneIdea.svelte'
  import SiteFooter from '../lib/components/SiteFooter.svelte'
  import TodayPanel from '../lib/components/TodayPanel.svelte'
  import WatchOuts from '../lib/components/WatchOuts.svelte'
  import WeekSection from '../lib/components/WeekSection.svelte'
</script>

<!-- No wrapper element. `.wrap` is a flex column at <=760px and `.today` uses `order:-1` to
     float above the hero; a container here would make that silently do nothing. -->
<Hero />
<TodayPanel />
<KpiBand />
<OneIdea />
<DrillsSection />
<WeekSection />
<ArcSection />
<AidsSection />
<WatchOuts />
<SiteFooter />
