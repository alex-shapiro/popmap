<script lang="ts">
  import type { GridCity } from "./PopMapGenerator";

  export let visible: boolean = false;
  export let x: number = 0;
  export let y: number = 0;
  export let city: GridCity;

  let tooltipElement: HTMLDivElement;

  $: if (tooltipElement) {
    tooltipElement.style.left = `${x + 15}px`;
    tooltipElement.style.top = `${y - 15}px`;

    if (visible) {
      tooltipElement.classList.add("visible");
    } else {
      tooltipElement.classList.remove("visible");
    }
  }
</script>

<div bind:this={tooltipElement} class="tooltip">
  <strong>{city.name}</strong>
  <div>Population: {city.population.toLocaleString()}</div>
  <div>Coordinates: {city.lat.toFixed(4)}°, {city.lng.toFixed(4)}°</div>
</div>

<style>
  .tooltip {
    position: absolute;
    background: linear-gradient(
      145deg,
      rgba(15, 15, 35, 0.95),
      rgba(26, 26, 46, 0.95)
    );
    color: white;
    padding: 15px 20px;
    border-radius: 12px;
    font-size: 14px;
    pointer-events: none;
    z-index: 1000;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
    border: 1px solid rgba(100, 181, 246, 0.3);
    backdrop-filter: blur(20px);
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .tooltip:global(.visible) {
    opacity: 1;
  }

  .tooltip :global(strong) {
    color: #64b5f6;
    font-size: 16px;
    display: block;
    margin-bottom: 8px;
  }
</style>
