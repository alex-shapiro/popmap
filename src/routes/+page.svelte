<script lang="ts">
  import PopMap from "$lib/PopMap.svelte";
  import { cities } from "$lib/cities";
</script>

<div class="container">
  <h1>Population Map</h1>

  <PopMap {cities} width={1000} height={600} />
</div>

<style>
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }

  h1 {
    color: #ccc;
    margin-bottom: 2rem;
  }
</style>
